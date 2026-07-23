import { useState, useEffect, useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Search,
  Calendar,
  TrendingUp,
  Wallet,
  AlertCircle,
  FileText,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { IconBadge } from './IconBadge';
import { COLORS, khmerFont, latinFont, INLINE, ACTION } from '../lib/theme';



type RangeKey = 'today' | 'month' | 'year' | 'custom';

interface InvoiceRow {
  id: string;
  invoice_number: number;
  customer_name: string;
  customer_phone: string | null;
  invoice_date: string;
  subtotal: number;
  paid_amount: number;
  balance: number;
  currency: string;
  status: string;
}

interface Props {
  lang: 'KH' | 'EN';
  onBack: () => void;
  onEditInvoice: (invoiceId: string) => void;
  onPreviewInvoice: (invoiceId: string) => void;
  onCreateInvoice: () => void;
}

function getRangeDates(range: RangeKey, customStart: string, customEnd: string) {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (range === 'today') {
    const s = toStr(today);
    return { start: s, end: s };
  }
  if (range === 'month') {
    return {
      start: toStr(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: toStr(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (range === 'year') {
    return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` };
  }
  return { start: customStart, end: customEnd };
}

function fmtMoney(n: number, currency: string) {
  if (currency === 'USD')
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${n.toLocaleString()} ៛`;
}

function statusBadge(status: string, lang: 'KH' | 'EN') {
  if (status === 'paid')
    return { label: lang === 'KH' ? 'បានបង់' : 'Paid', bg: COLORS.successTint, color: COLORS.success };
  if (status === 'partial')
    return { label: lang === 'KH' ? 'បង់ខ្លះ' : 'Partial', bg: COLORS.accountTint, color: COLORS.account };
  return { label: lang === 'KH' ? 'មិនទាន់បង់' : 'Unpaid', bg: COLORS.dangerTint, color: COLORS.danger };
}

export default function InvoiceOverview({
  lang,
  onBack,
  onEditInvoice,
  onPreviewInvoice,
  onCreateInvoice,
}: Props) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangeKey>('month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [showRanges, setShowRanges] = useState(false);

  const [settleModal, setSettleModal] = useState<InvoiceRow | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleError, setSettleError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<InvoiceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, customer_name, customer_phone, invoice_date, subtotal, paid_amount, balance, currency, status'
      )
      .order('invoice_number', { ascending: false });
    if (error) {
      console.error('Failed to fetch invoices:', error);
      setInvoices([]);
    } else {
      setInvoices((data as InvoiceRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const { start: rangeStart, end: rangeEnd } = getRangeDates(range, customStart, customEnd);

  const filteredInvoices = useMemo(() => {
    let result = invoices.filter((inv) => inv.invoice_date >= rangeStart && inv.invoice_date <= rangeEnd);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (inv) =>
          inv.customer_name.toLowerCase().includes(q) ||
          (inv.customer_phone && inv.customer_phone.includes(q))
      );
    }
    return result;
  }, [invoices, rangeStart, rangeEnd, search]);

  const summary = useMemo(() => {
    let gross = 0;
    let settled = 0;
    let receivables = 0;
    let count = 0;
    for (const inv of filteredInvoices) {
      gross += inv.subtotal;
      settled += inv.paid_amount;
      if (inv.status !== 'paid') {
        receivables += inv.balance;
      }
      count++;
    }
    return { gross, settled, receivables, count };
  }, [filteredInvoices]);

  // Group so fully-paid invoices move into their own section, away from
  // invoices still outstanding — makes it easy to see what still needs
  // follow-up at a glance.
  const { outstandingInvoices, paidInvoices } = useMemo(() => {
    const outstanding: InvoiceRow[] = [];
    const paidGroup: InvoiceRow[] = [];
    for (const inv of filteredInvoices) {
      if (inv.status === 'paid') paidGroup.push(inv);
      else outstanding.push(inv);
    }
    return { outstandingInvoices: outstanding, paidInvoices: paidGroup };
  }, [filteredInvoices]);

  const handleSettle = async () => {
    if (!settleModal) return;
    setSettleError('');
    const amount = parseFloat(settleAmount) || 0;
    if (amount <= 0) {
      setSettleError(tr('សូមបញ្ចូលចំនួនប្រាក់', 'Please enter an amount'));
      return;
    }
    if (settleModal.paid_amount + amount > settleModal.subtotal) {
      setSettleError(tr('ចំនួនបានបង់លើសសរុប', 'Paid amount exceeds total'));
      return;
    }
    setSettleBusy(true);
    // Insert into the payment ledger — invoices.paid_amount and status are
    // then recalculated automatically by the database trigger, the same way
    // the Payment ledger inside the invoice screen works. This keeps both
    // places consistent with a single source of truth.
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: settleModal.id,
      amount,
      payment_date: new Date().toISOString().slice(0, 10),
    });
    setSettleBusy(false);
    if (error) {
      setSettleError(error.message);
      return;
    }
    setSettleModal(null);
    setSettleAmount('');
    fetchInvoices();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const { error } = await supabase.from('invoices').delete().eq('id', deleteTarget.id);
    setDeleteBusy(false);
    if (error) {
      console.error('Delete failed:', error);
      return;
    }
    setDeleteTarget(null);
    fetchInvoices();
  };

  const inputStyle: CSSProperties = {
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    color: COLORS.navy,
    ...latinFont,
  };

  const rangeButtons: { key: RangeKey; label: string }[] = [
    { key: 'today', label: tr('ថ្ងៃនេះ', 'Today') },
    { key: 'month', label: tr('ខែនេះ', 'This Month') },
    { key: 'year', label: tr('ឆ្នាំនេះ', 'This Year') },
    { key: 'custom', label: tr('ផ្ទាល់ខ្លួន', 'Custom') },
  ];

  const summaryCards = [
    {
      label: tr('សរុបចំណូល', 'Gross Revenue'),
      value: fmtMoney(summary.gross, 'USD'),
      icon: TrendingUp,
      tint: 'invoice' as const,
      valueColor: COLORS.invoice,
    },
    {
      label: tr('បានទូទាត់', 'Settled Sum'),
      value: fmtMoney(summary.settled, 'USD'),
      icon: Wallet,
      tint: 'success' as const,
      valueColor: COLORS.success,
    },
    {
      label: tr('ជំពាក់នៅសល់', 'Receivables'),
      value: fmtMoney(summary.receivables, 'USD'),
      icon: AlertCircle,
      tint: 'danger' as const,
      valueColor: COLORS.danger,
    },
    {
      label: tr('ចំនួនវិក្កយបត្រ', 'Invoice Count'),
      value: String(summary.count),
      icon: FileText,
      tint: 'account' as const,
      valueColor: COLORS.account,
    },
  ];

  const renderInvoiceCard = (inv: InvoiceRow) => {
    const badge = statusBadge(inv.status, lang);
    const isPaid = inv.status === 'paid';
    return (
      <div
        key={inv.id}
        className="bg-white rounded-xl overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}
      >
        {/* Clickable row → preview */}
        <button onClick={() => onPreviewInvoice(inv.id)} className="w-full text-left p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: COLORS.invoiceTint, color: COLORS.invoice, ...latinFont }}
              >
                #{String(inv.invoice_number).padStart(6, '0')}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: badge.bg, color: badge.color }}>
                {badge.label}
              </span>
            </div>
            <span className="text-xs" style={{ color: COLORS.muted, ...latinFont }}>
              {inv.invoice_date}
            </span>
          </div>
          <p className="text-sm font-bold mb-0.5" style={{ color: COLORS.navy }}>
            {inv.customer_name}
          </p>
          {inv.customer_phone && (
            <p className="text-xs" style={{ color: COLORS.muted, ...latinFont }}>
              {inv.customer_phone}
            </p>
          )}
          {/* Amounts row */}
          <div className="flex gap-3 mt-2 text-xs" style={{ ...latinFont }}>
            <div>
              <span style={{ color: COLORS.muted }}>{tr('សរុប', 'Total')}: </span>
              <span className="font-bold" style={{ color: COLORS.navy }}>
                {fmtMoney(inv.subtotal, inv.currency)}
              </span>
            </div>
            <div>
              <span style={{ color: COLORS.muted }}>{tr('បានបង់', 'Paid')}: </span>
              <span className="font-bold" style={{ color: COLORS.success }}>
                {fmtMoney(inv.paid_amount, inv.currency)}
              </span>
            </div>
            <div>
              <span style={{ color: COLORS.muted }}>{tr('ជំពាក់', 'Owed')}: </span>
              <span className="font-bold" style={{ color: isPaid ? COLORS.success : COLORS.danger }}>
                {fmtMoney(inv.balance, inv.currency)}
              </span>
            </div>
          </div>
        </button>

        {/* Action buttons */}
        <div className="flex border-t" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}>
          {!isPaid && (
            <>
              <button
                onClick={() => {
                  setSettleModal(inv);
                  setSettleAmount('');
                  setSettleError('');
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
                style={{ color: COLORS.success }}
              >
                <Wallet size={16} color={COLORS.success} strokeWidth={2} />
                {tr('ទូទាត់', 'SETTLE')}
              </button>
              <div style={{ width: 1, backgroundColor: COLORS.border }} />
            </>
          )}
          <button
            onClick={() => onEditInvoice(inv.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
            style={{ color: COLORS.invoice }}
          >
            <Pencil size={16} color={COLORS.invoice} strokeWidth={2} />
            {tr('កែ', 'Edit')}
          </button>
          <div style={{ width: 1, backgroundColor: COLORS.border }} />
          <button
            onClick={() => setDeleteTarget(inv)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
            style={{ color: COLORS.danger }}
          >
            <Trash2 size={16} color={COLORS.danger} strokeWidth={2} />
            {tr('លុប', 'Delete')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.bgApp, ...khmerFont }}>
      {/* Header */}
      <div
        className="px-4 pt-5 pb-4 flex items-center gap-3"
        style={{
          background: `linear-gradient(135deg, ${COLORS.navyGradientStart}, ${COLORS.navyGradientEnd})`,
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' }}
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{tr('ទិដ្ឋភាពវិក្កយបត្រ', 'Invoice Overview')}</p>
          <p className="text-white/70 text-xs">{tr('រាល់វិក្កយបត្រទាំងអស់', 'All your invoices')}</p>
        </div>
        <button
          onClick={onCreateInvoice}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold text-sm"
          style={{ backgroundColor: '#FFFFFF', color: COLORS.invoice }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          {tr('បង្កើតថ្មី', 'New')}
        </button>
      </div>

      {/* Search + Ranges */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg border px-3 py-2.5" style={inputStyle}>
            <Search size={INLINE} color={COLORS.muted} strokeWidth={2} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('ស្វែងរកតាមឈ្មោះ ឬ ទូរស័ព្ទ', 'Search by name or phone')}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: COLORS.navy, ...khmerFont }}
            />
          </div>
          <button
            onClick={() => setShowRanges(true)}
            className="flex items-center justify-center rounded-lg border px-3"
            style={{ borderColor: COLORS.border, backgroundColor: '#FFFFFF' }}
          >
            <Calendar size={INLINE} color={COLORS.invoice} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Summary cards 2x2 */}
      <div className="px-4 pt-2">
        <div className="grid grid-cols-2 gap-2.5">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-xl p-3"
              style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <IconBadge icon={card.icon} size={INLINE} tint={card.tint} shape="rounded" />
                <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>
                  {card.label}
                </span>
              </div>
              <p className="text-lg font-extrabold" style={{ color: card.valueColor, ...latinFont }}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {loading ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: COLORS.muted }}>
              {tr('កំពុងផ្ទុក...', 'Loading...')}
            </p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: COLORS.muted }}>
              {tr('មិនមានវិក្កយបត្រក្នុងចន្លោះនេះទេ', 'No invoices in this range')}
            </p>
          </div>
        ) : (
          <>
            {/* Outstanding (unpaid / partial) */}
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
                {tr('កំពុងជំពាក់', 'Outstanding')}
              </p>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: COLORS.dangerTint, color: COLORS.danger, ...latinFont }}
              >
                {outstandingInvoices.length}
              </span>
            </div>
            {outstandingInvoices.length === 0 ? (
              <p className="text-xs pb-4" style={{ color: COLORS.muted }}>
                {tr('គ្មានវិក្កយបត្រជំពាក់ទេ', 'Nothing outstanding')}
              </p>
            ) : (
              <div className="space-y-2.5 pb-5">{outstandingInvoices.map((inv) => renderInvoiceCard(inv))}</div>
            )}

            {/* Fully paid */}
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
                {tr('បានទូទាត់ពេញ', 'Fully Paid')}
              </p>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: COLORS.successTint, color: COLORS.success, ...latinFont }}
              >
                {paidInvoices.length}
              </span>
            </div>
            {paidInvoices.length === 0 ? (
              <p className="text-xs" style={{ color: COLORS.muted }}>
                {tr('មិនទាន់មានវិក្កយបត្របានទូទាត់ពេញនៅឡើយទេ', 'No fully paid invoices yet')}
              </p>
            ) : (
              <div className="space-y-2.5">{paidInvoices.map((inv) => renderInvoiceCard(inv))}</div>
            )}
          </>
        )}
      </div>

      {/* Date Range Modal */}
      {showRanges && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ backgroundColor: 'rgba(18,48,58,0.5)' }}
          onClick={() => setShowRanges(false)}
        >
          <div
            className="bg-white rounded-t-2xl p-5 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm font-bold" style={{ color: COLORS.navy }}>
                {tr('ជ្រើសរើសចន្លោះថ្ងៃ', 'Select Date Range')}
              </p>
              <button onClick={() => setShowRanges(false)}>
                <X size={20} color={COLORS.muted} strokeWidth={2} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {rangeButtons.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className="py-2.5 rounded-lg border text-sm font-bold"
                  style={{
                    borderColor: COLORS.border,
                    backgroundColor: range === r.key ? COLORS.invoice : '#FFFFFF',
                    color: range === r.key ? '#FFFFFF' : COLORS.navy,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            )}
            <button
              onClick={() => setShowRanges(false)}
              className="w-full py-3 rounded-lg font-bold text-white text-sm"
              style={{ backgroundColor: COLORS.invoice }}
            >
              {tr('អនុវត្ត', 'Apply')}
            </button>
          </div>
        </div>
      )}

      {/* Settle Modal */}
      {settleModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ backgroundColor: 'rgba(18,48,58,0.5)' }}
          onClick={() => setSettleModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm font-bold" style={{ color: COLORS.navy }}>
                {tr('ទូទាត់ប្រាក់', 'Record Payment')}
              </p>
              <button onClick={() => setSettleModal(null)}>
                <X size={20} color={COLORS.muted} strokeWidth={2} />
              </button>
            </div>

            <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: COLORS.bgApp }}>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: COLORS.muted }}>{tr('វិក្កយបត្រ', 'Invoice')}</span>
                <span className="font-bold" style={{ color: COLORS.invoice, ...latinFont }}>
                  #{String(settleModal.invoice_number).padStart(6, '0')}
                </span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: COLORS.muted }}>{tr('សរុប', 'Total')}</span>
                <span className="font-bold" style={{ color: COLORS.navy, ...latinFont }}>
                  {fmtMoney(settleModal.subtotal, settleModal.currency)}
                </span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: COLORS.muted }}>{tr('បានបង់រួច', 'Already Paid')}</span>
                <span className="font-bold" style={{ color: COLORS.success, ...latinFont }}>
                  {fmtMoney(settleModal.paid_amount, settleModal.currency)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: COLORS.muted }}>{tr('នៅសល់', 'Remaining')}</span>
                <span className="font-bold" style={{ color: COLORS.danger, ...latinFont }}>
                  {fmtMoney(settleModal.balance, settleModal.currency)}
                </span>
              </div>
            </div>

            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
              {tr('ចំនួនបង់ថ្មី', 'Payment Amount')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-2"
              style={inputStyle}
            />

            {settleError && (
              <p className="text-xs mb-2" style={{ color: COLORS.danger }}>
                {settleError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSettleAmount(String(settleModal.balance));
                }}
                className="flex-1 py-2.5 rounded-lg border text-xs font-bold"
                style={{ borderColor: COLORS.border, color: COLORS.navy }}
              >
                {tr('បង់ទាំងអស់', 'Pay Full')}
              </button>
              <button
                onClick={handleSettle}
                disabled={settleBusy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-white text-xs disabled:opacity-60"
                style={{ backgroundColor: COLORS.success }}
              >
                <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2} />
                {settleBusy ? tr('កំពុងរក្សា...', 'Saving...') : tr('បញ្ជាក់', 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ backgroundColor: 'rgba(18,48,58,0.5)' }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-sm text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <IconBadge icon={Trash2} size={ACTION} tint="danger" shape="rounded" />
            <p className="text-sm font-bold mt-3 mb-1" style={{ color: COLORS.navy }}>
              {tr('លុបវិក្កយបត្រ?', 'Delete Invoice?')}
            </p>
            <p className="text-xs mb-4" style={{ color: COLORS.muted }}>
              {tr(
                `#${String(deleteTarget.invoice_number).padStart(6, '0')} - ${deleteTarget.customer_name}`,
                `#${String(deleteTarget.invoice_number).padStart(6, '0')} - ${deleteTarget.customer_name}`
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3 rounded-lg border text-sm font-bold"
                style={{ borderColor: COLORS.border, color: COLORS.navy }}
              >
                {tr('បោះបង់', 'Cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteBusy}
                className="flex-1 py-3 rounded-lg font-bold text-white text-sm disabled:opacity-60"
                style={{ backgroundColor: COLORS.danger }}
              >
                {deleteBusy ? tr('កំពុងលុប...', 'Deleting...') : tr('លុប', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
