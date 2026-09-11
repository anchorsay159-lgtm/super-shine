begin;

-- Adaptable SME accounting and management reporting layer.
-- This migration is additive: operational order, payment and pricing logic is unchanged.

create sequence if not exists public.accounting_journal_number_seq start 1;
create sequence if not exists public.accounting_invoice_number_seq start 1;
create sequence if not exists public.accounting_receipt_number_seq start 1;

create table if not exists public.accounting_staff_roles (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  staff_role text not null check (staff_role in ('owner','admin','accountant','cashier')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.accounting_staff_roles (user_id, staff_role, created_by, updated_by)
select id, 'owner', id, id from public.profiles where role = 'admin'
on conflict (user_id) do nothing;

create or replace function public.current_accounting_role()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select staff_role from public.accounting_staff_roles where user_id = auth.uid() and active),
    (select case when role = 'admin' then 'owner' end from public.profiles where id = auth.uid())
  );
$$;

create or replace function public.has_accounting_role(p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.current_accounting_role() = any(p_roles), false);
$$;

create or replace function public.accounting_request_platform()
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_headers jsonb; v_platform text;
begin
  begin v_headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then v_headers := '{}'::jsonb; end;
  v_platform := v_headers->>'x-super-shine-platform';
  if v_platform='customer_web' and public.is_admin() then return 'admin_web'; end if;
  if v_platform in ('android','ios','customer_web','admin_web') then return v_platform; end if;
  return 'database';
end; $$;

-- Preserve where an operational order originated without changing place_order_v11.
-- Existing orders are explicitly classified as historical database records.
alter table public.orders add column if not exists accounting_source_platform text not null default 'database'
  check (accounting_source_platform in ('android','ios','customer_web','admin_web','database'));

create or replace function public.accounting_stamp_order_platform()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.accounting_source_platform is null or new.accounting_source_platform='database' then
    new.accounting_source_platform := public.accounting_request_platform();
  end if;
  return new;
end; $$;

drop trigger if exists orders_accounting_source_platform_v1 on public.orders;
create trigger orders_accounting_source_platform_v1 before insert on public.orders
for each row execute function public.accounting_stamp_order_platform();

create table if not exists public.accounting_settings (
  id integer primary key default 1 check (id = 1),
  revenue_recognition_status text not null default 'delivered'
    check (revenue_recognition_status in ('delivered','completed')),
  inventory_cost_method text not null default 'weighted_average'
    check (inventory_cost_method in ('fifo','weighted_average')),
  automatic_posting boolean not null default true,
  invoice_due_days integer not null default 0 check (invoice_due_days >= 0),
  reporting_currency text not null default 'THB',
  timezone text not null default 'Asia/Bangkok',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.accounting_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.protect_accounting_inventory_method()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.inventory_cost_method is distinct from new.inventory_cost_method and exists (
    select 1 from public.accounting_inventory_movements where approval_status='approved'
  ) then
    raise exception 'INVENTORY_METHOD_CHANGE_REQUIRES_ACCOUNTANT_CUTOVER';
  end if;
  return new;
end; $$;

drop trigger if exists accounting_inventory_method_cutover_v1 on public.accounting_settings;
create trigger accounting_inventory_method_cutover_v1 before update of inventory_cost_method
on public.accounting_settings for each row execute function public.protect_accounting_inventory_method();

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  account_name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','revenue_adjustment','direct_cost','operating_expense','tax')),
  report_group text not null,
  normal_balance text not null check (normal_balance in ('debit','credit')),
  description text not null default '',
  active boolean not null default true,
  effective_date date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_tax_rules (
  id uuid primary key default gen_random_uuid(),
  tax_name text not null,
  tax_type text not null,
  rate numeric(9,6) not null default 0 check (rate >= 0),
  effective_date date not null,
  taxable_service_ids text[] not null default '{}',
  price_mode text not null default 'exclusive' check (price_mode in ('inclusive','exclusive')),
  input_account_id uuid references public.accounting_accounts(id) on delete restrict,
  output_account_id uuid references public.accounting_accounts(id) on delete restrict,
  position_account_id uuid references public.accounting_accounts(id) on delete restrict,
  display_on_invoice boolean not null default false,
  active boolean not null default false,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','retired')),
  change_reason text not null default '',
  version_number integer not null default 1 check (version_number > 0),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tax_name, version_number)
);

create table if not exists public.accounting_journal_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  business_event text not null check (business_event in (
    'order_accepted','service_completed','delivery_completed','payment_confirmed',
    'advance_payment_received','credit_sale_completed','receivable_collected',
    'expense_approved','supply_purchased','supply_consumed','refund_approved','adjustment_approved'
  )),
  recognition_trigger text not null,
  primary_debit_account_id uuid references public.accounting_accounts(id) on delete restrict,
  primary_credit_account_id uuid references public.accounting_accounts(id) on delete restrict,
  amount_source text not null,
  tax_rule_id uuid references public.accounting_tax_rules(id) on delete restrict,
  approval_required boolean not null default false,
  posting_method text not null default 'automatic' check (posting_method in ('automatic','manual')),
  effective_date date not null,
  version_number integer not null default 1 check (version_number > 0),
  active boolean not null default true,
  approval_status text not null default 'approved' check (approval_status in ('draft','approved','retired')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_name, version_number)
);

create table if not exists public.accounting_journal_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.accounting_journal_templates(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  side text not null check (side in ('debit','credit')),
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  amount_source text not null,
  description text not null default '',
  unique (template_id, line_number)
);

create table if not exists public.accounting_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  source_platform text not null check (source_platform in ('android','ios','customer_web','admin_web','database','import')),
  source_transaction_type text not null,
  source_transaction_id text not null,
  source_record_version text not null,
  event_type text not null,
  recognition_trigger text not null,
  source_order_id uuid references public.orders(id) on delete restrict,
  order_number text,
  party_id uuid references public.profiles(id) on delete set null,
  party_name text not null default '',
  event_at timestamptz not null,
  accounting_rule text not null,
  template_id uuid references public.accounting_journal_templates(id) on delete restrict,
  template_version integer,
  tax_rule_id uuid references public.accounting_tax_rules(id) on delete restrict,
  tax_rule_version integer,
  created_by uuid references public.profiles(id) on delete set null,
  posting_status text not null default 'not_recorded' check (posting_status in (
    'not_recorded','advance_recorded','revenue_recorded','partially_settled',
    'fully_settled','reversed','pending_review','pending_approval'
  )),
  error_message text not null default '',
  payload jsonb not null default '{}',
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists accounting_events_source_idx on public.accounting_events(source_transaction_type, source_transaction_id);
create index if not exists accounting_events_status_idx on public.accounting_events(posting_status, event_at desc);

create table if not exists public.accounting_journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_number text not null unique default ('J-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.accounting_journal_number_seq')::text, 6, '0')),
  event_id uuid not null unique references public.accounting_events(id) on delete restrict,
  journal_date date not null,
  reference_number text not null,
  description text not null,
  party_name text not null default '',
  source_platform text not null,
  source_type text not null,
  source_transaction_id text not null,
  source_order_id uuid references public.orders(id) on delete restrict,
  template_id uuid not null references public.accounting_journal_templates(id) on delete restrict,
  template_version integer not null,
  tax_rule_id uuid references public.accounting_tax_rules(id) on delete restrict,
  tax_rule_version integer,
  tax_amount numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  posting_status text not null check (posting_status in ('draft','pending_approval','posted','reversed','pending_review')),
  reversal_of_id uuid references public.accounting_journal_entries(id) on delete restrict,
  correction_reason text not null default '',
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists accounting_journals_date_idx on public.accounting_journal_entries(journal_date desc, posting_status);

create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.accounting_journal_entries(id) on delete restrict,
  line_number integer not null,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  description text not null default '',
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  unique (journal_entry_id, line_number)
);

create table if not exists public.accounting_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','bank','accounts_payable')),
  supplier text not null default '',
  cost_class text not null check (cost_class in ('direct_cost','operating_expense')),
  related_order_id uuid references public.orders(id) on delete restrict,
  receipt_path text,
  tax_rule_id uuid references public.accounting_tax_rules(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','rejected')),
  posting_status text not null default 'not_recorded',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_supplies (
  id uuid primary key default gen_random_uuid(),
  supply_name text not null unique,
  unit text not null,
  quantity_on_hand numeric(14,4) not null default 0,
  average_unit_cost numeric(14,4) not null default 0,
  inventory_value numeric(14,2) generated always as (round(quantity_on_hand * average_unit_cost, 2)) stored,
  reorder_level numeric(14,4) not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.accounting_supplies(id) on delete restrict,
  movement_date date not null,
  movement_type text not null check (movement_type in ('purchase','usage','adjustment_in','adjustment_out')),
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  payment_method text not null default 'bank' check (payment_method in ('cash','bank','accounts_payable')),
  total_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  related_order_id uuid references public.orders(id) on delete restrict,
  supplier text not null default '',
  reason text not null default '',
  idempotency_key text not null unique,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','rejected')),
  posting_status text not null default 'not_recorded',
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_inventory_layers (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.accounting_supplies(id) on delete restrict,
  source_movement_id uuid not null references public.accounting_inventory_movements(id) on delete restrict,
  acquired_at date not null,
  quantity_original numeric(14,4) not null check (quantity_original > 0),
  quantity_remaining numeric(14,4) not null check (quantity_remaining >= 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (source_movement_id)
);
create index if not exists accounting_inventory_layers_fifo_idx
  on public.accounting_inventory_layers(supply_id,acquired_at,created_at) where quantity_remaining>0;

create table if not exists public.accounting_service_cost_rules (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.services(id) on delete restrict,
  cost_basis text not null,
  cost_per_unit numeric(14,4) not null check (cost_per_unit >= 0),
  effective_date date not null,
  explanation text not null default '',
  approved_by uuid references public.profiles(id) on delete restrict,
  active boolean not null default true,
  version_number integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_id, version_number)
);

create table if not exists public.accounting_order_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  service_id text references public.services(id) on delete restrict,
  cost_rule_id uuid references public.accounting_service_cost_rules(id) on delete restrict,
  cost_rule_version integer,
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4) not null,
  total_cost numeric(14,2) not null,
  snapshot_at timestamptz not null default now(),
  unique (order_id, order_item_id)
);

create table if not exists public.accounting_budgets (
  id uuid primary key default gen_random_uuid(),
  budget_month date not null check (date_trunc('month', budget_month)::date = budget_month),
  category text not null,
  budget_kind text not null check (budget_kind in ('revenue','expense')),
  account_id uuid references public.accounting_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0),
  explanation text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_month, category)
);

create table if not exists public.accounting_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('INV-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.accounting_invoice_number_seq')::text,6,'0')),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  invoice_date date not null,
  due_date date not null,
  subtotal numeric(14,2) not null,
  pickup_fee numeric(14,2) not null default 0,
  delivery_fee numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','partially_refunded','refunded')),
  tax_rule_id uuid references public.accounting_tax_rules(id) on delete restrict,
  tax_rule_version integer,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.accounting_invoices(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  description text not null,
  quantity numeric(14,4) not null,
  unit_price numeric(14,4) not null,
  line_total numeric(14,2) not null,
  unique (invoice_id, order_item_id)
);

create table if not exists public.accounting_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique default ('REC-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.accounting_receipt_number_seq')::text,6,'0')),
  invoice_id uuid references public.accounting_invoices(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null,
  payment_reference text not null unique,
  payment_date timestamptz not null,
  remaining_balance numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  receipt_id uuid references public.accounting_receipts(id) on delete restrict,
  refund_reference text not null unique,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  approval_status text not null default 'draft' check (approval_status in ('draft','approved','rejected')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  posting_status text not null default 'not_recorded',
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_reprint_history (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('invoice','receipt')),
  document_id uuid not null,
  action text not null check (action in ('print','download','pdf')),
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_audit_log (
  id bigint generated by default as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  record_type text not null,
  record_id text not null,
  previous_value jsonb,
  new_value jsonb,
  reason text not null default '',
  effective_date date,
  approved_by uuid references public.profiles(id) on delete set null,
  related_source_transaction text,
  source_platform text not null default 'admin_web',
  created_at timestamptz not null default now()
);

-- Seed a practical chart. Accounts remain editable and can be disabled.
insert into public.accounting_accounts (account_code, account_name, account_type, report_group, normal_balance, description)
values
('101','Cash','asset','Current assets','debit','Cash collected'),
('102','Bank','asset','Current assets','debit','Bank and PromptPay collections'),
('110','Accounts Receivable','asset','Current assets','debit','Confirmed customer balances'),
('120','Supplies Inventory','asset','Current assets','debit','Laundry supplies on hand'),
('130','Prepaid Expenses','asset','Current assets','debit','Prepaid operating costs'),
('150','Equipment','asset','Non-current assets','debit','Laundry equipment'),
('151','Accumulated Depreciation','asset','Non-current assets','credit','Accumulated depreciation'),
('201','Accounts Payable','liability','Current liabilities','credit','Approved unpaid supplier balances'),
('210','Customer Advances','liability','Current liabilities','credit','Payments received before service recognition'),
('401','Laundry Service Revenue','revenue','Service revenue','credit','Wash and fold and other laundry revenue'),
('402','Dry-cleaning Revenue','revenue','Service revenue','credit','Dry-cleaning revenue'),
('403','Ironing Revenue','revenue','Service revenue','credit','Ironing revenue'),
('404','Express Service Revenue','revenue','Service revenue','credit','Express service revenue'),
('405','Pickup Revenue','revenue','Ancillary revenue','credit','Pickup fee revenue'),
('406','Delivery Revenue','revenue','Ancillary revenue','credit','Delivery fee revenue'),
('409','Discounts and Refunds','revenue_adjustment','Revenue adjustments','debit','Discounts and approved refunds'),
('501','Laundry Materials Cost','direct_cost','Direct costs','debit','Materials consumed for services'),
('502','Packaging Cost','direct_cost','Direct costs','debit','Packaging consumed'),
('503','Direct Delivery Cost','direct_cost','Direct costs','debit','Order-specific delivery cost'),
('504','Outsourced Service Cost','direct_cost','Direct costs','debit','Outsourced cleaning cost'),
('505','Other Direct Service Cost','direct_cost','Direct costs','debit','Other traceable direct cost'),
('601','Rent Expense','operating_expense','Operating expenses','debit','Rent'),
('602','Water Expense','operating_expense','Operating expenses','debit','Water'),
('603','Electricity Expense','operating_expense','Operating expenses','debit','Electricity'),
('604','Wages Expense','operating_expense','Operating expenses','debit','General wages'),
('605','Repair and Maintenance Expense','operating_expense','Operating expenses','debit','Repairs and maintenance'),
('606','Fuel and Transportation Expense','operating_expense','Operating expenses','debit','General fuel and transport'),
('607','Marketing Expense','operating_expense','Operating expenses','debit','Marketing'),
('608','Internet and Communication Expense','operating_expense','Operating expenses','debit','Communications'),
('609','Depreciation Expense','operating_expense','Operating expenses','debit','Depreciation'),
('699','Other Operating Expense','operating_expense','Operating expenses','debit','Other operating costs')
on conflict (account_code) do nothing;

create or replace function public.accounting_add_template(
  p_name text, p_event text, p_trigger text, p_amount_source text,
  p_debit_code text, p_credit_code text, p_effective date default current_date
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_debit uuid; v_credit uuid;
begin
  select id into v_debit from public.accounting_accounts where account_code = p_debit_code;
  select id into v_credit from public.accounting_accounts where account_code = p_credit_code;
  insert into public.accounting_journal_templates (
    template_name,business_event,recognition_trigger,primary_debit_account_id,
    primary_credit_account_id,amount_source,effective_date,version_number,approval_status
  ) values (p_name,p_event,p_trigger,v_debit,v_credit,p_amount_source,p_effective,1,'approved')
  on conflict (template_name,version_number) do update set template_name = excluded.template_name
  returning id into v_id;
  if not exists (select 1 from public.accounting_journal_template_lines where template_id = v_id) then
    insert into public.accounting_journal_template_lines (template_id,line_number,side,account_id,amount_source)
    values (v_id,1,'debit',v_debit,p_amount_source),(v_id,2,'credit',v_credit,p_amount_source);
  end if;
  return v_id;
end; $$;

select public.accounting_add_template('Completed cash service','service_completed','paid_service_cash','net_total','101','401');
select public.accounting_add_template('Completed bank service','service_completed','paid_service_bank','net_total','102','401');
select public.accounting_add_template('Completed unpaid service','credit_sale_completed','credit_sale','net_total','110','401');
select public.accounting_add_template('Advance cash payment received','advance_payment_received','payment_before_service_cash','paid_amount','101','210');
select public.accounting_add_template('Advance bank payment received','advance_payment_received','payment_before_service_bank','paid_amount','102','210');
select public.accounting_add_template('Service completed after advance','service_completed','advance_settlement','net_total','210','401');
select public.accounting_add_template('Cash receivable collected','receivable_collected','payment_after_service_cash','paid_amount','101','110');
select public.accounting_add_template('Bank receivable collected','receivable_collected','payment_after_service_bank','paid_amount','102','110');
select public.accounting_add_template('Supply purchase - cash','supply_purchased','inventory_purchase_cash','inventory_value','120','101');
select public.accounting_add_template('Supply purchase - bank','supply_purchased','inventory_purchase_bank','inventory_value','120','102');
select public.accounting_add_template('Supply purchase - payable','supply_purchased','inventory_purchase_accounts_payable','inventory_value','120','201');
select public.accounting_add_template('Supply consumption','supply_consumed','inventory_usage','inventory_value','501','120');
select public.accounting_add_template('Inventory adjustment in','adjustment_approved','inventory_adjustment_in','inventory_value','120','699');
select public.accounting_add_template('Inventory adjustment out','adjustment_approved','inventory_adjustment_out','inventory_value','699','120');
select public.accounting_add_template('Operating expense - cash','expense_approved','operating_expense_cash','expense_amount','699','101');
select public.accounting_add_template('Operating expense - bank','expense_approved','operating_expense_bank','expense_amount','699','102');
select public.accounting_add_template('Operating expense - payable','expense_approved','operating_expense_accounts_payable','expense_amount','699','201');
select public.accounting_add_template('Direct expense - cash','expense_approved','direct_cost_cash','expense_amount','505','101');
select public.accounting_add_template('Direct expense - bank','expense_approved','direct_cost_bank','expense_amount','505','102');
select public.accounting_add_template('Direct expense - payable','expense_approved','direct_cost_accounts_payable','expense_amount','505','201');
select public.accounting_add_template('Customer refund','refund_approved','approved_refund','refund_amount','409','102');
select public.accounting_add_template('Advance refund','refund_approved','advance_refund','refund_amount','210','102');
select public.accounting_add_template('Service cost snapshot','adjustment_approved','service_cost_snapshot','cost_amount','505','201');
drop function public.accounting_add_template(text,text,text,text,text,text,date);

create or replace function public.create_accounting_template_version(
  p_template_name text, p_business_event text, p_recognition_trigger text,
  p_amount_source text, p_debit_account_code text, p_credit_account_code text,
  p_effective_date date, p_approval_required boolean, p_posting_method text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_debit uuid; v_credit uuid; v_version integer;
begin
  if not public.has_accounting_role(array['owner']) then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
  if p_posting_method not in ('automatic','manual') then raise exception 'INVALID_POSTING_METHOD'; end if;
  if nullif(trim(p_template_name),'') is null or nullif(trim(p_business_event),'') is null
    or nullif(trim(p_recognition_trigger),'') is null or nullif(trim(p_amount_source),'') is null then
    raise exception 'TEMPLATE_FIELDS_REQUIRED';
  end if;
  select id into v_debit from public.accounting_accounts
    where account_code=trim(p_debit_account_code) and active;
  select id into v_credit from public.accounting_accounts
    where account_code=trim(p_credit_account_code) and active;
  if v_debit is null or v_credit is null then raise exception 'ACTIVE_ACCOUNT_MAPPING_REQUIRED'; end if;
  select coalesce(max(version_number),0)+1 into v_version
    from public.accounting_journal_templates where template_name=trim(p_template_name);
  insert into public.accounting_journal_templates(
    template_name,business_event,recognition_trigger,primary_debit_account_id,
    primary_credit_account_id,amount_source,approval_required,posting_method,
    effective_date,version_number,active,created_by,approved_by,approval_status
  ) values (
    trim(p_template_name),trim(p_business_event),trim(p_recognition_trigger),v_debit,
    v_credit,trim(p_amount_source),coalesce(p_approval_required,false),p_posting_method,
    p_effective_date,v_version,true,auth.uid(),auth.uid(),'approved'
  ) returning id into v_id;
  insert into public.accounting_journal_template_lines(template_id,line_number,side,account_id,amount_source)
  values (v_id,1,'debit',v_debit,trim(p_amount_source)),(v_id,2,'credit',v_credit,trim(p_amount_source));
  return v_id;
end; $$;

-- Revenue templates use separate source amounts so gross revenue, fees and
-- discounts remain visible while the entry stays balanced.
do $$
declare v_template uuid; v_debit uuid; v_service uuid; v_pickup uuid; v_delivery uuid; v_discount uuid;
begin
  select id into v_service from public.accounting_accounts where account_code='401';
  select id into v_pickup from public.accounting_accounts where account_code='405';
  select id into v_delivery from public.accounting_accounts where account_code='406';
  select id into v_discount from public.accounting_accounts where account_code='409';
  for v_template in
    select id from public.accounting_journal_templates
    where template_name in ('Completed cash service','Completed bank service','Completed unpaid service','Service completed after advance')
      and version_number=1
  loop
    select primary_debit_account_id into v_debit from public.accounting_journal_templates where id=v_template;
    delete from public.accounting_journal_template_lines where template_id=v_template;
    insert into public.accounting_journal_template_lines(template_id,line_number,side,account_id,amount_source,description)
    values
      (v_template,1,'debit',v_debit,'net_total','Amount settled or receivable'),
      (v_template,2,'debit',v_discount,'discount_total','Discounts and benefits'),
      (v_template,3,'credit',v_service,'service_subtotal','Service revenue'),
      (v_template,4,'credit',v_pickup,'pickup_fee','Pickup revenue'),
      (v_template,5,'credit',v_delivery,'delivery_fee','Delivery revenue');
  end loop;
end $$;

create or replace function public.accounting_amount(p_payload jsonb, p_source text)
returns numeric language sql immutable as $$
  select round(coalesce(nullif(p_payload ->> p_source,'')::numeric,0),2);
$$;

create or replace function public.enqueue_accounting_event(
  p_key text, p_platform text, p_source_type text, p_source_id text,
  p_source_version text, p_event_type text, p_trigger text,
  p_order_id uuid, p_order_number text, p_party_id uuid, p_party_name text,
  p_event_at timestamptz, p_rule text, p_payload jsonb, p_created_by uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.accounting_events (
    idempotency_key,source_platform,source_transaction_type,source_transaction_id,
    source_record_version,event_type,recognition_trigger,source_order_id,order_number,
    party_id,party_name,event_at,accounting_rule,payload,created_by
  ) values (
    p_key,p_platform,p_source_type,p_source_id,p_source_version,p_event_type,p_trigger,
    p_order_id,p_order_number,p_party_id,coalesce(p_party_name,''),p_event_at,p_rule,
    coalesce(p_payload,'{}'),p_created_by
  ) on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.accounting_events where idempotency_key = p_key; end if;
  return v_id;
end; $$;

create or replace function public.accounting_materialize_documents(p_event_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event public.accounting_events%rowtype; v_order public.orders%rowtype;
  v_invoice public.accounting_invoices%rowtype; v_payment_id uuid;
  v_amount numeric(14,2); v_cost numeric(14,2) := 0; v_cost_event uuid;
  v_item public.order_items%rowtype; v_rule public.accounting_service_cost_rules%rowtype;
  v_settings public.accounting_settings%rowtype;
begin
  select * into v_event from public.accounting_events where id=p_event_id;
  if v_event.source_order_id is null then return; end if;
  select * into v_order from public.orders where id=v_event.source_order_id;
  if not found or v_order.is_demo then return; end if;
  select * into v_settings from public.accounting_settings where id=1;

  if v_event.event_type in ('service_completed','credit_sale_completed') then
    insert into public.accounting_invoices(
      order_id,customer_id,customer_name,invoice_date,due_date,subtotal,pickup_fee,
      delivery_fee,discount,tax_amount,total_amount,tax_rule_id,tax_rule_version
    ) values (
      v_order.id,v_order.user_id,coalesce(nullif(v_event.party_name,''),'Customer'),
      (v_event.event_at at time zone 'Asia/Bangkok')::date,
      (v_event.event_at at time zone 'Asia/Bangkok')::date+v_settings.invoice_due_days,
      v_order.subtotal,v_order.pickup_fee,v_order.delivery_fee,
      coalesce(v_order.discount,0)+coalesce(v_order.pickup_benefit_discount,0),0,
      coalesce(v_order.final_total,v_order.estimated_total,v_order.total),
      v_event.tax_rule_id,v_event.tax_rule_version
    ) on conflict(order_id) do nothing;
    select * into v_invoice from public.accounting_invoices where order_id=v_order.id;
    insert into public.accounting_invoice_lines(invoice_id,order_item_id,description,quantity,unit_price,line_total)
    select v_invoice.id,oi.id,oi.service_name,coalesce(oi.final_quantity,oi.quantity),
      coalesce(oi.final_unit_price,oi.unit_price),coalesce(oi.final_line_total,oi.line_total)
    from public.order_items oi where oi.order_id=v_order.id
    on conflict(invoice_id,order_item_id) do nothing;
    update public.accounting_receipts set invoice_id=v_invoice.id where order_id=v_order.id and invoice_id is null;
    if v_event.recognition_trigger in ('paid_service_cash','paid_service_bank') then
      select id into v_payment_id from public.payments where order_id=v_order.id;
      insert into public.accounting_receipts(
        invoice_id,order_id,payment_id,amount,payment_method,payment_reference,
        payment_date,remaining_balance,created_by
      ) values (
        v_invoice.id,v_order.id,v_payment_id,v_invoice.total_amount,v_order.payment_method,
        'event:'||v_event.id,v_event.event_at,0,v_event.created_by
      ) on conflict(payment_reference) do nothing;
    end if;
    update public.accounting_invoices set
      paid_amount=coalesce((select sum(amount) from public.accounting_receipts where invoice_id=v_invoice.id),0),
      payment_status=case
        when coalesce((select sum(amount) from public.accounting_receipts where invoice_id=v_invoice.id),0)>=v_invoice.total_amount then 'paid'
        when coalesce((select sum(amount) from public.accounting_receipts where invoice_id=v_invoice.id),0)>0 then 'partial'
        else 'unpaid' end
    where id=v_invoice.id;

    -- Freeze management-cost assumptions at recognition. These snapshots are
    -- never recalculated when a later cost rule is created.
    for v_item in select * from public.order_items where order_id=v_order.id loop
      select * into v_rule from public.accounting_service_cost_rules
      where service_id=v_item.service_id and active
        and effective_date <= (v_event.event_at at time zone 'Asia/Bangkok')::date
      order by effective_date desc,version_number desc limit 1;
      if found then
        insert into public.accounting_order_cost_snapshots(
          order_id,order_item_id,service_id,cost_rule_id,cost_rule_version,quantity,unit_cost,total_cost
        ) values (
          v_order.id,v_item.id,v_item.service_id,v_rule.id,v_rule.version_number,
          coalesce(v_item.final_quantity,v_item.quantity),v_rule.cost_per_unit,
          round(coalesce(v_item.final_quantity,v_item.quantity)*v_rule.cost_per_unit,2)
        ) on conflict(order_id,order_item_id) do nothing;
      end if;
    end loop;
    select coalesce(sum(total_cost),0) into v_cost from public.accounting_order_cost_snapshots where order_id=v_order.id;
    if v_cost>0 then
      v_cost_event := public.enqueue_accounting_event(
        'order-cost:'||v_order.id,v_event.source_platform,'order_cost_snapshot',v_order.id::text,
        v_event.source_record_version,'adjustment_approved','service_cost_snapshot',v_order.id,
        v_order.order_number,v_order.user_id,v_event.party_name,v_event.event_at,
        'approved_service_cost_snapshot',jsonb_build_object('cost_amount',v_cost),v_event.created_by
      );
      if v_settings.automatic_posting then perform public.post_accounting_event(v_cost_event); end if;
    end if;
  elsif v_event.event_type in ('advance_payment_received','receivable_collected') then
    v_amount := public.accounting_amount(v_event.payload,'paid_amount');
    if v_amount<=0 then return; end if;
    select id into v_payment_id from public.payments where order_id=v_order.id;
    select * into v_invoice from public.accounting_invoices where order_id=v_order.id;
    insert into public.accounting_receipts(
      invoice_id,order_id,payment_id,amount,payment_method,payment_reference,
      payment_date,remaining_balance,created_by
    ) values (
      v_invoice.id,v_order.id,v_payment_id,v_amount,v_order.payment_method,
      coalesce(nullif(v_event.payload->>'payment_reference',''),'event:'||v_event.id),v_event.event_at,
      greatest(0,coalesce(v_invoice.total_amount,coalesce(v_order.final_total,v_order.estimated_total,v_order.total))
        -coalesce((select sum(amount) from public.accounting_receipts where order_id=v_order.id),0)-v_amount),
      v_event.created_by
    ) on conflict(payment_reference) do nothing;
    if v_invoice.id is not null then
      update public.accounting_invoices set
        paid_amount=coalesce((select sum(amount) from public.accounting_receipts where invoice_id=v_invoice.id),0),
        payment_status=case
          when coalesce((select sum(amount) from public.accounting_receipts where invoice_id=v_invoice.id),0)>=v_invoice.total_amount then 'paid'
          else 'partial' end
      where id=v_invoice.id;
    end if;
  elsif v_event.event_type='refund_approved' then
    v_amount := public.accounting_amount(v_event.payload,'refund_amount');
    select * into v_invoice from public.accounting_invoices where order_id=v_order.id;
    if v_invoice.id is not null then
      update public.accounting_invoices set
        refund_amount=refund_amount+v_amount,
        payment_status=case when refund_amount+v_amount>=paid_amount then 'refunded' else 'partially_refunded' end
      where id=v_invoice.id;
    end if;
  end if;
end; $$;

create or replace function public.post_accounting_event(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_event public.accounting_events%rowtype;
  v_template public.accounting_journal_templates%rowtype;
  v_line public.accounting_journal_template_lines%rowtype;
  v_entry_id uuid; v_amount numeric(14,2); v_debits numeric(14,2); v_credits numeric(14,2);
  v_line_no integer := 0; v_status text;
begin
  select * into v_event from public.accounting_events where id = p_event_id for update;
  if not found then raise exception 'ACCOUNTING_EVENT_NOT_FOUND'; end if;
  if v_event.posting_status not in ('not_recorded','pending_review','pending_approval') then
    select id into v_entry_id from public.accounting_journal_entries where event_id = p_event_id;
    return v_entry_id;
  end if;
  begin
    select * into v_template from public.accounting_journal_templates
    where business_event = v_event.event_type
      and recognition_trigger = v_event.recognition_trigger
      and active and approval_status = 'approved'
      and effective_date <= (v_event.event_at at time zone 'Asia/Bangkok')::date
    order by effective_date desc, version_number desc limit 1;
    if not found then raise exception 'ACCOUNTING_TEMPLATE_NOT_FOUND'; end if;
    v_status := case when v_template.approval_required or v_template.posting_method = 'manual'
      then 'pending_approval' else 'posted' end;
    insert into public.accounting_journal_entries (
      event_id,journal_date,reference_number,description,party_name,source_platform,
      source_type,source_transaction_id,source_order_id,template_id,template_version,
      tax_rule_id,tax_rule_version,created_by,posting_status,posted_at
    ) values (
      v_event.id,(v_event.event_at at time zone 'Asia/Bangkok')::date,
      coalesce(v_event.order_number,v_event.source_transaction_id),
      v_template.template_name,v_event.party_name,v_event.source_platform,
      v_event.source_transaction_type,v_event.source_transaction_id,v_event.source_order_id,
      v_template.id,v_template.version_number,v_template.tax_rule_id,
      (select version_number from public.accounting_tax_rules where id = v_template.tax_rule_id),
      v_event.created_by,v_status,case when v_status = 'posted' then now() end
    ) returning id into v_entry_id;
    for v_line in select * from public.accounting_journal_template_lines
      where template_id = v_template.id order by line_number
    loop
      v_amount := public.accounting_amount(v_event.payload,v_line.amount_source);
      if v_amount > 0 then
        v_line_no := v_line_no + 1;
        insert into public.accounting_journal_lines (
          journal_entry_id,line_number,account_id,description,debit,credit
        ) values (
          v_entry_id,v_line_no,v_line.account_id,coalesce(nullif(v_line.description,''),v_template.template_name),
          case when v_line.side='debit' then v_amount else 0 end,
          case when v_line.side='credit' then v_amount else 0 end
        );
      end if;
    end loop;
    select coalesce(sum(debit),0),coalesce(sum(credit),0) into v_debits,v_credits
    from public.accounting_journal_lines where journal_entry_id=v_entry_id;
    if v_line_no < 2 or v_debits <> v_credits then raise exception 'ACCOUNTING_JOURNAL_UNBALANCED'; end if;
    update public.accounting_events set
      template_id=v_template.id,template_version=v_template.version_number,
      tax_rule_id=v_template.tax_rule_id,
      tax_rule_version=(select version_number from public.accounting_tax_rules where id=v_template.tax_rule_id),
      posting_status=case
        when v_status='pending_approval' then 'pending_approval'
        when v_event.event_type='advance_payment_received' then 'advance_recorded'
        when v_event.event_type in ('service_completed','credit_sale_completed') then 'revenue_recorded'
        when v_event.event_type='receivable_collected' then 'fully_settled'
        else 'fully_settled' end,
      error_message='',posted_at=case when v_status='posted' then now() end
    where id=v_event.id;
    if v_status='posted' then perform public.accounting_materialize_documents(v_event.id); end if;
  exception when others then
    update public.accounting_events set posting_status='pending_review',
      error_message=left(sqlstate || ': ' || sqlerrm,500),retry_count=retry_count+1
    where id=v_event.id;
    return null;
  end;
  return v_entry_id;
end; $$;

create or replace function public.accounting_capture_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings public.accounting_settings%rowtype; v_profile text; v_event uuid;
  v_paid boolean; v_recognized_before boolean; v_payment_trigger text; v_service_trigger text;
  v_platform text := public.accounting_request_platform();
  v_version text := extract(epoch from coalesce(new.updated_at,now()))::bigint::text;
  v_amount numeric(14,2) := coalesce(new.final_total,new.estimated_total,new.total,0);
begin
  if new.is_demo then return new; end if;
  select * into v_settings from public.accounting_settings where id=1;
  select full_name into v_profile from public.profiles where id=new.user_id;
  v_paid := new.payment_status in ('paid','verified');
  v_recognized_before := old.status in (v_settings.revenue_recognition_status,'completed');

  -- Record confirmed money first. If service recognition occurs in the same update,
  -- it is treated as an advance followed immediately by revenue recognition.
  if v_paid and old.payment_status not in ('paid','verified') and not exists (
    select 1 from public.accounting_events where source_order_id=new.id
      and event_type in ('advance_payment_received','receivable_collected')
      and posting_status<>'reversed'
  ) then
    v_payment_trigger := case
      when v_recognized_before and new.payment_method='promptpay' then 'payment_after_service_bank'
      when v_recognized_before then 'payment_after_service_cash'
      when new.payment_method='promptpay' then 'payment_before_service_bank'
      else 'payment_before_service_cash' end;
    v_event := public.enqueue_accounting_event(
      'order-payment:'||new.id||':'||v_version,v_platform,'order_payment',new.id::text,v_version,
      case when v_payment_trigger like 'payment_after_service%' then 'receivable_collected' else 'advance_payment_received' end,
      v_payment_trigger,new.id,new.order_number,new.user_id,v_profile,now(),'order_payment_transition',
      jsonb_build_object('paid_amount',v_amount,'net_total',v_amount,'payment_method',new.payment_method),new.payment_updated_by
    );
    if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  end if;

  if new.status = v_settings.revenue_recognition_status and old.status is distinct from new.status
    and not exists (
      select 1 from public.accounting_events where source_order_id=new.id
        and event_type in ('service_completed','credit_sale_completed')
        and posting_status<>'reversed'
    ) then
    v_service_trigger := case when exists (
      select 1 from public.accounting_events where source_order_id=new.id
        and event_type='advance_payment_received' and posting_status='advance_recorded'
    ) then 'advance_settlement'
      when v_paid and new.payment_method='promptpay' then 'paid_service_bank'
      when v_paid then 'paid_service_cash'
      else 'credit_sale' end;
    v_event := public.enqueue_accounting_event(
      'order-revenue:'||new.id||':'||v_version,v_platform,'order',new.id::text,v_version,
      case when v_service_trigger='credit_sale' then 'credit_sale_completed' else 'service_completed' end,
      v_service_trigger,new.id,new.order_number,new.user_id,v_profile,now(),'configured_revenue_recognition',
      jsonb_build_object(
        'gross_total',coalesce(new.subtotal,0)+coalesce(new.pickup_fee,0)+coalesce(new.delivery_fee,0),
        'net_total',v_amount,'discount_total',coalesce(new.discount,0)+coalesce(new.pickup_benefit_discount,0),
        'service_subtotal',coalesce(new.subtotal,0),'pickup_fee',coalesce(new.pickup_fee,0),
        'delivery_fee',coalesce(new.delivery_fee,0),'order_status',new.status,
        'order_source_platform',new.accounting_source_platform,
        'services',(select coalesce(jsonb_agg(jsonb_build_object(
          'serviceId',oi.service_id,'name',oi.service_name,
          'quantity',coalesce(oi.final_quantity,oi.quantity),
          'revenue',coalesce(oi.final_line_total,oi.line_total)
        )),'[]'::jsonb) from public.order_items oi where oi.order_id=new.id)
      ),new.payment_updated_by
    );
    if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  end if;

  if new.payment_status='refunded' and old.payment_status is distinct from new.payment_status
    and not exists (
      select 1 from public.accounting_refunds where order_id=new.id and approval_status='approved'
    ) and not exists (
      select 1 from public.accounting_events where source_order_id=new.id
        and event_type='refund_approved' and posting_status<>'reversed'
    ) then
    v_event := public.enqueue_accounting_event(
      'order-refund:'||new.id||':'||v_version,v_platform,'order_refund',new.id::text,v_version,
      'refund_approved',case when exists(
        select 1 from public.accounting_events where source_order_id=new.id
          and event_type in ('service_completed','credit_sale_completed') and posting_status='revenue_recorded'
      ) then 'approved_refund' else 'advance_refund' end,new.id,new.order_number,new.user_id,v_profile,now(),
      'payment_refund_transition',jsonb_build_object('refund_amount',v_amount),new.payment_updated_by
    );
    if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  end if;
  return new;
end; $$;

drop trigger if exists orders_accounting_capture_v1 on public.orders;
create trigger orders_accounting_capture_v1 after update of status,payment_status on public.orders
for each row execute function public.accounting_capture_order();

create or replace function public.approve_accounting_expense(p_expense_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exp public.accounting_expenses%rowtype; v_event uuid; v_settings public.accounting_settings%rowtype;
begin
  if not public.has_accounting_role(array['owner','accountant']) then raise exception 'ACCOUNTING_APPROVAL_REQUIRED'; end if;
  select * into v_exp from public.accounting_expenses where id=p_expense_id for update;
  if not found or v_exp.approval_status <> 'draft' then raise exception 'EXPENSE_NOT_APPROVABLE'; end if;
  update public.accounting_expenses set approval_status='approved',approved_by=auth.uid(),updated_at=now() where id=p_expense_id;
  v_event := public.enqueue_accounting_event(
    'expense:'||v_exp.id,'admin_web','expense',v_exp.id::text,'1','expense_approved',
    v_exp.cost_class||'_'||v_exp.payment_method,null,null,null,v_exp.supplier,v_exp.expense_date::timestamptz,'approved_expense',
    jsonb_build_object('expense_amount',v_exp.amount,'category',v_exp.category),auth.uid()
  );
  -- Correct platform if the request key is not a platform name.
  update public.accounting_events set source_platform='admin_web' where id=v_event;
  select * into v_settings from public.accounting_settings where id=1;
  if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  update public.accounting_expenses set posting_status=(select posting_status from public.accounting_events where id=v_event) where id=p_expense_id;
end; $$;

create or replace function public.approve_inventory_movement(p_movement_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_move public.accounting_inventory_movements%rowtype; v_supply public.accounting_supplies%rowtype;
  v_event uuid; v_settings public.accounting_settings%rowtype; v_new_cost numeric(14,4);
  v_remaining numeric(14,4); v_take numeric(14,4); v_issue_cost numeric(14,4) := 0;
  v_layer public.accounting_inventory_layers%rowtype;
begin
  if not public.has_accounting_role(array['owner','accountant']) then raise exception 'ACCOUNTING_APPROVAL_REQUIRED'; end if;
  select * into v_move from public.accounting_inventory_movements where id=p_movement_id for update;
  if not found or v_move.approval_status <> 'draft' then raise exception 'MOVEMENT_NOT_APPROVABLE'; end if;
  select * into v_supply from public.accounting_supplies where id=v_move.supply_id for update;
  select * into v_settings from public.accounting_settings where id=1;
  if v_move.movement_type in ('usage','adjustment_out') and v_supply.quantity_on_hand < v_move.quantity then
    raise exception 'INSUFFICIENT_SUPPLY_QUANTITY';
  end if;
  if v_move.movement_type in ('purchase','adjustment_in') then
    v_new_cost := case when v_supply.quantity_on_hand + v_move.quantity = 0 then 0 else
      ((v_supply.quantity_on_hand*v_supply.average_unit_cost)+(v_move.quantity*v_move.unit_cost)) /
      (v_supply.quantity_on_hand+v_move.quantity) end;
    update public.accounting_supplies set quantity_on_hand=quantity_on_hand+v_move.quantity,
      average_unit_cost=v_new_cost,updated_by=auth.uid(),updated_at=now() where id=v_supply.id;
    if v_settings.inventory_cost_method='fifo' then
      insert into public.accounting_inventory_layers(
        supply_id,source_movement_id,acquired_at,quantity_original,quantity_remaining,unit_cost
      ) values (v_supply.id,v_move.id,v_move.movement_date,v_move.quantity,v_move.quantity,v_move.unit_cost);
    end if;
  else
    if v_settings.inventory_cost_method='fifo' then
      v_remaining := v_move.quantity;
      for v_layer in select * from public.accounting_inventory_layers
        where supply_id=v_supply.id and quantity_remaining>0
        order by acquired_at,created_at,id for update
      loop
        exit when v_remaining<=0;
        v_take := least(v_remaining,v_layer.quantity_remaining);
        v_issue_cost := v_issue_cost+(v_take*v_layer.unit_cost);
        update public.accounting_inventory_layers
          set quantity_remaining=quantity_remaining-v_take where id=v_layer.id;
        v_remaining := v_remaining-v_take;
      end loop;
      if v_remaining>0 then raise exception 'FIFO_INVENTORY_LAYERS_INCOMPLETE'; end if;
      update public.accounting_inventory_movements
        set unit_cost=round(v_issue_cost/nullif(v_move.quantity,0),4) where id=v_move.id;
    else
      update public.accounting_inventory_movements
        set unit_cost=v_supply.average_unit_cost where id=v_move.id;
    end if;
    update public.accounting_supplies set quantity_on_hand=quantity_on_hand-v_move.quantity,
      updated_by=auth.uid(),updated_at=now() where id=v_supply.id;
  end if;
  update public.accounting_inventory_movements set approval_status='approved',approved_by=auth.uid(),
    approved_at=now() where id=v_move.id;
  select * into v_move from public.accounting_inventory_movements where id=p_movement_id;
  v_event := public.enqueue_accounting_event(
    'inventory:'||v_move.id,'admin_web','inventory_movement',v_move.id::text,'1',
    case when v_move.movement_type='purchase' then 'supply_purchased'
      when v_move.movement_type='usage' then 'supply_consumed' else 'adjustment_approved' end,
    case when v_move.movement_type='purchase' then 'inventory_purchase_'||v_move.payment_method
      when v_move.movement_type='usage' then 'inventory_usage'
      else 'inventory_'||v_move.movement_type end,
    v_move.related_order_id,null,null,v_supply.supply_name,v_move.movement_date::timestamptz,
    'approved_inventory_movement',jsonb_build_object('inventory_value',v_move.total_cost),auth.uid()
  );
  if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  update public.accounting_inventory_movements set posting_status=(select posting_status from public.accounting_events where id=v_event) where id=v_move.id;
end; $$;

create or replace function public.approve_accounting_journal(p_journal_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_journal public.accounting_journal_entries%rowtype; v_event public.accounting_events%rowtype;
begin
  if not public.has_accounting_role(array['owner','accountant']) then raise exception 'ACCOUNTING_APPROVAL_REQUIRED'; end if;
  select * into v_journal from public.accounting_journal_entries where id=p_journal_id for update;
  if not found or v_journal.posting_status<>'pending_approval' then raise exception 'JOURNAL_NOT_APPROVABLE'; end if;
  select * into v_event from public.accounting_events where id=v_journal.event_id for update;
  update public.accounting_journal_entries set posting_status='posted',approved_by=auth.uid(),posted_at=now()
    where id=v_journal.id;
  update public.accounting_events set
    posting_status=case
      when v_event.event_type='advance_payment_received' then 'advance_recorded'
      when v_event.event_type in ('service_completed','credit_sale_completed') then 'revenue_recorded'
      when v_event.event_type='receivable_collected' then 'fully_settled'
      else 'fully_settled' end,
    posted_at=now(),error_message='' where id=v_event.id;
  perform public.accounting_materialize_documents(v_event.id);
end; $$;

create or replace function public.retry_accounting_event(p_event_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_accounting_role(array['owner','accountant']) then raise exception 'ACCOUNTING_APPROVAL_REQUIRED'; end if;
  update public.accounting_events set posting_status='not_recorded',error_message='' where id=p_event_id and posting_status='pending_review';
  if not found then raise exception 'ACCOUNTING_EVENT_NOT_RETRYABLE'; end if;
  return public.post_accounting_event(p_event_id);
end; $$;

create or replace function public.record_accounting_collection(
  p_order_id uuid, p_amount numeric, p_method text, p_reference text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders%rowtype; v_invoice public.accounting_invoices%rowtype;
  v_event uuid; v_entry uuid; v_party text; v_outstanding numeric(14,2);
begin
  if not public.has_accounting_role(array['owner','accountant','cashier']) then raise exception 'PAYMENT_RECORDING_REQUIRED'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('cash','bank') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if char_length(trim(coalesce(p_reference,'')))<3 then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;
  select * into v_order from public.orders where id=p_order_id and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_invoice from public.accounting_invoices where order_id=p_order_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  v_outstanding := greatest(0,v_invoice.total_amount-v_invoice.paid_amount-v_invoice.refund_amount);
  if p_amount>v_outstanding then raise exception 'PAYMENT_ABOVE_OUTSTANDING_BALANCE'; end if;
  if exists(select 1 from public.accounting_receipts where payment_reference=trim(p_reference)) then
    raise exception 'DUPLICATE_PAYMENT_REFERENCE';
  end if;
  select full_name into v_party from public.profiles where id=v_order.user_id;
  v_event := public.enqueue_accounting_event(
    'collection:'||lower(trim(p_reference)),'admin_web','accounting_collection',trim(p_reference),'1',
    'receivable_collected',case when p_method='bank' then 'payment_after_service_bank' else 'payment_after_service_cash' end,
    v_order.id,v_order.order_number,v_order.user_id,v_party,now(),'confirmed_receivable_collection',
    jsonb_build_object('paid_amount',p_amount,'payment_reference',trim(p_reference),'payment_method',p_method),auth.uid()
  );
  v_entry := public.post_accounting_event(v_event);
  if v_entry is null then raise exception 'COLLECTION_POSTING_FAILED'; end if;
  return v_entry;
end; $$;

create or replace function public.approve_accounting_refund(p_refund_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_refund public.accounting_refunds%rowtype; v_order public.orders%rowtype;
  v_invoice public.accounting_invoices%rowtype; v_event uuid; v_entry uuid; v_party text;
begin
  if not public.has_accounting_role(array['owner','accountant']) then raise exception 'REFUND_APPROVAL_REQUIRED'; end if;
  select * into v_refund from public.accounting_refunds where id=p_refund_id for update;
  if not found or v_refund.approval_status<>'draft' then raise exception 'REFUND_NOT_APPROVABLE'; end if;
  select * into v_order from public.orders where id=v_refund.order_id and not is_demo;
  select * into v_invoice from public.accounting_invoices where order_id=v_refund.order_id for update;
  if not found or v_refund.amount>greatest(0,v_invoice.paid_amount-v_invoice.refund_amount) then
    raise exception 'REFUND_ABOVE_CONFIRMED_PAYMENT';
  end if;
  update public.accounting_refunds set approval_status='approved',approved_by=auth.uid(),approved_at=now() where id=v_refund.id;
  select full_name into v_party from public.profiles where id=v_order.user_id;
  v_event := public.enqueue_accounting_event(
    'refund:'||lower(v_refund.refund_reference),'admin_web','accounting_refund',v_refund.id::text,'1',
    'refund_approved',case when exists(
      select 1 from public.accounting_events where source_order_id=v_order.id
        and event_type in ('service_completed','credit_sale_completed') and posting_status='revenue_recorded'
    ) then 'approved_refund' else 'advance_refund' end,v_order.id,v_order.order_number,v_order.user_id,v_party,now(),
    'approved_customer_refund',jsonb_build_object('refund_amount',v_refund.amount,'refund_reference',v_refund.refund_reference),auth.uid()
  );
  v_entry := public.post_accounting_event(v_event);
  update public.accounting_refunds set posting_status=(select posting_status from public.accounting_events where id=v_event) where id=v_refund.id;
  return v_entry;
end; $$;

create or replace function public.reverse_accounting_journal(p_journal_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_original public.accounting_journal_entries%rowtype; v_new uuid; v_reversal_event uuid := gen_random_uuid();
  v_line public.accounting_journal_lines%rowtype;
begin
  if not public.has_accounting_role(array['owner']) then raise exception 'OWNER_APPROVAL_REQUIRED'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'REVERSAL_REASON_REQUIRED'; end if;
  select * into v_original from public.accounting_journal_entries where id=p_journal_id for update;
  if not found or v_original.posting_status <> 'posted' then raise exception 'JOURNAL_NOT_REVERSIBLE'; end if;
  insert into public.accounting_events (
    id,idempotency_key,source_platform,source_transaction_type,source_transaction_id,source_record_version,
    event_type,recognition_trigger,source_order_id,order_number,party_name,event_at,accounting_rule,
    created_by,posting_status,posted_at
  ) values (
    v_reversal_event,'journal-reversal:'||v_original.id,'admin_web','journal_reversal',
    v_original.id::text,'1','adjustment_approved','reversal',v_original.source_order_id,
    v_original.reference_number,v_original.party_name,now(),'approved_reversal',auth.uid(),'reversed',now()
  );
  insert into public.accounting_journal_entries (
    event_id,journal_date,reference_number,description,party_name,source_platform,source_type,
    source_transaction_id,source_order_id,template_id,template_version,tax_rule_id,tax_rule_version,
    created_by,approved_by,posting_status,reversal_of_id,correction_reason,posted_at
  ) values (
    v_reversal_event,current_date,v_original.reference_number||'-REV','Reversal: '||v_original.description,
    v_original.party_name,'admin_web','journal_reversal',v_original.id::text,v_original.source_order_id,
    v_original.template_id,v_original.template_version,v_original.tax_rule_id,v_original.tax_rule_version,
    auth.uid(),auth.uid(),'posted',v_original.id,left(trim(p_reason),500),now()
  ) returning id into v_new;
  for v_line in select * from public.accounting_journal_lines where journal_entry_id=v_original.id order by line_number loop
    insert into public.accounting_journal_lines (journal_entry_id,line_number,account_id,description,debit,credit)
    values (v_new,v_line.line_number,v_line.account_id,'Reversal: '||v_line.description,v_line.credit,v_line.debit);
  end loop;
  update public.accounting_journal_entries set posting_status='reversed' where id=v_original.id;
  update public.accounting_events set posting_status='reversed' where id=v_original.event_id;
  return v_new;
end; $$;

create or replace function public.protect_posted_accounting_records()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'POSTED_ACCOUNTING_RECORDS_CANNOT_BE_DELETED'; end if;
  if old.posting_status='posted' and new.posting_status='reversed' then
    new := old;
    new.posting_status := 'reversed';
    return new;
  end if;
  if old.posting_status in ('posted','reversed') then raise exception 'POSTED_ACCOUNTING_RECORDS_ARE_IMMUTABLE'; end if;
  return new;
end; $$;
drop trigger if exists accounting_journal_immutable_v1 on public.accounting_journal_entries;
create trigger accounting_journal_immutable_v1 before update or delete on public.accounting_journal_entries
for each row execute function public.protect_posted_accounting_records();

create or replace function public.accounting_audit_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id text;
begin
  v_id := coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id','');
  insert into public.accounting_audit_log(user_id,action,record_type,record_id,previous_value,new_value,source_platform)
  values(auth.uid(),lower(tg_op),tg_table_name,v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,public.accounting_request_platform());
  return case when tg_op='DELETE' then old else new end;
end; $$;

do $$ declare t text; begin
  foreach t in array array[
    'accounting_staff_roles','accounting_settings','accounting_accounts','accounting_tax_rules',
    'accounting_journal_templates','accounting_journal_template_lines','accounting_service_cost_rules',
    'accounting_expenses','accounting_supplies','accounting_inventory_movements',
    'accounting_budgets','accounting_refunds'
  ] loop
    execute format('drop trigger if exists %I on public.%I','audit_'||t||'_v1',t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.accounting_audit_change()',
      'audit_'||t||'_v1',t);
  end loop;
end $$;

create or replace view public.accounting_trial_balance_v with (security_invoker=true) as
select a.id,a.account_code,a.account_name,a.account_type,a.report_group,
  coalesce(sum(l.debit),0)::numeric(14,2) debit,
  coalesce(sum(l.credit),0)::numeric(14,2) credit,
  (coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0))::numeric(14,2) balance
from public.accounting_accounts a
left join public.accounting_journal_lines l on l.account_id=a.id
left join public.accounting_journal_entries e on e.id=l.journal_entry_id and e.posting_status='posted'
where l.id is null or e.id is not null
group by a.id,a.account_code,a.account_name,a.account_type,a.report_group;

create or replace view public.accounting_ar_ageing_v with (security_invoker=true) as
select i.id,i.invoice_number,i.order_id,i.customer_name,i.invoice_date,i.due_date,
  i.total_amount,i.paid_amount,i.refund_amount,
  greatest(0,i.total_amount-i.paid_amount-i.refund_amount)::numeric(14,2) outstanding_balance,
  greatest(0,current_date-i.due_date) days_overdue,i.payment_status,
  case when i.total_amount-i.paid_amount-i.refund_amount <= 0 then 'settled'
    when current_date<=i.due_date then 'current'
    when current_date-i.due_date<=30 then '1-30'
    when current_date-i.due_date<=60 then '31-60' else '60+' end ageing_group
from public.accounting_invoices i;

create or replace view public.accounting_inventory_v with (security_invoker=true) as
select s.id,s.supply_name,s.unit,s.quantity_on_hand,s.average_unit_cost,
  case when cfg.inventory_cost_method='fifo' then coalesce((
    select round(sum(l.quantity_remaining*l.unit_cost),2) from public.accounting_inventory_layers l
    where l.supply_id=s.id
  ),0) else s.inventory_value end as inventory_value,
  cfg.inventory_cost_method,s.reorder_level,s.active,
  (s.active and s.quantity_on_hand<=s.reorder_level) low_stock,
  coalesce(sum(case when m.approval_status='approved' and m.movement_type='purchase' then m.quantity else 0 end),0) purchases,
  coalesce(sum(case when m.approval_status='approved' and m.movement_type='usage' then m.quantity else 0 end),0) usage
from public.accounting_supplies s cross join public.accounting_settings cfg
left join public.accounting_inventory_movements m on m.supply_id=s.id
where cfg.id=1
group by s.id,cfg.inventory_cost_method;

create or replace view public.accounting_budget_actual_v with (security_invoker=true) as
select b.*,
  coalesce(sum(case
    when b.budget_kind='revenue' and a.account_type='revenue' then l.credit-l.debit
    when b.budget_kind='expense' and a.account_type in ('direct_cost','operating_expense')
      and (b.account_id=a.id or (b.account_id is null and a.account_name ilike b.category||'%'))
      then l.debit-l.credit else 0 end),0)::numeric(14,2) actual_amount,
  (case when b.budget_kind='revenue' then
    coalesce(sum(case when a.account_type='revenue' then l.credit-l.debit else 0 end),0)-b.amount
   else b.amount-coalesce(sum(case when a.account_type in ('direct_cost','operating_expense')
      and (b.account_id=a.id or (b.account_id is null and a.account_name ilike b.category||'%'))
      then l.debit-l.credit else 0 end),0) end)::numeric(14,2) variance
from public.accounting_budgets b
left join public.accounting_journal_entries e on date_trunc('month',e.journal_date)::date=b.budget_month and e.posting_status='posted'
left join public.accounting_journal_lines l on l.journal_entry_id=e.id
left join public.accounting_accounts a on a.id=l.account_id
group by b.id;

create or replace function public.get_accounting_dashboard(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if not public.has_accounting_role(array['owner','admin','accountant','cashier']) then
    raise exception 'ACCOUNTING_ACCESS_REQUIRED';
  end if;
  with amounts as (
    select a.account_type,a.account_code,
      sum(l.credit-l.debit) net_credit,sum(l.debit-l.credit) net_debit
    from public.accounting_journal_entries e
    join public.accounting_journal_lines l on l.journal_entry_id=e.id
    join public.accounting_accounts a on a.id=l.account_id
    where e.posting_status='posted' and e.journal_date between p_from and p_to
    group by a.account_type,a.account_code
  ), totals as (
    select
      coalesce(sum(case when account_type='revenue' then net_credit else 0 end),0) gross_revenue,
      coalesce(sum(case when account_type='revenue_adjustment' then net_debit else 0 end),0) discounts_refunds,
      coalesce(sum(case when account_type='direct_cost' then net_debit else 0 end),0) direct_costs,
      coalesce(sum(case when account_type='operating_expense' then net_debit else 0 end),0) operating_expenses,
      coalesce(sum(case when account_code='110' then net_debit else 0 end),0) receivables
    from amounts
  ), orders as (
    select count(distinct source_order_id) completed_orders from public.accounting_journal_entries
    where posting_status='posted' and journal_date between p_from and p_to
      and source_type='order'
  ), collections as (
    select coalesce(sum(amount),0) collected from public.accounting_receipts
    where (payment_date at time zone 'Asia/Bangkok')::date between p_from and p_to
  )
  select jsonb_build_object(
    'grossRevenue',gross_revenue,'discountsRefunds',discounts_refunds,
    'netRevenue',gross_revenue-discounts_refunds,'cashBankCollected',collected,
    'accountsReceivable',receivables,'directCosts',direct_costs,
    'grossProfit',gross_revenue-discounts_refunds-direct_costs,
    'operatingExpenses',operating_expenses,
    'operatingProfit',gross_revenue-discounts_refunds-direct_costs-operating_expenses,
    'completedOrders',completed_orders,
    'averageRevenuePerOrder',case when completed_orders=0 then 0 else (gross_revenue-discounts_refunds)/completed_orders end,
    'averageCostPerOrder',case when completed_orders=0 then 0 else direct_costs/completed_orders end,
    'operatingProfitMargin',case when gross_revenue-discounts_refunds=0 then 0 else
      ((gross_revenue-discounts_refunds-direct_costs-operating_expenses)/(gross_revenue-discounts_refunds))*100 end
  ) into v_result from totals cross join orders cross join collections;
  return v_result;
end;
$$;

-- RLS: accounting access is isolated from customer and delivery access.
do $$ declare t text; begin
  foreach t in array array[
    'accounting_staff_roles','accounting_settings','accounting_accounts','accounting_tax_rules',
    'accounting_journal_templates','accounting_journal_template_lines','accounting_events',
    'accounting_journal_entries','accounting_journal_lines','accounting_expenses','accounting_supplies',
    'accounting_inventory_movements','accounting_inventory_layers','accounting_service_cost_rules','accounting_order_cost_snapshots',
    'accounting_budgets','accounting_invoices','accounting_invoice_lines','accounting_receipts',
    'accounting_refunds','accounting_reprint_history','accounting_audit_log'
  ] loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create policy accounting_roles_read_self_or_owner on public.accounting_staff_roles for select to authenticated
using (user_id=auth.uid() or public.has_accounting_role(array['owner']));
create policy accounting_roles_owner_insert on public.accounting_staff_roles for insert to authenticated
with check (public.has_accounting_role(array['owner']));
create policy accounting_roles_owner_update on public.accounting_staff_roles for update to authenticated
using (public.has_accounting_role(array['owner'])) with check (public.has_accounting_role(array['owner']));

do $$ declare t text; begin
  foreach t in array array['accounting_settings','accounting_accounts','accounting_tax_rules','accounting_journal_templates','accounting_journal_template_lines','accounting_service_cost_rules','accounting_budgets'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_accounting_role(array[''owner'',''accountant'']))','accounting_config_read_'||t,t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_accounting_role(array[''owner'']))','accounting_config_insert_'||t,t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_accounting_role(array[''owner''])) with check (public.has_accounting_role(array[''owner'']))','accounting_config_update_'||t,t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['accounting_events','accounting_journal_entries','accounting_journal_lines','accounting_expenses','accounting_supplies','accounting_inventory_movements','accounting_inventory_layers','accounting_order_cost_snapshots','accounting_invoices','accounting_invoice_lines','accounting_receipts','accounting_refunds','accounting_reprint_history','accounting_audit_log'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_accounting_role(array[''owner'',''accountant'',''cashier'']))','accounting_records_read_'||t,t);
  end loop;
end $$;

create policy accounting_expenses_create on public.accounting_expenses for insert to authenticated
with check (created_by=auth.uid() and public.has_accounting_role(array['owner','accountant']));
create policy accounting_expenses_edit_draft on public.accounting_expenses for update to authenticated
using (approval_status='draft' and public.has_accounting_role(array['owner','accountant']))
with check (approval_status='draft' and public.has_accounting_role(array['owner','accountant']));
create policy accounting_supplies_create on public.accounting_supplies for insert to authenticated
with check (public.has_accounting_role(array['owner','accountant']));
create policy accounting_supplies_update on public.accounting_supplies for update to authenticated
using (public.has_accounting_role(array['owner','accountant'])) with check (public.has_accounting_role(array['owner','accountant']));
create policy accounting_movements_create on public.accounting_inventory_movements for insert to authenticated
with check (created_by=auth.uid() and public.has_accounting_role(array['owner','accountant']));
create policy accounting_movements_edit_draft on public.accounting_inventory_movements for update to authenticated
using (approval_status='draft' and public.has_accounting_role(array['owner','accountant']))
with check (approval_status='draft' and public.has_accounting_role(array['owner','accountant']));
create policy accounting_refunds_create on public.accounting_refunds for insert to authenticated
with check (created_by=auth.uid() and public.has_accounting_role(array['owner','accountant']));
create policy accounting_refunds_edit_draft on public.accounting_refunds for update to authenticated
using (approval_status='draft' and public.has_accounting_role(array['owner','accountant']))
with check (approval_status='draft' and public.has_accounting_role(array['owner','accountant']));
create policy accounting_reprints_create on public.accounting_reprint_history for insert to authenticated
with check (user_id=auth.uid() and public.has_accounting_role(array['owner','accountant','cashier']));

-- Realtime payloads are refresh triggers only; clients refetch authoritative
-- role-filtered records after an event, so full replica identity is unnecessary.
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array[
      'accounting_events','accounting_journal_entries','accounting_expenses',
      'accounting_inventory_movements','accounting_receipts','accounting_refunds'
    ] loop
      if not exists (
        select 1 from pg_publication p
        join pg_publication_rel pr on pr.prpubid=p.oid
        join pg_class c on c.oid=pr.prrelid
        join pg_namespace n on n.oid=c.relnamespace
        where p.pubname='supabase_realtime' and n.nspname='public' and c.relname=t
      ) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

revoke all on function public.post_accounting_event(uuid) from public,anon,authenticated;
revoke all on function public.enqueue_accounting_event(text,text,text,text,text,text,text,uuid,text,uuid,text,timestamptz,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.accounting_materialize_documents(uuid) from public,anon,authenticated;
revoke all on function public.create_accounting_template_version(text,text,text,text,text,text,date,boolean,text) from public,anon,authenticated;
revoke all on function public.accounting_stamp_order_platform() from public,anon,authenticated;
revoke all on function public.accounting_audit_change() from public,anon,authenticated;
revoke all on function public.protect_posted_accounting_records() from public,anon,authenticated;
revoke all on function public.protect_accounting_inventory_method() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'accounting_staff_roles','accounting_settings','accounting_accounts','accounting_tax_rules',
    'accounting_journal_templates','accounting_journal_template_lines','accounting_events',
    'accounting_journal_entries','accounting_journal_lines','accounting_expenses','accounting_supplies',
    'accounting_inventory_movements','accounting_inventory_layers','accounting_service_cost_rules',
    'accounting_order_cost_snapshots','accounting_budgets','accounting_invoices','accounting_invoice_lines',
    'accounting_receipts','accounting_refunds','accounting_reprint_history','accounting_audit_log'
  ] loop execute format('grant select on table public.%I to authenticated',t); end loop;
  foreach t in array array[
    'accounting_staff_roles','accounting_settings','accounting_accounts','accounting_tax_rules',
    'accounting_journal_templates','accounting_journal_template_lines','accounting_expenses',
    'accounting_supplies','accounting_inventory_movements','accounting_service_cost_rules',
    'accounting_budgets','accounting_refunds','accounting_reprint_history'
  ] loop execute format('grant insert,update on table public.%I to authenticated',t); end loop;
end $$;
grant execute on function public.retry_accounting_event(uuid) to authenticated;
grant execute on function public.reverse_accounting_journal(uuid,text) to authenticated;
grant execute on function public.approve_accounting_expense(uuid) to authenticated;
grant execute on function public.approve_inventory_movement(uuid) to authenticated;
grant execute on function public.approve_accounting_journal(uuid) to authenticated;
grant execute on function public.create_accounting_template_version(text,text,text,text,text,text,date,boolean,text) to authenticated;
grant execute on function public.record_accounting_collection(uuid,numeric,text,text) to authenticated;
grant execute on function public.approve_accounting_refund(uuid) to authenticated;
grant execute on function public.get_accounting_dashboard(date,date) to authenticated;
grant select on public.accounting_trial_balance_v,public.accounting_ar_ageing_v,public.accounting_inventory_v,public.accounting_budget_actual_v to authenticated;

notify pgrst, 'reload schema';
commit;
