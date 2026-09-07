-- Ledger guards and row-level security.
--
-- The application already refuses an unbalanced entry, a posting into a closed period, and a
-- cross-tenant read. This migration makes the database refuse them too, so a bug in one layer
-- cannot corrupt the books on its own.

-- ── 1. Every journal entry must balance ──────────────────────────────────────────────────
--
-- Deferred to commit, because lines are inserted one at a time and an entry is only expected
-- to balance once it is complete.

CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS TRIGGER AS $$
DECLARE
  v_entry_id UUID;
  v_debit    NUMERIC(18,4);
  v_credit   NUMERIC(18,4);
BEGIN
  v_entry_id := COALESCE(NEW."entryId", OLD."entryId");

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit, v_credit
    FROM journal_lines
   WHERE "entryId" = v_entry_id;

  -- An entry whose lines were all removed is a deleted entry, not an unbalanced one.
  IF v_debit = 0 AND v_credit = 0 THEN
    RETURN NULL;
  END IF;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Journal entry % does not balance: debits %, credits %, difference %',
      v_entry_id, v_debit, v_credit, v_debit - v_credit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();

-- A line is a debit or a credit, never both and never negative. The domain enforces this too;
-- here it is a wall rather than a rule.
ALTER TABLE journal_lines
  ADD CONSTRAINT journal_lines_single_sided
  CHECK (
    debit >= 0 AND credit >= 0
    AND NOT (debit > 0 AND credit > 0)
    AND (debit > 0 OR credit > 0)
  );

-- ── 2. Posted documents are immutable ────────────────────────────────────────────────────
--
-- A posted journal entry may only move to REVERSED, and its money never changes.

CREATE OR REPLACE FUNCTION protect_posted_entries() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    IF NEW.status NOT IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'A posted journal entry cannot return to %; reverse it instead.', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."totalDebit" <> OLD."totalDebit"
       OR NEW."totalCredit" <> OLD."totalCredit"
       OR NEW.date <> OLD.date THEN
      RAISE EXCEPTION 'A posted journal entry cannot be edited. Reverse it and post a correction.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION protect_posted_entries();

-- Deleting a posted entry is never correct; only a draft can be discarded.
CREATE OR REPLACE FUNCTION forbid_posted_delete() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Journal entry % is % and cannot be deleted. Reverse it instead.', OLD.number, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_no_delete
  BEFORE DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_posted_delete();

-- ── 3. Stock movements are append-only ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION forbid_movement_rewrite() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stock movements are append-only. Post a reversing movement instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The FIFO layer remainder is the one field that legitimately changes after insert.
  IF NEW.quantity <> OLD.quantity OR NEW."costAmount" <> OLD."costAmount"
     OR NEW."itemId" <> OLD."itemId" OR NEW."warehouseId" <> OLD."warehouseId" THEN
    RAISE EXCEPTION 'Stock movements are append-only. Post a reversing movement instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_movement_rewrite();

-- ── 4. The ZATCA chain cannot be rewritten ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION protect_zatca_chain() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.icv IS NOT NULL AND (NEW.icv IS DISTINCT FROM OLD.icv
       OR NEW.pih IS DISTINCT FROM OLD.pih
       OR NEW."invoiceHash" IS DISTINCT FROM OLD."invoiceHash") THEN
    RAISE EXCEPTION 'The ZATCA chain values of invoice % cannot be changed once assigned.', OLD.number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_chain_immutable
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION protect_zatca_chain();

-- The counter is unique per tenant, which is what makes a gap detectable.
CREATE UNIQUE INDEX invoices_tenant_icv_key ON invoices ("tenantId", icv) WHERE icv IS NOT NULL;

-- ── 5. Row-level security ────────────────────────────────────────────────────────────────
--
-- The application sets `app.tenant_id` on every connection checkout. The migration role owns
-- the tables and is therefore exempt; the runtime role is not.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nakhla_app') THEN
    CREATE ROLE nakhla_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO nakhla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nakhla_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nakhla_app;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenantId'
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)::uuid)
         WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END
$$;
