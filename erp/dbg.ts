import { buildProductionPosting, buildCashVariancePosting } from './src/lib/accounting/documents'
for (const r of [
  buildProductionPosting({ context: { tenantId: 't', branchId: 'b', date: new Date(), reference: 'PRD-1' }, componentsCost: '500', outputValue: '500' }),
  buildCashVariancePosting({ context: { tenantId: 't', branchId: 'b', date: new Date(), reference: 'POS-1' }, expected: '4500', counted: '4485' })!,
]) {
  console.log(r.source, JSON.stringify(r.lines.map(l => ({ role: l.role, d: String(l.debit ?? ''), c: String(l.credit ?? '') }))))
}
