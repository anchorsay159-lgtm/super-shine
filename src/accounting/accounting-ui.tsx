import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import {
  AdminCard, AdminKpiCard, AdminLoadingState, AdminPage, AdminSectionTabs,
  EmptyState, ErrorState, SectionTitle, StatusBadge,
} from '@/admin/admin-ui';
import { Button } from '@/components/super-ui';
import { Colors, FontFamily, FontFamilyMedium, Radius } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { supabase } from '@/lib/supabase';

type Tab = 'dashboard' | 'journals' | 'expenses' | 'inventory' | 'receivables' | 'reports' | 'settings';
type StaffRole = 'owner' | 'admin' | 'accountant' | 'cashier';
type Row = Record<string, any>;
type Dashboard = {
  grossRevenue: number; discountsRefunds: number; netRevenue: number; cashBankCollected: number;
  accountsReceivable: number; directCosts: number; grossProfit: number; operatingExpenses: number;
  operatingProfit: number; completedOrders: number; averageRevenuePerOrder: number;
  averageCostPerOrder: number; operatingProfitMargin: number;
};

const EMPTY_DASHBOARD: Dashboard = {
  grossRevenue: 0, discountsRefunds: 0, netRevenue: 0, cashBankCollected: 0,
  accountsReceivable: 0, directCosts: 0, grossProfit: 0, operatingExpenses: 0,
  operatingProfit: 0, completedOrders: 0, averageRevenuePerOrder: 0,
  averageCostPerOrder: 0, operatingProfitMargin: 0,
};
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' }, { id: 'journals', label: 'Journals' },
  { id: 'expenses', label: 'Expenses' }, { id: 'inventory', label: 'Inventory' },
  { id: 'receivables', label: 'Receivables' }, { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

function money(value: unknown) { return `฿${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0))}`; }
function todayBangkok() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()); }
function firstMonthDay() { return `${todayBangkok().slice(0, 7)}-01`; }
function safeError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202'
    ? 'The accounting database migration has not been deployed yet.'
    : 'We could not update the accounting information.';
}

export function AccountingAdminScreen() {
  const { profile, userId } = useApp();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [from, setFrom] = useState(firstMonthDay());
  const [to, setTo] = useState(todayBangkok());
  const [role, setRole] = useState<StaffRole>(profile.role === 'admin' ? 'owner' : 'admin');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [events, setEvents] = useState<Row[]>([]);
  const [journals, setJournals] = useState<Row[]>([]);
  const [trialBalance, setTrialBalance] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [inventory, setInventory] = useState<Row[]>([]);
  const [movements, setMovements] = useState<Row[]>([]);
  const [receivables, setReceivables] = useState<Row[]>([]);
  const [receipts, setReceipts] = useState<Row[]>([]);
  const [refunds, setRefunds] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [taxRules, setTaxRules] = useState<Row[]>([]);
  const [costRules, setCostRules] = useState<Row[]>([]);
  const [costSnapshots, setCostSnapshots] = useState<Row[]>([]);
  const [budgets, setBudgets] = useState<Row[]>([]);
  const [services, setServices] = useState<Row[]>([]);
  const [accountingSettings, setAccountingSettings] = useState<Row>({});

  const canAccount = role === 'owner' || role === 'accountant';
  const canConfigure = role === 'owner';
  const visibleTabs = role === 'admin' ? TABS.filter((item) => item.id === 'dashboard')
    : role === 'cashier' ? TABS.filter((item) => ['dashboard','receivables','reports'].includes(item.id))
      : TABS;

  const load = useCallback(async (background = false) => {
    if (!supabase || !userId) { setError('Supabase is not configured.'); setLoading(false); return; }
    if (background) setRefreshing(true);
    else setLoading(true);
    setError('');
    const results = await Promise.all([
      supabase.from('accounting_staff_roles').select('staff_role,active').eq('user_id', userId).maybeSingle(),
      supabase.from('accounting_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.rpc('get_accounting_dashboard', { p_from: from, p_to: to }),
      supabase.from('accounting_events').select('*').gte('event_at', `${from}T00:00:00+07:00`).lte('event_at', `${to}T23:59:59+07:00`).order('event_at', { ascending: false }).limit(100),
      supabase.from('accounting_journal_entries').select('*,accounting_journal_lines(*,accounting_accounts(account_code,account_name))').gte('journal_date', from).lte('journal_date', to).order('journal_date', { ascending: false }).limit(100),
      supabase.from('accounting_trial_balance_v').select('*').order('account_code'),
      supabase.from('accounting_expenses').select('*').order('expense_date', { ascending: false }).limit(100),
      supabase.from('accounting_inventory_v').select('*').order('supply_name'),
      supabase.from('accounting_inventory_movements').select('*,accounting_supplies(supply_name,unit)').order('movement_date', { ascending: false }).limit(100),
      supabase.from('accounting_ar_ageing_v').select('*').order('due_date'),
      supabase.from('accounting_receipts').select('*').order('payment_date', { ascending: false }).limit(100),
      supabase.from('accounting_refunds').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('accounting_accounts').select('*').order('account_code'),
      supabase.from('accounting_journal_templates').select('*,accounting_journal_template_lines(*,accounting_accounts(account_code,account_name))').order('template_name'),
      supabase.from('accounting_tax_rules').select('*').order('effective_date', { ascending: false }),
      supabase.from('accounting_service_cost_rules').select('*,services(name)').order('effective_date', { ascending: false }),
      supabase.from('accounting_order_cost_snapshots').select('*,services(name)').limit(500),
      supabase.from('accounting_budget_actual_v').select('*').order('budget_month', { ascending: false }),
      supabase.from('services').select('id,name').order('sort_order'),
    ]);
    const failure = results.find((result) => result.error && result.error.code !== '42501')?.error;
    if (failure) setError(safeError(failure));
    const [roleResult,settingsResult,dashboardResult,eventResult,journalResult,trialResult,expenseResult,inventoryResult,
      movementResult,arResult,receiptResult,refundResult,accountResult,templateResult,taxResult,costResult,snapshotResult,
      budgetResult,serviceResult] = results;
    if (roleResult.data?.active) setRole(roleResult.data.staff_role as StaffRole);
    else if (profile.role === 'admin') setRole('owner');
    setAccountingSettings(settingsResult.data || {});
    setDashboard((dashboardResult.data as Dashboard | null) || EMPTY_DASHBOARD);
    setEvents(eventResult.data || []); setJournals(journalResult.data || []); setTrialBalance(trialResult.data || []);
    setExpenses(expenseResult.data || []); setInventory(inventoryResult.data || []); setMovements(movementResult.data || []);
    setReceivables(arResult.data || []); setReceipts(receiptResult.data || []); setRefunds(refundResult.data || []); setAccounts(accountResult.data || []);
    setTemplates(templateResult.data || []); setTaxRules(taxResult.data || []); setCostRules(costResult.data || []);
    setCostSnapshots(snapshotResult.data || []); setBudgets(budgetResult.data || []); setServices(serviceResult.data || []);
    setLoading(false); setRefreshing(false);
  }, [from, profile.role, to, userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const channelName = `admin-accounting:${userId}`;
    const topic = `realtime:${channelName}`;
    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;
    void (async () => {
      const existing = client.getChannels().find((item) => item.topic === topic);
      if (existing) await client.removeChannel(existing);
      if (cancelled) return;
      channel = client.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounting_events' }, () => void load(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'accounting_journal_entries' }, () => void load(true))
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [load, userId]);

  async function action(key: string, operation: () => PromiseLike<{ error: any }>, message: string) {
    if (saving) return;
    setSaving(key); setError(''); setFeedback('');
    const result = await operation();
    setSaving('');
    if (result.error) return setError(safeError(result.error));
    setFeedback(message); await load(true);
  }

  return <AdminPage title="Accounting" subtitle="Adaptable SME accounting and management reporting designed with reference to TFRS/IFRS principles." actions={<Button label="Refresh" variant="secondary" onPress={() => void load(true)} loading={refreshing} style={styles.headerButton} />}>
    {feedback ? <View style={styles.feedback}><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    <AdminCard style={styles.tabs}><AdminSectionTabs items={visibleTabs} value={tab} onChange={(value) => setTab(value as Tab)} /></AdminCard>
    <AdminCard style={styles.range}><Field label="From" value={from} onChangeText={setFrom} style={styles.dateField} /><Field label="To" value={to} onChangeText={setTo} style={styles.dateField} /><StatusBadge label={role.replace('_',' ')} tone={role === 'owner' ? 'teal' : 'blue'} /></AdminCard>
    {loading ? <AdminLoadingState rows={7} /> : null}
    {!loading && tab === 'dashboard' ? <DashboardPanel data={dashboard} width={width} events={events} /> : null}
    {!loading && tab === 'journals' ? <JournalsPanel journals={journals} events={events} saving={saving} canAccount={canAccount} action={action} /> : null}
    {!loading && tab === 'expenses' ? <ExpensesPanel rows={expenses} userId={userId!} saving={saving} canEdit={canAccount} action={action} /> : null}
    {!loading && tab === 'inventory' ? <InventoryPanel rows={inventory} movements={movements} userId={userId!} saving={saving} canEdit={canAccount} action={action} /> : null}
    {!loading && tab === 'receivables' ? <ReceivablesPanel rows={receivables} receipts={receipts} refunds={refunds} userId={userId!} saving={saving} canCollect={['owner','accountant','cashier'].includes(role)} canRefund={canAccount} action={action} /> : null}
    {!loading && tab === 'reports' ? <ReportsPanel dashboard={dashboard} trial={trialBalance} events={events} receivables={receivables} inventory={inventory} budgets={budgets} snapshots={costSnapshots} /> : null}
    {!loading && tab === 'settings' ? <SettingsPanel accountingSettings={accountingSettings} accounts={accounts} templates={templates} taxes={taxRules} costs={costRules} budgets={budgets} services={services} userId={userId!} canConfigure={canConfigure} saving={saving} action={action} /> : null}
  </AdminPage>;
}

function DashboardPanel({ data, width, events }: { data: Dashboard; width: number; events: Row[] }) {
  const cards: [string,string,string,'positive'|'warning'|'neutral'][] = [
    ['Gross revenue',money(data.grossRevenue),'Posted revenue credits','positive'],
    ['Discounts and refunds',money(data.discountsRefunds),'Posted revenue adjustments','warning'],
    ['Net revenue',money(data.netRevenue),'Gross less adjustments','positive'],
    ['Cash and bank collected',money(data.cashBankCollected),'Posted cash and bank movement','positive'],
    ['Accounts receivable',money(data.accountsReceivable),'Posted receivable balance','warning'],
    ['Direct costs',money(data.directCosts),'Posted direct costs','neutral'],
    ['Gross profit',money(data.grossProfit),'Net revenue less direct costs',data.grossProfit >= 0 ? 'positive' : 'warning'],
    ['Operating expenses',money(data.operatingExpenses),'Posted operating expenses','neutral'],
    ['Operating profit',money(data.operatingProfit),`${Number(data.operatingProfitMargin || 0).toFixed(1)}% margin`,data.operatingProfit >= 0 ? 'positive' : 'warning'],
    ['Completed orders',String(data.completedOrders),'Orders linked to posted revenue','neutral'],
    ['Average revenue / order',money(data.averageRevenuePerOrder),'Zero-safe calculation','neutral'],
    ['Average cost / order',money(data.averageCostPerOrder),'Zero-safe calculation','neutral'],
  ];
  const exceptions = events.filter((event) => event.posting_status === 'pending_review');
  return <View style={styles.section}><View style={styles.kpis}>{cards.map(([label,value,note,indicator]) => <AdminKpiCard key={label} label={label} value={value} note={note} indicator={indicator} />)}</View><View style={[styles.split, width < 900 && styles.stack]}><AdminCard style={styles.panel}><SectionTitle title="Posting health" subtitle="Current filtered period" /><Metric label="Successful events" value={String(events.length-exceptions.length)} /><Metric label="Pending review" value={String(exceptions.length)} attention={Boolean(exceptions.length)} /></AdminCard><AdminCard style={styles.panel}><SectionTitle title="Control reminder" subtitle="Financial reporting basis" /><Text style={styles.body}>Only posted journal lines feed the accounting dashboard. Operational totals are not substituted when posting fails.</Text></AdminCard></View></View>;
}

function JournalsPanel({ journals, events, saving, canAccount, action }: { journals: Row[]; events: Row[]; saving: string; canAccount: boolean; action: Action }) {
  const [reason, setReason] = useState('Correction approved by owner');
  const exceptions = events.filter((event) => event.posting_status === 'pending_review');
  return <View style={styles.section}><SectionTitle title="Journal entries" subtitle="Posted records are immutable; corrections use reversal" />
    {journals.length ? <View style={styles.list}>{journals.map((journal) => <AdminCard key={journal.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{journal.journal_number}</Text><Text style={styles.muted}>{journal.journal_date} · {journal.reference_number} · {journal.source_platform}</Text></View><StatusBadge label={journal.posting_status} tone={journal.posting_status === 'posted' ? 'green' : journal.posting_status === 'reversed' ? 'gray' : 'amber'} /></View><Text style={styles.body}>{journal.description}</Text><View style={styles.lines}>{(journal.accounting_journal_lines || []).sort((a: Row,b: Row) => a.line_number-b.line_number).map((line: Row) => <Text key={line.id} style={styles.line}>{line.accounting_accounts?.account_code} {line.accounting_accounts?.account_name} · Dr {money(line.debit)} · Cr {money(line.credit)}</Text>)}</View>{canAccount && journal.posting_status === 'pending_approval' ? <Button label="Approve and post journal" variant="secondary" disabled={saving !== ''} loading={saving === `approve-${journal.id}`} onPress={() => action(`approve-${journal.id}`, () => supabase!.rpc('approve_accounting_journal', { p_journal_id: journal.id }), 'Journal approved and posted.')} style={styles.smallButton} /> : null}{canAccount && journal.posting_status === 'posted' ? <Button label="Reverse journal" variant="ghost" disabled={saving !== ''} loading={saving === `reverse-${journal.id}`} onPress={() => action(`reverse-${journal.id}`, () => supabase!.rpc('reverse_accounting_journal', { p_journal_id: journal.id, p_reason: reason }), 'Reversal journal posted.')} style={styles.smallButton} /> : null}</AdminCard>)}</View> : <EmptyState title="No journals in this period" description="Posted events will appear here." />}
    {canAccount ? <Field label="Reversal reason used by the action above" value={reason} onChangeText={setReason} /> : null}
    <SectionTitle title="Exception queue" subtitle="Failed events stay pending review" />
    {exceptions.length ? <View style={styles.list}>{exceptions.map((event) => <AdminCard key={event.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{event.event_type}</Text><Text style={styles.muted}>{event.order_number || event.source_transaction_id} · retries {event.retry_count}</Text></View><StatusBadge label="Pending review" tone="amber" /></View><Text style={styles.safeError}>Posting failed. Review the event mapping and retry.</Text>{canAccount ? <Button label="Retry" variant="secondary" loading={saving === `retry-${event.id}`} onPress={() => action(`retry-${event.id}`, () => supabase!.rpc('retry_accounting_event', { p_event_id: event.id }), 'Event retried.')} style={styles.smallButton} /> : null}</AdminCard>)}</View> : <EmptyState title="No posting exceptions" description="All events in this period passed the posting controls." />}
  </View>;
}

type Action = (key: string, operation: () => PromiseLike<{ error: any }>, message: string) => Promise<void>;

function ExpensesPanel({ rows, userId, saving, canEdit, action }: { rows: Row[]; userId: string; saving: string; canEdit: boolean; action: Action }) {
  const [date,setDate] = useState(todayBangkok()); const [category,setCategory] = useState('Other operating expense');
  const [description,setDescription] = useState(''); const [amount,setAmount] = useState('');
  const [payment,setPayment] = useState('bank'); const [costClass,setCostClass] = useState('operating_expense');
  async function create() {
    const value=Number(amount); if (!category.trim() || !date || !description.trim() || !Number.isFinite(value) || value<=0) return;
    await action('expense-new', () => supabase!.from('accounting_expenses').insert({ expense_date:date,category:category.trim(),description:description.trim(),amount:value,payment_method:payment,cost_class:costClass,created_by:userId,idempotency_key:`admin:${userId}:${Date.now()}` }), 'Expense draft created.');
    setDescription(''); setAmount('');
  }
  return <View style={styles.section}><SectionTitle title="Expense entry" subtitle="Approval and posting are separate controls" />{canEdit ? <AdminCard style={styles.form}><View style={styles.formGrid}><Field label="Date" value={date} onChangeText={setDate} style={styles.fieldGrow} /><Field label="Category" value={category} onChangeText={setCategory} style={styles.fieldGrow} /><Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.fieldGrow} /><Field label="Payment: cash, bank, accounts_payable" value={payment} onChangeText={setPayment} style={styles.fieldGrow} /><Field label="Class: direct_cost or operating_expense" value={costClass} onChangeText={setCostClass} style={styles.fieldGrow} /></View><Field label="Description" value={description} onChangeText={setDescription} /><Button label="Create expense draft" onPress={() => void create()} loading={saving==='expense-new'} style={styles.smallButton} /></AdminCard> : null}
    <View style={styles.list}>{rows.map((row) => <AdminCard key={row.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{row.category} · {money(row.amount)}</Text><Text style={styles.muted}>{row.expense_date} · {row.payment_method} · {row.cost_class}</Text></View><StatusBadge label={`${row.approval_status} / ${row.posting_status}`} tone={row.posting_status==='fully_settled' ? 'green' : 'amber'} /></View><Text style={styles.body}>{row.description}</Text>{canEdit && row.approval_status==='draft' ? <Button label="Approve and post" variant="secondary" loading={saving===`expense-${row.id}`} onPress={() => action(`expense-${row.id}`, () => supabase!.rpc('approve_accounting_expense',{p_expense_id:row.id}), 'Expense approved.')} style={styles.smallButton} /> : null}</AdminCard>)}</View>
  </View>;
}

function InventoryPanel({ rows, movements, userId, saving, canEdit, action }: { rows: Row[]; movements: Row[]; userId: string; saving: string; canEdit: boolean; action: Action }) {
  const [name,setName]=useState(''); const [unit,setUnit]=useState('kg'); const [reorder,setReorder]=useState('0');
  const [supplyId,setSupplyId]=useState(''); const [type,setType]=useState('purchase'); const [quantity,setQuantity]=useState(''); const [cost,setCost]=useState('');
  const selected=supplyId || rows[0]?.id || '';
  return <View style={styles.section}><SectionTitle title="Supplies inventory" subtitle="Weighted-average or FIFO is selected in accounting settings; LIFO is not available" />
    {canEdit ? <AdminCard style={styles.form}><View style={styles.formGrid}><Field label="New supply name" value={name} onChangeText={setName} style={styles.fieldGrow} /><Field label="Unit" value={unit} onChangeText={setUnit} style={styles.fieldGrow} /><Field label="Reorder level" value={reorder} onChangeText={setReorder} keyboardType="decimal-pad" style={styles.fieldGrow} /></View><Button label="Add supply" variant="secondary" loading={saving==='supply-new'} onPress={() => action('supply-new', () => supabase!.from('accounting_supplies').insert({supply_name:name.trim(),unit:unit.trim(),reorder_level:Number(reorder)||0,created_by:userId,updated_by:userId}), 'Supply added.')} style={styles.smallButton} /></AdminCard> : null}
    <View style={styles.cardGrid}>{rows.map((row) => <Pressable key={row.id} onPress={() => setSupplyId(row.id)}><AdminCard style={[styles.stockCard, selected===row.id && styles.selected]}><View style={styles.rowTop}><Text style={styles.title}>{row.supply_name}</Text>{row.low_stock ? <StatusBadge label="Low stock" tone="amber" /> : <StatusBadge label="In stock" tone="green" />}</View><Text style={styles.stock}>{Number(row.quantity_on_hand).toFixed(2)} {row.unit}</Text><Text style={styles.muted}>{money(row.inventory_value)} · average {money(row.average_unit_cost)}</Text></AdminCard></Pressable>)}</View>
    {canEdit && selected ? <AdminCard style={styles.form}><Text style={styles.title}>New movement</Text><View style={styles.chips}>{['purchase','usage','adjustment_in','adjustment_out'].map((value) => <Pressable key={value} onPress={() => setType(value)} style={[styles.chip,type===value&&styles.chipActive]}><Text style={[styles.chipText,type===value&&styles.chipTextActive]}>{value.replace('_',' ')}</Text></Pressable>)}</View><View style={styles.formGrid}><Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.fieldGrow} /><Field label="Unit cost" value={cost} onChangeText={setCost} keyboardType="decimal-pad" style={styles.fieldGrow} /></View><Button label="Create movement draft" onPress={() => action('movement-new', () => supabase!.from('accounting_inventory_movements').insert({supply_id:selected,movement_date:todayBangkok(),movement_type:type,quantity:Number(quantity),unit_cost:Number(cost)||0,idempotency_key:`admin:${userId}:${Date.now()}`,created_by:userId}), 'Movement draft created.')} loading={saving==='movement-new'} style={styles.smallButton} /></AdminCard> : null}
    <SectionTitle title="Movement history" subtitle="Purchase and usage records remain separate" /><View style={styles.list}>{movements.map((row) => <AdminCard key={row.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{row.accounting_supplies?.supply_name} · {row.movement_type}</Text><Text style={styles.muted}>{row.movement_date} · {row.quantity} {row.accounting_supplies?.unit} · {money(row.total_cost)}</Text></View><StatusBadge label={`${row.approval_status} / ${row.posting_status}`} tone={row.approval_status==='approved' ? 'green' : 'amber'} /></View>{canEdit && row.approval_status==='draft' ? <Button label="Approve movement" variant="secondary" loading={saving===`movement-${row.id}`} onPress={() => action(`movement-${row.id}`, () => supabase!.rpc('approve_inventory_movement',{p_movement_id:row.id}), 'Movement approved.')} style={styles.smallButton} /> : null}</AdminCard>)}</View>
  </View>;
}

function ReceivablesPanel({ rows, receipts, refunds, userId, saving, canCollect, canRefund, action }: { rows: Row[]; receipts: Row[]; refunds: Row[]; userId: string; saving: string; canCollect: boolean; canRefund: boolean; action: Action }) {
  const [selected,setSelected]=useState(''); const [amount,setAmount]=useState(''); const [reference,setReference]=useState(''); const [method,setMethod]=useState('bank');
  const [refundAmount,setRefundAmount]=useState(''); const [refundReason,setRefundReason]=useState('');
  const invoice=rows.find((row)=>row.order_id===(selected||rows[0]?.order_id));
  async function printDocument(id: string) {
    await action(`print-${id}`, () => supabase!.from('accounting_reprint_history').insert({document_type:'invoice',document_id:id,action:'print',user_id:userId}), 'Print recorded.');
    if (Platform.OS==='web' && typeof window!=='undefined') window.print();
  }
  return <View style={styles.section}><SectionTitle title="Accounts receivable ageing" subtitle="Invoices show amounts owed; receipts prove confirmed payment" />
    {(canCollect||canRefund)&&invoice ? <AdminCard style={styles.form}><Text style={styles.title}>Selected invoice: {invoice.invoice_number}</Text><View style={styles.chips}>{rows.filter((row)=>Number(row.outstanding_balance)>0).map((row)=><Pressable key={row.id} onPress={()=>setSelected(row.order_id)} style={[styles.chip,invoice.id===row.id&&styles.chipActive]}><Text style={[styles.chipText,invoice.id===row.id&&styles.chipTextActive]}>{row.invoice_number}</Text></Pressable>)}</View>{canCollect ? <><View style={styles.formGrid}><Field label="Collection amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.fieldGrow} /><Field label="Unique payment reference" value={reference} onChangeText={setReference} style={styles.fieldGrow} /><Field label="Method: cash or bank" value={method} onChangeText={setMethod} style={styles.fieldGrow} /></View><Button label="Record confirmed collection" onPress={()=>action('collection-new',()=>supabase!.rpc('record_accounting_collection',{p_order_id:invoice.order_id,p_amount:Number(amount),p_method:method,p_reference:reference.trim()}),'Collection recorded without recording revenue again.')} loading={saving==='collection-new'} style={styles.smallButton} /></> : null}{canRefund ? <><View style={styles.formGrid}><Field label="Refund amount" value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" style={styles.fieldGrow} /><Field label="Refund reason" value={refundReason} onChangeText={setRefundReason} style={styles.fieldGrow} /></View><Button label="Create refund draft" variant="secondary" onPress={()=>action('refund-new',()=>supabase!.from('accounting_refunds').insert({order_id:invoice.order_id,refund_reference:`refund-${Date.now()}`,amount:Number(refundAmount),reason:refundReason.trim(),created_by:userId}),'Refund draft created for approval.')} loading={saving==='refund-new'} style={styles.smallButton} /></> : null}</AdminCard> : null}
    {rows.length ? <View style={styles.list}>{rows.map((row) => <AdminCard key={row.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{row.invoice_number} · {row.customer_name}</Text><Text style={styles.muted}>Invoice {row.invoice_date} · due {row.due_date} · {row.days_overdue} days overdue</Text></View><StatusBadge label={`${row.ageing_group} / ${row.payment_status}`} tone={Number(row.outstanding_balance)>0 ? 'amber' : 'green'} /></View><View style={styles.metrics}><Metric label="Invoice" value={money(row.total_amount)} /><Metric label="Paid" value={money(row.paid_amount)} /><Metric label="Refund" value={money(row.refund_amount)} /><Metric label="Outstanding" value={money(row.outstanding_balance)} attention={Number(row.outstanding_balance)>0} /></View><Button label="Print / Save PDF" variant="secondary" loading={saving===`print-${row.id}`} onPress={() => void printDocument(row.id)} style={styles.smallButton} /></AdminCard>)}</View> : <EmptyState title="No invoices" description="A separate invoice is generated when a real order reaches the configured recognition stage." />}
    <SectionTitle title="Receipts" subtitle="Never generated for an unconfirmed payment" />{receipts.length ? <View style={styles.list}>{receipts.map((row) => <AdminCard key={row.id} style={styles.rowCard}><Text style={styles.title}>{row.receipt_number} · {money(row.amount)}</Text><Text style={styles.muted}>{new Date(row.payment_date).toLocaleString()} · {row.payment_method} · remaining {money(row.remaining_balance)}</Text></AdminCard>)}</View> : <EmptyState title="No receipts" description="Confirmed collections will appear here." />}
    <SectionTitle title="Refunds" subtitle="Original payment and revenue records remain intact" />{refunds.length ? <View style={styles.list}>{refunds.map((row)=><AdminCard key={row.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{row.refund_reference} · {money(row.amount)}</Text><Text style={styles.muted}>{row.reason}</Text></View><StatusBadge label={`${row.approval_status} / ${row.posting_status}`} tone={row.approval_status==='approved'?'green':'amber'} /></View>{canRefund&&row.approval_status==='draft'?<Button label="Approve refund" variant="secondary" loading={saving===`refund-${row.id}`} onPress={()=>action(`refund-${row.id}`,()=>supabase!.rpc('approve_accounting_refund',{p_refund_id:row.id}),'Refund approved and posted.')} style={styles.smallButton} />:null}</AdminCard>)}</View>:<EmptyState title="No refunds" description="Approved full and partial refunds will remain traceable here." />}
  </View>;
}

function ReportsPanel({ dashboard, trial, events, receivables, inventory, budgets, snapshots }: { dashboard: Dashboard; trial: Row[]; events: Row[]; receivables: Row[]; inventory: Row[]; budgets: Row[]; snapshots: Row[] }) {
  const posted=events.filter((event)=>!['not_recorded','pending_review','pending_approval'].includes(event.posting_status));
  const serviceValues=useMemo(() => {
    const values: Record<string,{revenue:number;discount:number;cost:number;orders:Set<string>}>={};
    posted.filter((event)=>['service_completed','credit_sale_completed'].includes(event.event_type)).forEach((event)=>{
      const lines=Array.isArray(event.payload?.services)?event.payload.services:[]; const serviceTotal=Number(event.payload?.service_subtotal||0); const discount=Number(event.payload?.discount_total||0);
      lines.forEach((line:Row)=>{const key=line.name||'Other';const current=values[key]||{revenue:0,discount:0,cost:0,orders:new Set<string>()};const revenue=Number(line.revenue||0);current.revenue+=revenue;current.discount+=serviceTotal?discount*(revenue/serviceTotal):0;current.orders.add(event.source_order_id);values[key]=current;});
    });
    snapshots.forEach((snapshot)=>{ const key=snapshot.services?.name||'All services'; const current=values[key]||{revenue:0,discount:0,cost:0,orders:new Set<string>()}; current.cost+=Number(snapshot.total_cost||0); values[key]=current; });
    return Object.entries(values).map(([name,value])=>({name,...value,count:value.orders.size,net:value.revenue-value.discount,margin:value.revenue-value.discount-value.cost}));
  },[posted,snapshots]);
  function exportCsv() {
    if (Platform.OS!=='web' || typeof document==='undefined') return;
    const rows=[['Account','Name','Debit','Credit','Balance'],...trial.map((row)=>[row.account_code,row.account_name,row.debit,row.credit,row.balance])];
    const csv=rows.map((row)=>row.map((cell)=>`"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); const a=document.createElement('a'); a.href=url;a.download='super-shine-trial-balance.csv';a.click();URL.revokeObjectURL(url);
  }
  return <View style={styles.section}><View style={styles.rowTop}><SectionTitle title="Accounting reports" subtitle="All figures trace to posted journals or frozen source snapshots" /><Button label="Export trial balance CSV" variant="secondary" onPress={exportCsv} style={styles.smallButton} /></View>
    <ReportSummary title="Revenue, gross profit and operating profit" rows={[['Gross revenue',money(dashboard.grossRevenue)],['Net revenue',money(dashboard.netRevenue)],['Gross profit',money(dashboard.grossProfit)],['Operating profit',money(dashboard.operatingProfit)]]} />
    <SectionTitle title="Trial balance" subtitle="Debit and credit totals must match" /><AdminCard style={styles.report}><TableHeader cells={['Account','Debit','Credit','Balance']} />{trial.map((row)=><TableRow key={row.id} cells={[`${row.account_code} ${row.account_name}`,money(row.debit),money(row.credit),money(row.balance)]} />)}<TableRow strong cells={['Total',money(trial.reduce((s,r)=>s+Number(r.debit),0)),money(trial.reduce((s,r)=>s+Number(r.credit),0)),'']} /></AdminCard>
    <SectionTitle title="Service profitability" subtitle="Uses historical revenue payloads and cost snapshots" /><AdminCard style={styles.report}>{serviceValues.length ? serviceValues.map((row)=><TableRow key={row.name} cells={[`${row.name} · ${row.count} orders`,money(row.net),money(row.cost),`${money(row.margin)} · ${row.net?((row.margin/row.net)*100).toFixed(1):'0.0'}%`]} />) : <EmptyState title="No service profitability data" description="Create approved service cost rules before order recognition to freeze costs." />}</AdminCard>
    <SectionTitle title="Budget versus actual" subtitle="Favourability is shown in text as well as color" /><AdminCard style={styles.report}>{budgets.length ? budgets.map((row)=>{const actual=Number(row.actual_amount||0);const variance=Number(row.variance||0);return <TableRow key={row.id} cells={[`${row.budget_month} · ${row.category}`,money(row.amount),money(actual),`${money(variance)} · ${Number(row.amount)?((variance/Number(row.amount))*100).toFixed(1):'0.0'}% · ${variance>=0?'Favourable':'Unfavourable'}${row.explanation?` · ${row.explanation}`:''}`]} />;}) : <EmptyState title="No budgets" description="Monthly budgets can be added in Settings." />}</AdminCard>
    <ReportSummary title="Accounts receivable ageing" rows={['current','1-30','31-60','60+'].map((group)=>[group,money(receivables.filter((r)=>r.ageing_group===group).reduce((s,r)=>s+Number(r.outstanding_balance),0))])} />
    <ReportSummary title="Supply and inventory" rows={inventory.map((row)=>[`${row.supply_name}${row.low_stock?' · Low stock':''}`,`${row.quantity_on_hand} ${row.unit} · ${money(row.inventory_value)}`])} />
    <ReportSummary title="Tax summary" rows={[['Taxable sales',money(posted.reduce((s,e)=>s+Number(e.payload?.taxable_sales||0),0))],['Output tax',money(posted.reduce((s,e)=>s+Number(e.payload?.output_tax||0),0))],['Taxable purchases',money(posted.reduce((s,e)=>s+Number(e.payload?.taxable_purchases||0),0))],['Input tax',money(posted.reduce((s,e)=>s+Number(e.payload?.input_tax||0),0))]]} />
    <ReportSummary title="Payment reconciliation" rows={[['Confirmed receipt value',money(receivables.reduce((s,r)=>s+Number(r.paid_amount),0))],['Outstanding invoice value',money(receivables.reduce((s,r)=>s+Number(r.outstanding_balance),0))],['Posting exceptions',String(events.filter((e)=>e.posting_status==='pending_review').length)]]} />
  </View>;
}

function SettingsPanel({ accountingSettings, accounts, templates, taxes, costs, budgets, services, userId, canConfigure, saving, action }: { accountingSettings: Row; accounts: Row[]; templates: Row[]; taxes: Row[]; costs: Row[]; budgets: Row[]; services: Row[]; userId: string; canConfigure: boolean; saving: string; action: Action }) {
  const [taxName,setTaxName]=useState(''); const [taxRate,setTaxRate]=useState('0'); const [taxDate,setTaxDate]=useState(todayBangkok());
  const [serviceId,setServiceId]=useState(services[0]?.id||''); const [cost,setCost]=useState(''); const [basis,setBasis]=useState('per unit');
  const [month,setMonth]=useState(firstMonthDay()); const [category,setCategory]=useState('Revenue'); const [budget,setBudget]=useState(''); const [budgetKind,setBudgetKind]=useState('revenue');
  const [roleUser,setRoleUser]=useState(''); const [staffRole,setStaffRole]=useState<StaffRole>('accountant');
  const [templateName,setTemplateName]=useState(''); const [templateEvent,setTemplateEvent]=useState('adjustment_approved');
  const [templateTrigger,setTemplateTrigger]=useState('manual_adjustment'); const [templateAmount,setTemplateAmount]=useState('adjustment_amount');
  const [templateDebit,setTemplateDebit]=useState(''); const [templateCredit,setTemplateCredit]=useState('');
  const [templateDate,setTemplateDate]=useState(todayBangkok()); const [templatePosting,setTemplatePosting]=useState('automatic');
  if (!canConfigure) return <EmptyState title="Restricted settings" description="Only the accounting owner can change mappings, tax rules, cost rules, budgets, and role assignments." />;
  return <View style={styles.section}><SectionTitle title="Recognition and inventory policy" subtitle="Prospective policy changes require owner approval and are audited" /><AdminCard style={styles.form}><Text style={styles.body}>Revenue recognition: {accountingSettings.revenue_recognition_status || 'delivered'} · Inventory costing: {accountingSettings.inventory_cost_method || 'weighted_average'}</Text><View style={styles.chips}><Button label="Recognize at delivery" variant="secondary" loading={saving==='policy-delivered'} onPress={()=>action('policy-delivered',()=>supabase!.from('accounting_settings').update({revenue_recognition_status:'delivered',updated_by:userId,updated_at:new Date().toISOString()}).eq('id',1),'Recognition policy updated prospectively.')} style={styles.smallButton} /><Button label="Recognize at completion" variant="secondary" loading={saving==='policy-completed'} onPress={()=>action('policy-completed',()=>supabase!.from('accounting_settings').update({revenue_recognition_status:'completed',updated_by:userId,updated_at:new Date().toISOString()}).eq('id',1),'Recognition policy updated prospectively.')} style={styles.smallButton} /><Button label="Weighted average" variant="secondary" loading={saving==='policy-average'} onPress={()=>action('policy-average',()=>supabase!.from('accounting_settings').update({inventory_cost_method:'weighted_average',updated_by:userId,updated_at:new Date().toISOString()}).eq('id',1),'Inventory policy updated.')} style={styles.smallButton} /><Button label="FIFO" variant="secondary" loading={saving==='policy-fifo'} onPress={()=>action('policy-fifo',()=>supabase!.from('accounting_settings').update({inventory_cost_method:'fifo',updated_by:userId,updated_at:new Date().toISOString()}).eq('id',1),'Inventory policy updated.')} style={styles.smallButton} /></View></AdminCard><SectionTitle title="Chart of accounts" subtitle="Codes and historical references are preserved; disable unused accounts instead of deleting them" /><View style={styles.list}>{accounts.map((row)=><AdminCard key={row.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{row.account_code} · {row.account_name}</Text><Text style={styles.muted}>{row.account_type} · {row.report_group} · normal {row.normal_balance}</Text></View><Button label={row.active?'Deactivate':'Activate'} variant="ghost" loading={saving===`account-${row.id}`} onPress={()=>action(`account-${row.id}`,()=>supabase!.from('accounting_accounts').update({active:!row.active,updated_by:userId}).eq('id',row.id),'Account updated.')} style={styles.smallButton} /></View></AdminCard>)}</View>
    <AdminCard style={styles.form}><Text style={styles.title}>Create a prospective two-line template version</Text><View style={styles.formGrid}><Field label="Template name" value={templateName} onChangeText={setTemplateName} style={styles.fieldGrow} /><Field label="Business event" value={templateEvent} onChangeText={setTemplateEvent} style={styles.fieldGrow} /><Field label="Recognition trigger" value={templateTrigger} onChangeText={setTemplateTrigger} style={styles.fieldGrow} /><Field label="Amount source" value={templateAmount} onChangeText={setTemplateAmount} style={styles.fieldGrow} /><Field label="Debit account code" value={templateDebit} onChangeText={setTemplateDebit} style={styles.fieldGrow} /><Field label="Credit account code" value={templateCredit} onChangeText={setTemplateCredit} style={styles.fieldGrow} /><Field label="Effective date" value={templateDate} onChangeText={setTemplateDate} style={styles.fieldGrow} /><Field label="Posting: automatic or manual" value={templatePosting} onChangeText={setTemplatePosting} style={styles.fieldGrow} /></View><Button label="Create approved template version" onPress={()=>action('template-new',()=>supabase!.rpc('create_accounting_template_version',{p_template_name:templateName,p_business_event:templateEvent,p_recognition_trigger:templateTrigger,p_amount_source:templateAmount,p_debit_account_code:templateDebit,p_credit_account_code:templateCredit,p_effective_date:templateDate,p_approval_required:templatePosting==='manual',p_posting_method:templatePosting}),'Template version created.')} loading={saving==='template-new'} style={styles.smallButton} /></AdminCard>
    <SectionTitle title="Journal templates" subtitle="Create a new version for future treatment; posted events retain the selected version" /><View style={styles.list}>{templates.map((row)=><AdminCard key={row.id} style={styles.rowCard}><View style={styles.rowTop}><View><Text style={styles.title}>{row.template_name} · v{row.version_number}</Text><Text style={styles.muted}>{row.business_event} / {row.recognition_trigger} · {row.posting_method} · effective {row.effective_date}</Text></View><Button label={row.active?'Retire':'Activate'} variant="ghost" loading={saving===`template-${row.id}`} onPress={()=>action(`template-${row.id}`,()=>supabase!.from('accounting_journal_templates').update({active:!row.active,approval_status:row.active?'retired':'approved'}).eq('id',row.id),'Template updated.')} style={styles.smallButton} /></View>{(row.accounting_journal_template_lines||[]).sort((a:Row,b:Row)=>a.line_number-b.line_number).map((line:Row)=><Text key={line.id} style={styles.line}>{line.side} · {line.accounting_accounts?.account_code} {line.accounting_accounts?.account_name} · {line.amount_source}</Text>)}</AdminCard>)}</View>
    <SectionTitle title="Tax settings" subtitle="No tax rate is assumed; a draft must be reviewed before activation" /><AdminCard style={styles.form}><View style={styles.formGrid}><Field label="Tax name" value={taxName} onChangeText={setTaxName} style={styles.fieldGrow} /><Field label="Rate (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" style={styles.fieldGrow} /><Field label="Effective date" value={taxDate} onChangeText={setTaxDate} style={styles.fieldGrow} /></View><Button label="Create draft tax version" onPress={()=>action('tax-new',()=>supabase!.from('accounting_tax_rules').insert({tax_name:taxName.trim(),tax_type:'sales_and_purchase',rate:(Number(taxRate)||0)/100,effective_date:taxDate,price_mode:'exclusive',version_number:(taxes.filter((r)=>r.tax_name===taxName).length+1),created_by:userId,change_reason:'Created in admin settings'}),'Tax draft created.')} loading={saving==='tax-new'} style={styles.smallButton} /></AdminCard>{taxes.map((row)=><AdminCard key={row.id} style={styles.rowCard}><Text style={styles.title}>{row.tax_name} · {(Number(row.rate)*100).toFixed(3)}% · v{row.version_number}</Text><Text style={styles.muted}>{row.approval_status} · effective {row.effective_date} · {row.price_mode}</Text>{row.approval_status==='draft'?<Button label="Approve tax version" variant="secondary" onPress={()=>action(`tax-${row.id}`,()=>supabase!.from('accounting_tax_rules').update({approval_status:'approved',approved_by:userId}).eq('id',row.id),'Tax version approved.')} style={styles.smallButton} />:null}</AdminCard>)}
    <SectionTitle title="Service cost versions" subtitle="Rules apply prospectively and freeze on each recognized order" /><AdminCard style={styles.form}><View style={styles.chips}>{services.map((service)=><Pressable key={service.id} onPress={()=>setServiceId(service.id)} style={[styles.chip,serviceId===service.id&&styles.chipActive]}><Text style={[styles.chipText,serviceId===service.id&&styles.chipTextActive]}>{service.name}</Text></Pressable>)}</View><View style={styles.formGrid}><Field label="Cost basis" value={basis} onChangeText={setBasis} style={styles.fieldGrow} /><Field label="Cost per unit" value={cost} onChangeText={setCost} keyboardType="decimal-pad" style={styles.fieldGrow} /></View><Button label="Add cost version" onPress={()=>action('cost-new',()=>supabase!.from('accounting_service_cost_rules').insert({service_id:serviceId,cost_basis:basis,cost_per_unit:Number(cost),effective_date:todayBangkok(),explanation:'Created in admin settings',approved_by:userId,created_by:userId,version_number:costs.filter((r)=>r.service_id===serviceId).length+1}),'Service cost version added.')} loading={saving==='cost-new'} style={styles.smallButton} /></AdminCard>
    <SectionTitle title="Monthly budgets" subtitle="Revenue and expense variances use different favourability formulas" /><AdminCard style={styles.form}><View style={styles.formGrid}><Field label="Month (first day)" value={month} onChangeText={setMonth} style={styles.fieldGrow} /><Field label="Category" value={category} onChangeText={setCategory} style={styles.fieldGrow} /><Field label="Kind: revenue or expense" value={budgetKind} onChangeText={setBudgetKind} style={styles.fieldGrow} /><Field label="Amount" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" style={styles.fieldGrow} /></View><Button label="Save budget" onPress={()=>action('budget-new',()=>supabase!.from('accounting_budgets').upsert({budget_month:month,category:category.trim(),budget_kind:budgetKind,amount:Number(budget),created_by:userId},{onConflict:'budget_month,category'}),'Budget saved.')} loading={saving==='budget-new'} style={styles.smallButton} /></AdminCard>
    <SectionTitle title="Accounting roles" subtitle="Use an existing authenticated profile UUID; this never creates an auth account" /><AdminCard style={styles.form}><Field label="Existing profile user ID" value={roleUser} onChangeText={setRoleUser} autoCapitalize="none" /><View style={styles.chips}>{(['owner','admin','accountant','cashier'] as StaffRole[]).map((value)=><Pressable key={value} onPress={()=>setStaffRole(value)} style={[styles.chip,staffRole===value&&styles.chipActive]}><Text style={[styles.chipText,staffRole===value&&styles.chipTextActive]}>{value}</Text></Pressable>)}</View><Button label="Assign accounting role" onPress={()=>action('role-new',()=>supabase!.from('accounting_staff_roles').upsert({user_id:roleUser.trim(),staff_role:staffRole,active:true,created_by:userId,updated_by:userId}),'Role assigned.')} loading={saving==='role-new'} style={styles.smallButton} /></AdminCard>
  </View>;
}

function ReportSummary({ title, rows }: { title: string; rows: (string|number)[][] }) { return <><SectionTitle title={title} /><AdminCard style={styles.report}>{rows.length ? rows.map((row,index)=><TableRow key={`${row[0]}-${index}`} cells={row.map(String)} />) : <EmptyState title="No report data" description="No posted records match the selected period." />}</AdminCard></>; }
function TableHeader({ cells }: { cells: string[] }) { return <View style={[styles.tableRow,styles.tableHeader]}>{cells.map((cell,index)=><Text key={index} style={[styles.tableCell,styles.tableHeaderText]}>{cell}</Text>)}</View>; }
function TableRow({ cells, strong=false }: { cells: string[]; strong?: boolean }) { return <View style={styles.tableRow}>{cells.map((cell,index)=><Text key={index} style={[styles.tableCell,strong&&styles.strong,index===0&&styles.firstCell]}>{cell}</Text>)}</View>; }
function Metric({ label, value, attention }: { label: string; value: string; attention?: boolean }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue,attention&&styles.attention]}>{value}</Text></View>; }
function Field({ label, style, ...props }: { label: string; style?: ComponentProps<typeof View>['style'] } & Omit<ComponentProps<typeof TextInput>,'style'>) { return <View style={style}><Text style={styles.label}>{label}</Text><TextInput {...props} placeholderTextColor={Colors.textMuted} style={[styles.input,props.multiline&&styles.area]} /></View>; }

const styles=StyleSheet.create({
  headerButton:{minHeight:40,paddingHorizontal:14},feedback:{alignSelf:'flex-end',backgroundColor:Colors.successLight,borderRadius:12,paddingHorizontal:12,paddingVertical:8,marginBottom:10},feedbackText:{color:Colors.success,fontFamily:FontFamilyMedium,fontSize:10,fontWeight:'500'},tabs:{padding:7,marginBottom:10},range:{padding:14,flexDirection:'row',flexWrap:'wrap',alignItems:'flex-end',gap:10,marginBottom:16},dateField:{flexBasis:180,flexGrow:1},section:{gap:12},kpis:{flexDirection:'row',flexWrap:'wrap',gap:11},split:{flexDirection:'row',gap:14},stack:{flexDirection:'column'},panel:{flex:1,padding:17,minWidth:260},
  body:{color:Colors.text,fontFamily:FontFamily,fontSize:11.5,lineHeight:18},muted:{color:Colors.textMuted,fontFamily:FontFamily,fontSize:9.5,lineHeight:15,marginTop:3},safeError:{color:Colors.textMuted,fontFamily:FontFamily,fontSize:10.5,lineHeight:17},title:{color:Colors.navy,fontFamily:FontFamilyMedium,fontSize:13,fontWeight:'500'},list:{gap:10},rowCard:{padding:15,gap:8},rowTop:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:10},lines:{gap:4,paddingTop:5,borderTopWidth:1,borderTopColor:Colors.line},line:{color:Colors.textMuted,fontFamily:FontFamily,fontSize:8.5,lineHeight:14},smallButton:{minHeight:36,alignSelf:'flex-start',paddingHorizontal:11},
  form:{padding:16,gap:12},formGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},fieldGrow:{flexGrow:1,flexBasis:180},label:{color:Colors.text,fontFamily:FontFamilyMedium,fontSize:8.5,fontWeight:'500',textTransform:'uppercase',letterSpacing:.5,marginBottom:6},input:{minHeight:43,borderWidth:1,borderColor:Colors.line,borderRadius:12,backgroundColor:Colors.canvas,color:Colors.text,fontFamily:FontFamily,fontSize:10.5,paddingHorizontal:11},area:{minHeight:78,paddingTop:10,textAlignVertical:'top'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6},chip:{minHeight:36,borderWidth:0,backgroundColor:'#EEF3F2',borderRadius:12,justifyContent:'center',paddingHorizontal:11},chipActive:{backgroundColor:Colors.navy},chipText:{color:Colors.textMuted,fontFamily:FontFamilyMedium,fontSize:9,fontWeight:'500',textTransform:'capitalize'},chipTextActive:{color:Colors.surface},
  cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},stockCard:{width:250,padding:15,gap:6},selected:{borderColor:Colors.teal,borderWidth:2},stock:{color:Colors.navy,fontFamily:FontFamilyMedium,fontSize:20,fontWeight:'500'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:16},metric:{minWidth:110},metricLabel:{color:Colors.textMuted,fontFamily:FontFamily,fontSize:8.5},metricValue:{color:Colors.navy,fontFamily:FontFamilyMedium,fontSize:15,fontWeight:'500',marginTop:3},attention:{color:'#B56A00'},report:{padding:14},tableRow:{minHeight:40,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:Colors.line,gap:8},tableHeader:{backgroundColor:'#F0F5F4',borderRadius:Radius.small},tableCell:{flex:1,color:Colors.textMuted,fontFamily:FontFamily,fontSize:8.5,textAlign:'right'},firstCell:{flex:2,textAlign:'left',color:Colors.text},tableHeaderText:{color:Colors.navy,fontFamily:FontFamilyMedium,fontWeight:'500'},strong:{fontFamily:FontFamilyMedium,fontWeight:'500',color:Colors.navy},
});
