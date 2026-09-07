-- The invoice hash is written when the invoice is signed, which happens after the counter and
-- the previous hash are claimed. The original trigger froze all three at once, which made
-- signing impossible. The rule that actually matters is narrower: the counter and the previous
-- hash never change, and the invoice hash may be written once and never rewritten.

CREATE OR REPLACE FUNCTION protect_zatca_chain() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.icv IS NOT NULL AND NEW.icv IS DISTINCT FROM OLD.icv THEN
    RAISE EXCEPTION 'The ZATCA counter value of invoice % cannot be changed once assigned.', OLD.number
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.pih IS NOT NULL AND NEW.pih IS DISTINCT FROM OLD.pih THEN
    RAISE EXCEPTION 'The previous invoice hash of invoice % cannot be changed once assigned.', OLD.number
      USING ERRCODE = 'check_violation';
  END IF;

  -- Writing the hash for the first time is the signing step; rewriting it would break the
  -- chain for every invoice issued after this one.
  IF OLD."invoiceHash" IS NOT NULL AND NEW."invoiceHash" IS DISTINCT FROM OLD."invoiceHash" THEN
    RAISE EXCEPTION 'The invoice hash of % cannot be changed once the invoice is signed.', OLD.number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
