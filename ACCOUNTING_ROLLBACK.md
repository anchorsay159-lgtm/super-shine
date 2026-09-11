# Accounting migration rollback

Migration: `20260804_sme_accounting.sql`

The migration is additive and leaves operational tables intact. Rollback removes the accounting module and all accounting history, so export and back up accounting tables first. Never roll it back after production posting without approval from the business owner and accountant.

Run the following as one transaction in a tested maintenance window:

```sql
begin;

drop trigger if exists orders_accounting_capture_v1 on public.orders;
drop trigger if exists orders_accounting_source_platform_v1 on public.orders;
drop trigger if exists accounting_inventory_method_cutover_v1 on public.accounting_settings;
drop function if exists public.accounting_capture_order();
drop function if exists public.accounting_stamp_order_platform();
drop function if exists public.get_accounting_dashboard(date,date);
drop function if exists public.approve_accounting_refund(uuid);
drop function if exists public.record_accounting_collection(uuid,numeric,text,text);
drop function if exists public.reverse_accounting_journal(uuid,text);
drop function if exists public.retry_accounting_event(uuid);
drop function if exists public.approve_inventory_movement(uuid);
drop function if exists public.approve_accounting_journal(uuid);
drop function if exists public.create_accounting_template_version(text,text,text,text,text,text,date,boolean,text);
drop function if exists public.approve_accounting_expense(uuid);
drop function if exists public.post_accounting_event(uuid);
drop function if exists public.accounting_materialize_documents(uuid);
drop function if exists public.enqueue_accounting_event(text,text,text,text,text,text,text,uuid,text,uuid,text,timestamptz,text,jsonb,uuid);
drop function if exists public.accounting_amount(jsonb,text);
drop function if exists public.accounting_audit_change() cascade;
drop function if exists public.protect_posted_accounting_records() cascade;
drop function if exists public.protect_accounting_inventory_method();

drop view if exists public.accounting_budget_actual_v;
drop view if exists public.accounting_inventory_v;
drop view if exists public.accounting_ar_ageing_v;
drop view if exists public.accounting_trial_balance_v;

drop table if exists public.accounting_reprint_history;
drop table if exists public.accounting_audit_log;
drop table if exists public.accounting_refunds;
drop table if exists public.accounting_receipts;
drop table if exists public.accounting_invoice_lines;
drop table if exists public.accounting_invoices;
drop table if exists public.accounting_budgets;
drop table if exists public.accounting_order_cost_snapshots;
drop table if exists public.accounting_service_cost_rules;
drop table if exists public.accounting_inventory_layers;
drop table if exists public.accounting_inventory_movements;
drop table if exists public.accounting_supplies;
drop table if exists public.accounting_expenses;
drop table if exists public.accounting_journal_lines;
drop table if exists public.accounting_journal_entries;
drop table if exists public.accounting_events;
drop table if exists public.accounting_journal_template_lines;
drop table if exists public.accounting_journal_templates;
drop table if exists public.accounting_tax_rules;
drop table if exists public.accounting_accounts;
drop table if exists public.accounting_settings;
drop table if exists public.accounting_staff_roles;

drop function if exists public.has_accounting_role(text[]);
drop function if exists public.accounting_request_platform();

alter table public.orders drop column if exists accounting_source_platform;
drop function if exists public.current_accounting_role();
drop sequence if exists public.accounting_receipt_number_seq;
drop sequence if exists public.accounting_invoice_number_seq;
drop sequence if exists public.accounting_journal_number_seq;

notify pgrst, 'reload schema';
commit;
```

After rollback, remove the Accounting navigation entry and route only if the application itself is also being rolled back. Orders, customers, services, checkout totals, payments, and existing operational reports remain in place.
