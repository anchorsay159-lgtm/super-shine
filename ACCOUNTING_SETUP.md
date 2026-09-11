# Super Shine accounting module setup

This module is an adaptable SME accounting and management reporting system designed with reference to TFRS/IFRS principles. It is not a claim of TFRS or IFRS compliance. A qualified accountant must approve the chart of accounts, recognition rules, tax treatment, opening balances, cost policy, and report presentation before real use.

## Deploy the additive migration

1. Back up the Supabase database and test in a non-production project first.
2. Open Supabase Dashboard → SQL Editor.
3. Run `supabase/migrations/20260804_sme_accounting.sql` as one complete script.
4. Confirm the transaction finishes with no error. Do not run only part of the file.
5. Restart Expo so the admin bundle sees the new route: `npx.cmd expo start -c` (or `npx expo start -c` outside a restricted PowerShell policy).
6. Sign in with an existing owner/admin account and open `/admin/accounting`.

The migration does not change `place_order_v11`, order prices, customer checkout, payment methods, existing realtime channels, or historical operational rows. Existing profile admins are assigned the accounting `owner` role so current admin access is preserved.

## Verify the deployment

Run these read-only checks in SQL Editor:

```sql
select count(*) from public.accounting_accounts;
select template_name, recognition_trigger, version_number, active
from public.accounting_journal_templates order by template_name;
select public.get_accounting_dashboard(current_date, current_date);
```

Use the admin Accounting screen to create a draft expense and approve it. Confirm one event, one balanced journal, and no exception:

```sql
select idempotency_key, event_type, posting_status, error_message
from public.accounting_events order by created_at desc limit 10;

select e.journal_number, sum(l.debit) debit, sum(l.credit) credit
from public.accounting_journal_entries e
join public.accounting_journal_lines l on l.journal_entry_id=e.id
group by e.id order by e.created_at desc limit 10;
```

## Edit accounting rules

Open Admin → Accounting → Settings. Owners can activate/deactivate accounts, retire templates, add prospective service-cost versions, set monthly budgets, create draft tax versions, and assign accounting roles. For a changed journal mapping, insert a new template version with a later effective date; do not edit a version already used by a posted event. Template lines define debit/credit accounts and amount sources.

Automatic order recognition defaults to `delivered`. Change `accounting_settings.revenue_recognition_status` only after an accountant approves the policy. Failed or missing mappings are retained under Journals → Exception queue and can be retried after correction.

## Change tax settings

Tax is disabled by default and no VAT registration or rate is assumed. In Accounting → Settings, create a draft version with its effective date, pricing mode, taxable services, account mappings, display choice, and reason. Review the customer-price and invoice impact with a Thai tax professional before approving or activating it. Never rewrite a historical tax version.

## Roles

- `owner`: configuration, roles, approval, reversal, all reports.
- `admin`: limited accounting dashboard; operational permissions remain controlled by the existing profile role.
- `accountant`: expenses, inventory, receivables, journals, reports, exceptions.
- `cashier`: confirmed collections and invoice/receipt access.
- Customers and delivery users have no accounting policy and cannot call protected accounting RPCs.

## Browser documents

Invoices and receipts are separate records. The system creates an invoice at revenue recognition and a receipt only after a confirmed collection. Use “Print / Save PDF” in Receivables; the browser print dialog provides printing or Save as PDF and the action is recorded in reprint history.

## Production review checklist

- Approve opening balances and cut-over date.
- Approve whether revenue recognition is at delivery or completion.
- Map each service to the appropriate revenue account.
- Review advance, credit-sale, refund, direct-cost, and inventory templates.
- Decide FIFO or weighted-average inventory policy and document it.
- Select the inventory method before approving the first movement. Changing methods after movement history exists requires an accountant-approved cut-over rather than rewriting history.
- Verify service-cost estimates versus actual consumption.
- Confirm registration status and every tax/withholding rule.
- Test invoice/receipt wording and legal document requirements.
- Reconcile bank, cash, receivables, inventory and trial balance before go-live.
