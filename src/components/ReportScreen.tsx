import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  CalendarDays,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { IconBadge } from './IconBadge';
import { COLORS, khmerFont, latinFont, INLINE } from '../lib/theme';

interface Profile {
  id: string;
  business_name: string | null;
  username: string | null;
  phone: string | null;
  is_locked: boolean | null;
  trial_started_at: string | null;
  qr_code_url: string | null;
}

interface Props {
  lang: 'KH' | 'EN';
  profile: Profile;
  onBack: () => void;
}

type PeriodType = 'month' | 'year';

interface ReportData {
  incomeUSD: number;
  incomeKHR: number;
  expenseUSD: number;
  expenseKHR: number;
  invoiceCount: number;
  invoiceSubtotalUSD: number;
  invoiceSubtotalKHR: number;
  invoicePaidUSD: number;
  invoicePaidKHR: number;
  invoiceBalanceUSD: number;
  invoiceBalanceKHR: number;
  unpaidInvoiceCount: number;
  stockInQty: number;
  stockOutQty: number;
  stockMovementCount: number;
  lowStockProducts: { name: string; quantity: number; unit: string; low_stock_threshold: number }[];
}

const EMPTY_REPORT: ReportData = {
  incomeUSD: 0,
  incomeKHR: 0,
  expenseUSD: 0,
  expenseKHR: 0,
  invoiceCount: 0,
  invoiceSubtotalUSD: 0,
  invoiceSubtotalKHR: 0,
  invoicePaidUSD: 0,
  invoicePaidKHR: 0,
  invoiceBalanceUSD: 0,
  invoiceBalanceKHR: 0,
  unpaidInvoiceCount: 0,
  stockInQty: 0,
  stockOutQty: 0,
  stockMovementCount: 0,
  lowStockProducts: [],
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatMoney(usd: number, khr: number) {
  const parts: string[] = [];
  if (usd) parts.push(`$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  if (khr) parts.push(`${khr.toLocaleString()} ៛`);
  return parts.length ? parts.join(' + ') : '$0.00';
}

export default function ReportScreen({ lang, profile, onBack }: Props) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);
  const today = new Date();

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [selectedMonth, setSelectedMonth] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  const [selectedYear, setSelectedYear] = useState(`${today.getFullYear()}`);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData>(EMPTY_REPORT);
  const [printing, setPrinting] = useState(false);

  const { start, end, label } = useMemo(() => {
    if (periodType === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      const s = `${y}-${pad(m)}-01`;
      const e = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
      const lbl = new Date(y, m - 1, 1).toLocaleDateString(lang === 'KH' ? 'km-KH' : 'en-US', {
        month: 'long',
        year: 'numeric',
      });
      return { start: s, end: e, label: lbl };
    }
    const y = Number(selectedYear);
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}` };
  }, [periodType, selectedMonth, selectedYear, lang]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const [txRes, invRes, movRes, prodRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('type, currency, amount, transaction_date')
          .gte('transaction_date', start)
          .lte('transaction_date', end),
        supabase
          .from('invoices')
          .select('id, subtotal, paid_amount, balance, currency, status, invoice_date')
          .gte('invoice_date', start)
          .lte('invoice_date', end),
        supabase
          .from('stock_movements')
          .select('type, quantity, movement_date')
          .gte('movement_date', start)
          .lte('movement_date', end),
        supabase
          .from('products')
          .select('name, quantity, unit, low_stock_threshold')
          .eq('is_active', true),
      ]);

      if (cancelled) return;

      const tx = (txRes.data as { type: string; currency: string; amount: number }[]) || [];
      const inv =
        (invRes.data as {
          subtotal: number;
          paid_amount: number;
          balance: number;
          currency: string;
          status: string;
        }[]) || [];
      const mov = (movRes.data as { type: string; quantity: number }[]) || [];
      const prod =
        (prodRes.data as { name: string; quantity: number; unit: string; low_stock_threshold: number }[]) || [];

      const sum = (list: typeof tx, type: string, currency: string) =>
        list
          .filter((t) => t.type === type && t.currency === currency)
          .reduce((acc, t) => acc + Number(t.amount), 0);

      const sumInv = (currency: string, field: 'subtotal' | 'paid_amount' | 'balance') =>
        inv.filter((i) => i.currency === currency).reduce((acc, i) => acc + Number(i[field]), 0);

      const low = prod.filter((p) => Number(p.quantity) <= Number(p.low_stock_threshold));

      setData({
        incomeUSD: sum(tx, 'income', 'USD'),
        incomeKHR: sum(tx, 'income', 'KHR'),
        expenseUSD: sum(tx, 'expense', 'USD'),
        expenseKHR: sum(tx, 'expense', 'KHR'),
        invoiceCount: inv.length,
        invoiceSubtotalUSD: sumInv('USD', 'subtotal'),
        invoiceSubtotalKHR: sumInv('KHR', 'subtotal'),
        invoicePaidUSD: sumInv('USD', 'paid_amount'),
        invoicePaidKHR: sumInv('KHR', 'paid_amount'),
        invoiceBalanceUSD: sumInv('USD', 'balance'),
        invoiceBalanceKHR: sumInv('KHR', 'balance'),
        unpaidInvoiceCount: inv.filter((i) => i.status !== 'paid').length,
        stockInQty: mov.filter((m) => m.type === 'in').reduce((a, m) => a + Number(m.quantity), 0),
        stockOutQty: mov.filter((m) => m.type === 'out').reduce((a, m) => a + Number(m.quantity), 0),
        stockMovementCount: mov.length,
        lowStockProducts: low,
      });
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const handleSavePdf = () => {
    setPrinting(true);
    // Let the print-only styles apply, then open the browser's Save-as-PDF dialog.
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 80);
  };

  const netUSD = data.incomeUSD - data.expenseUSD;
  const netKHR = data.incomeKHR - data.expenseKHR;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.bgApp }} id="report-root">
      {/* Header — hidden when printing */}
      <div
        className="px-4 pt-5 pb-6 flex items-center gap-3 print:hidden"
        style={{ background: `linear-gradient(135deg, ${COLORS.navyGradientStart}, ${COLORS.navyGradientEnd})` }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' }}
        >
          <ArrowLeft size={INLINE} color="#FFFFFF" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{tr('របាយការណ៍', 'Report')}</p>
          <p className="text-white/70 text-xs">
            {tr('សង្ខេបទិន្នន័យគ្រប់ផ្នែកតាមខែ/ឆ្នាំ', 'All-section summary by month/year')}
          </p>
        </div>
        <button
          onClick={handleSavePdf}
          disabled={loading || printing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
          style={{ backgroundColor: COLORS.gold }}
        >
          <Download size={16} color="#FFFFFF" strokeWidth={2.2} />
          <span className="text-white text-xs font-bold">{tr('រក្សាទុក PDF', 'Save PDF')}</span>
        </button>
      </div>

      {/* Period controls — hidden when printing */}
      <div className="px-3.5 pt-3.5 print:hidden">
        <div className="flex gap-2">
          {(['month', 'year'] as PeriodType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodType(p)}
              className="flex-1 py-2 rounded-lg border text-xs font-bold"
              style={{
                borderColor: COLORS.border,
                backgroundColor: periodType === p ? COLORS.navy : '#FFFFFF',
                color: periodType === p ? '#FFFFFF' : COLORS.navy,
              }}
            >
              {p === 'month' ? tr('ប្រចាំខែ', 'Monthly') : tr('ប្រចាំឆ្នាំ', 'Yearly')}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {periodType === 'month' ? (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.border, backgroundColor: '#FFFFFF', color: COLORS.navy }}
            />
          ) : (
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.border, backgroundColor: '#FFFFFF', color: COLORS.navy, ...latinFont }}
            />
          )}
        </div>
      </div>

      {/* Printable report body */}
      <div className="flex-1 overflow-y-auto p-3.5 pb-24" id="report-print-area">
        <div className="hidden print:block mb-4">
          <p className="text-lg font-bold" style={{ color: COLORS.navy, ...khmerFont }}>
            {profile.business_name || tr('អាជីវកម្ម', 'Business')}
          </p>
          <p className="text-xs" style={{ color: COLORS.muted }}>{profile.phone}</p>
        </div>

        <div
          className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-white"
          style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}
        >
          <IconBadge icon={CalendarDays} size={INLINE} tint="navy" shape="rounded" />
          <div>
            <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
              {tr('រយៈពេលរបាយការណ៍', 'Report period')}
            </p>
            <p className="text-sm font-bold" style={{ color: COLORS.gold, ...latinFont }}>{label}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-center py-8" style={{ color: COLORS.muted }}>
            {tr('កំពុងផ្ទុកទិន្នន័យ...', 'Loading data...')}
          </p>
        ) : (
          <>
            {/* Finance section */}
            <p className="text-sm font-bold mb-2" style={{ color: COLORS.navy }}>
              {tr('ចំណូល / ចំណាយ', 'Income / Expense')}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-3 rounded-xl bg-white" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
                <IconBadge icon={TrendingUp} size={INLINE} tint="success" shape="rounded" />
                <p className="text-[10px] font-semibold mt-1.5" style={{ color: COLORS.muted }}>
                  {tr('ចំណូល', 'Income')}
                </p>
                <p className="text-xs font-bold mt-0.5" style={{ color: COLORS.success, ...latinFont }}>
                  {formatMoney(data.incomeUSD, data.incomeKHR)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
                <IconBadge icon={TrendingDown} size={INLINE} tint="danger" shape="rounded" />
                <p className="text-[10px] font-semibold mt-1.5" style={{ color: COLORS.muted }}>
                  {tr('ចំណាយ', 'Expense')}
                </p>
                <p className="text-xs font-bold mt-0.5" style={{ color: COLORS.danger, ...latinFont }}>
                  {formatMoney(data.expenseUSD, data.expenseKHR)}
                </p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: COLORS.gold }}>
                <IconBadge icon={Wallet} size={INLINE} tint="white" shape="rounded" />
                <p className="text-[10px] font-semibold text-white/90 mt-1.5">{tr('នៅសល់', 'Balance')}</p>
                <p className="text-xs font-bold mt-0.5 text-white" style={latinFont}>
                  {formatMoney(netUSD, netKHR)}
                </p>
              </div>
            </div>

            {/* Invoice section */}
            <p className="text-sm font-bold mb-2" style={{ color: COLORS.navy }}>
              {tr('វិក្កយបត្រ', 'Invoices')}
            </p>
            <div className="bg-white rounded-2xl p-3.5 mb-4" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <IconBadge icon={Receipt} size={INLINE} tint="invoice" shape="rounded" />
                <div>
                  <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
                    {tr(`ចំនួនវិក្កយបត្រ`, 'Invoice count')}: {data.invoiceCount}
                  </p>
                  <p className="text-[10px]" style={{ color: COLORS.muted }}>
                    {tr('មិនទាន់ទូទាត់', 'Unpaid')}: {data.unpaidInvoiceCount}
                  </p>
                </div>
              </div>
              <div className="flex justify-between text-[11px] py-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.muted }}>{tr('សរុប', 'Subtotal')}</span>
                <span style={{ color: COLORS.navy, fontWeight: 700, ...latinFont }}>
                  {formatMoney(data.invoiceSubtotalUSD, data.invoiceSubtotalKHR)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] py-1">
                <span style={{ color: COLORS.muted }}>{tr('បានទូទាត់', 'Paid')}</span>
                <span style={{ color: COLORS.success, fontWeight: 700, ...latinFont }}>
                  {formatMoney(data.invoicePaidUSD, data.invoicePaidKHR)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] py-1">
                <span style={{ color: COLORS.muted }}>{tr('នៅជំពាក់', 'Balance due')}</span>
                <span style={{ color: COLORS.danger, fontWeight: 700, ...latinFont }}>
                  {formatMoney(data.invoiceBalanceUSD, data.invoiceBalanceKHR)}
                </span>
              </div>
            </div>

            {/* Stock section */}
            <p className="text-sm font-bold mb-2" style={{ color: COLORS.navy }}>
              {tr('ស្តុក', 'Stock')}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="p-3 rounded-xl bg-white" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
                <IconBadge icon={ArrowDownCircle} size={INLINE} tint="stock" shape="rounded" />
                <p className="text-[10px] font-semibold mt-1.5" style={{ color: COLORS.muted }}>
                  {tr('ស្តុកចូល', 'Stock in')}
                </p>
                <p className="text-xs font-bold mt-0.5" style={{ color: COLORS.stock, ...latinFont }}>
                  {data.stockInQty.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
                <IconBadge icon={ArrowUpCircle} size={INLINE} tint="danger" shape="rounded" />
                <p className="text-[10px] font-semibold mt-1.5" style={{ color: COLORS.muted }}>
                  {tr('ស្តុកចេញ', 'Stock out')}
                </p>
                <p className="text-xs font-bold mt-0.5" style={{ color: COLORS.danger, ...latinFont }}>
                  {data.stockOutQty.toLocaleString()}
                </p>
              </div>
            </div>

            {data.lowStockProducts.length > 0 && (
              <div className="bg-white rounded-2xl p-3.5 mb-4" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <IconBadge icon={Package} size={INLINE} tint="account" shape="rounded" />
                  <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
                    {tr('ស្តុកជិតអស់', 'Low stock items')}
                  </p>
                </div>
                {data.lowStockProducts.map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    className="flex justify-between items-center text-[11px] py-1.5"
                    style={{ borderTop: i > 0 ? `1px solid ${COLORS.border}` : 'none' }}
                  >
                    <span className="flex items-center gap-1" style={{ color: COLORS.navy }}>
                      <AlertTriangle size={12} color={COLORS.danger} />
                      {p.name}
                    </span>
                    <span style={{ color: COLORS.danger, fontWeight: 700, ...latinFont }}>
                      {p.quantity} {p.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="hidden print:block text-[10px] text-center mt-6" style={{ color: COLORS.muted }}>
              {tr('បង្កើតនៅ', 'Generated on')} {new Date().toLocaleString(lang === 'KH' ? 'km-KH' : 'en-US')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
