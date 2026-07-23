import { useState, useEffect, useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Package,
  Pencil,
  Trash2,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  History,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { IconBadge } from './IconBadge';
import { COLORS, latinFont, INLINE, ACTION, DEFAULT_UNITS } from '../lib/theme';




interface Product {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  cost_price: number;
  sell_price: number;
  low_stock_threshold: number;
  currency: 'USD' | 'KHR';
  is_active: boolean;
}

interface Movement {
  id: string;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  note: string | null;
  movement_date: string;
}

interface Props {
  lang: 'KH' | 'EN';
  onBack: () => void;
}

function fmtMoney(n: number, currency: string) {
  if (currency === 'USD')
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${n.toLocaleString()} ៛`;
}

const inputStyle: CSSProperties = { borderColor: COLORS.border, backgroundColor: '#FFFFFF', color: COLORS.navy };

export default function StockScreen({ lang, onBack }: Props) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customUnits, setCustomUnits] = useState<string[]>([]);

  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState(DEFAULT_UNITS[0]);
  const [formQuantity, setFormQuantity] = useState('0');
  const [formCost, setFormCost] = useState('');
  const [formSell, setFormSell] = useState('');
  const [formThreshold, setFormThreshold] = useState('5');
  const [formCurrency, setFormCurrency] = useState<'USD' | 'KHR'>('USD');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [moveTarget, setMoveTarget] = useState<Product | null>(null);
  const [moveType, setMoveType] = useState<'in' | 'out'>('in');
  const [moveQty, setMoveQty] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [moveDate, setMoveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState('');

  const [historyTarget, setHistoryTarget] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, unit, quantity, cost_price, sell_price, low_stock_threshold, currency, is_active')
      .eq('is_active', true)
      .order('name');
    if (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    } else {
      setProducts((data as Product[]) || []);
    }
    setLoading(false);
  }, []);

  const fetchCustomUnits = useCallback(async () => {
    const { data, error } = await supabase.from('custom_units').select('name').order('created_at');
    if (!error) setCustomUnits((data || []).map((u: { name: string }) => u.name));
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCustomUnits();
  }, [fetchProducts, fetchCustomUnits]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const summary = useMemo(() => {
    let totalValue = 0;
    let lowStock = 0;
    for (const p of products) {
      totalValue += p.quantity * p.cost_price;
      if (p.quantity <= p.low_stock_threshold) lowStock++;
    }
    return { totalItems: products.length, totalValue, lowStock };
  }, [products]);

  const allUnits = [...DEFAULT_UNITS, ...customUnits.filter((u) => !DEFAULT_UNITS.includes(u))];

  const openAddForm = () => {
    setEditTarget(null);
    setFormName('');
    setFormUnit(DEFAULT_UNITS[0]);
    setFormQuantity('0');
    setFormCost('');
    setFormSell('');
    setFormThreshold('5');
    setFormCurrency('USD');
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditForm = (p: Product) => {
    setEditTarget(p);
    setFormName(p.name);
    setFormUnit(p.unit);
    setFormQuantity(String(p.quantity));
    setFormCost(String(p.cost_price));
    setFormSell(String(p.sell_price));
    setFormThreshold(String(p.low_stock_threshold));
    setFormCurrency(p.currency);
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveProduct = async () => {
    setFormError('');
    if (!formName.trim()) {
      setFormError(tr('សូមបញ្ចូលឈ្មោះទំនិញ', 'Please enter a product name'));
      return;
    }
    const cost = parseFloat(formCost) || 0;
    const sell = parseFloat(formSell) || 0;
    const threshold = parseFloat(formThreshold) || 0;
    setFormBusy(true);
    const { data: userData } = await supabase.auth.getUser();

    if (editTarget) {
      const { error } = await supabase
        .from('products')
        .update({
          name: formName.trim(),
          unit: formUnit,
          cost_price: cost,
          sell_price: sell,
          low_stock_threshold: threshold,
          currency: formCurrency,
        })
        .eq('id', editTarget.id);
      setFormBusy(false);
      if (error) {
        setFormError(error.message);
        return;
      }
    } else {
      const openingQty = parseFloat(formQuantity) || 0;
      const { data: prod, error } = await supabase
        .from('products')
        .insert({
          user_id: userData.user?.id,
          name: formName.trim(),
          unit: formUnit,
          cost_price: cost,
          sell_price: sell,
          low_stock_threshold: threshold,
          currency: formCurrency,
        })
        .select()
        .maybeSingle();
      if (error || !prod) {
        setFormBusy(false);
        setFormError(error?.message || tr('មិនអាចរក្សាទុកបានទេ', 'Could not save'));
        return;
      }
      if (openingQty > 0) {
        await supabase.from('stock_movements').insert({
          product_id: prod.id,
          user_id: userData.user?.id,
          type: 'in',
          quantity: openingQty,
          note: tr('ស្តុកចាប់ផ្តើម', 'Opening stock'),
        });
      }
      setFormBusy(false);
    }
    setIsFormOpen(false);
    fetchProducts();
  };

  const openMoveModal = (p: Product, type: 'in' | 'out') => {
    setMoveTarget(p);
    setMoveType(type);
    setMoveQty('');
    setMoveNote('');
    setMoveDate(new Date().toISOString().slice(0, 10));
    setMoveError('');
  };

  const handleAddMovement = async () => {
    if (!moveTarget) return;
    setMoveError('');
    const qty = parseFloat(moveQty);
    if (!qty || qty <= 0) {
      setMoveError(tr('សូមបញ្ចូលចំនួនត្រឹមត្រូវ', 'Please enter a valid quantity'));
      return;
    }
    if (moveType === 'out' && qty > moveTarget.quantity) {
      setMoveError(tr('ស្តុកមិនគ្រប់គ្រាន់', 'Not enough stock'));
      return;
    }
    setMoveBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('stock_movements').insert({
      product_id: moveTarget.id,
      user_id: userData.user?.id,
      type: moveType,
      quantity: qty,
      note: moveNote.trim() || null,
      movement_date: moveDate,
    });
    setMoveBusy(false);
    if (error) {
      setMoveError(error.message);
      return;
    }
    setMoveTarget(null);
    fetchProducts();
  };

  const openHistory = async (p: Product) => {
    setHistoryTarget(p);
    setMovementsLoading(true);
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, type, quantity, note, movement_date')
      .eq('product_id', p.id)
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    setMovementsLoading(false);
    if (!error) setMovements((data as Movement[]) || []);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    // Soft delete so historical invoice items / movements stay intact.
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', deleteTarget.id);
    setDeleteBusy(false);
    if (error) {
      console.error('Delete failed:', error);
      return;
    }
    setDeleteTarget(null);
    fetchProducts();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.bgApp }}>
      {/* Header */}
      <div
        className="px-4 pt-4 pb-4 flex items-center gap-3"
        style={{
          background: `linear-gradient(135deg, ${COLORS.navy} 0%, #185FA5 100%)`,
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' }}
        >
          <ArrowLeft size={INLINE} color="#FFFFFF" strokeWidth={2} />
        </button>
        <div>
          <p className="text-white font-bold text-base">{tr('ស្តុកទំនិញ', 'Stock')}</p>
          <p className="text-white/70 text-xs">
            {tr('គ្រប់គ្រងទំនិញ និងបរិមាណស្តុក', 'Manage products and stock levels')}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 pb-24 -mt-2">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-white" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
            <IconBadge icon={Package} size={INLINE} tint="stock" shape="rounded" />
            <p className="text-[10px] font-semibold mt-1.5" style={{ color: COLORS.muted }}>
              {tr('ចំនួនមុខ', 'Products')}
            </p>
            <p className="text-sm font-bold mt-0.5" style={{ color: COLORS.navy, ...latinFont }}>
              {summary.totalItems}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white" style={{ boxShadow: '0 2px 8px rgba(12,68,124,0.08)' }}>
            <IconBadge icon={AlertTriangle} size={INLINE} tint="danger" shape="rounded" />
            <p className="text-[10px] font-semibold mt-1.5" style={{ color: COLORS.muted }}>
              {tr('ស្តុកទាប', 'Low Stock')}
            </p>
            <p className="text-sm font-bold mt-0.5" style={{ color: COLORS.danger, ...latinFont }}>
              {summary.lowStock}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={{ backgroundColor: COLORS.stock }}>
            <IconBadge icon={Package} size={INLINE} tint="white" shape="rounded" />
            <p className="text-[10px] font-semibold text-white/90 mt-1.5">
              {tr('តម្លៃស្តុក', 'Stock Value')}
            </p>
            <p className="text-xs font-bold mt-0.5 text-white" style={latinFont}>
              {fmtMoney(summary.totalValue, 'USD')}
            </p>
          </div>
        </div>

        {/* Search + Add */}
        <div className="flex gap-2 mt-4">
          <div
            className="flex-1 flex items-center gap-2 px-3 rounded-xl border bg-white"
            style={{ borderColor: COLORS.border }}
          >
            <Search size={16} color={COLORS.muted} strokeWidth={2} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('ស្វែងរកទំនិញ...', 'Search products...')}
              className="flex-1 py-2.5 text-sm outline-none bg-transparent"
              style={{ color: COLORS.navy }}
            />
          </div>
          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 px-3.5 rounded-xl font-bold text-white text-sm"
            style={{ backgroundColor: COLORS.stock }}
          >
            <Plus size={INLINE} color="#FFFFFF" strokeWidth={2} />
            {tr('បន្ថែម', 'Add')}
          </button>
        </div>

        {/* Product list */}
        <div className="mt-4 space-y-2.5">
          {loading && (
            <p className="text-xs text-center py-6" style={{ color: COLORS.muted }}>
              {tr('កំពុងផ្ទុក...', 'Loading...')}
            </p>
          )}
          {!loading && filteredProducts.length === 0 && (
            <div className="text-center py-10">
              <IconBadge icon={Package} size={ACTION} tint="stock" shape="rounded" className="mx-auto" />
              <p className="text-xs mt-3" style={{ color: COLORS.muted }}>
                {tr('មិនទាន់មានទំនិញនៅឡើយទេ', 'No products yet')}
              </p>
            </div>
          )}
          {filteredProducts.map((p) => {
            const isLow = p.quantity <= p.low_stock_threshold;
            return (
              <div key={p.id} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.stock}` }}>
                <div className="p-3.5">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <IconBadge icon={Package} size={INLINE} tint="stock" shape="rounded" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: COLORS.navy }}>
                          {p.name}
                        </p>
                        <p className="text-xs" style={{ color: COLORS.muted, ...latinFont }}>
                          {tr('លក់', 'Sell')} {fmtMoney(p.sell_price, p.currency)} · {tr('ដើម', 'Cost')}{' '}
                          {fmtMoney(p.cost_price, p.currency)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p
                        className="text-sm font-extrabold"
                        style={{ color: isLow ? COLORS.danger : COLORS.navy, ...latinFont }}
                      >
                        {p.quantity} {p.unit}
                      </p>
                      {isLow && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                          style={{ backgroundColor: COLORS.dangerTint, color: COLORS.danger }}
                        >
                          <AlertTriangle size={10} color={COLORS.danger} strokeWidth={2} />
                          {tr('ស្តុកទាប', 'Low')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex border-t" style={{ borderColor: COLORS.border }}>
                  <button
                    onClick={() => openMoveModal(p, 'in')}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold"
                    style={{ color: COLORS.success }}
                  >
                    <ArrowDownCircle size={16} color={COLORS.success} strokeWidth={2} />
                    {tr('ចូល', 'Stock In')}
                  </button>
                  <div style={{ width: 1, backgroundColor: COLORS.border }} />
                  <button
                    onClick={() => openMoveModal(p, 'out')}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold"
                    style={{ color: COLORS.danger }}
                  >
                    <ArrowUpCircle size={16} color={COLORS.danger} strokeWidth={2} />
                    {tr('ចេញ', 'Stock Out')}
                  </button>
                  <div style={{ width: 1, backgroundColor: COLORS.border }} />
                  <button
                    onClick={() => openHistory(p)}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold"
                    style={{ color: COLORS.stock }}
                  >
                    <History size={16} color={COLORS.stock} strokeWidth={2} />
                    {tr('ប្រវត្តិ', 'History')}
                  </button>
                  <div style={{ width: 1, backgroundColor: COLORS.border }} />
                  <button
                    onClick={() => openEditForm(p)}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-bold"
                    style={{ color: COLORS.navy }}
                  >
                    <Pencil size={16} color={COLORS.navy} strokeWidth={2} />
                    {tr('កែ', 'Edit')}
                  </button>
                  <div style={{ width: 1, backgroundColor: COLORS.border }} />
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="flex items-center justify-center px-3.5"
                    style={{ color: COLORS.danger }}
                  >
                    <Trash2 size={16} color={COLORS.danger} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isFormOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ backgroundColor: 'rgba(18,48,58,0.5)' }}
          onClick={() => setIsFormOpen(false)}
        >
          <div className="bg-white rounded-t-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm font-bold" style={{ color: COLORS.navy }}>
                {editTarget ? tr('កែសម្រួលទំនិញ', 'Edit Product') : tr('បន្ថែមទំនិញថ្មី', 'Add Product')}
              </p>
              <button onClick={() => setIsFormOpen(false)}>
                <X size={20} color={COLORS.muted} strokeWidth={2} />
              </button>
            </div>

            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
              {tr('ឈ្មោះទំនិញ', 'Product Name')}
            </label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={tr('ឧ. កូកាកូឡា កំប៉ុង', 'e.g. Coca-Cola Can')}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
              style={inputStyle}
            />

            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
                  {tr('ឯកតា', 'Unit')}
                </label>
                <select
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  className="w-full rounded-lg border px-2 py-2.5 text-sm outline-none"
                  style={inputStyle}
                >
                  {allUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              {!editTarget && (
                <div className="flex-1">
                  <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
                    {tr('បរិមាណដើម', 'Opening Qty')}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              )}
              <div className="flex-1">
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
                  {tr('រូបិយប័ណ្ណ', 'Currency')}
                </label>
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value as 'USD' | 'KHR')}
                  className="w-full rounded-lg border px-2 py-2.5 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
                  {tr('តម្លៃដើម', 'Cost Price')}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
                  {tr('តម្លៃលក់', 'Sell Price')}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formSell}
                  onChange={(e) => setFormSell(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
              {tr('កម្រិតស្តុកទាប (ជូនដំណឹង)', 'Low Stock Alert Level')}
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={formThreshold}
              onChange={(e) => setFormThreshold(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
              style={inputStyle}
            />

            {formError && (
              <p className="text-xs mb-2" style={{ color: COLORS.danger }}>
                {formError}
              </p>
            )}

            <button
              onClick={handleSaveProduct}
              disabled={formBusy}
              className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
              style={{ backgroundColor: COLORS.stock }}
            >
              {formBusy ? tr('កំពុងរក្សាទុក...', 'Saving...') : tr('រក្សាទុក', 'Save')}
            </button>
          </div>
        </div>
      )}

      {/* Stock In/Out Modal */}
      {moveTarget && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ backgroundColor: 'rgba(18,48,58,0.5)' }}
          onClick={() => setMoveTarget(null)}
        >
          <div className="bg-white rounded-t-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm font-bold" style={{ color: COLORS.navy }}>
                {moveType === 'in' ? tr('បញ្ចូលស្តុក', 'Stock In') : tr('ដកស្តុកចេញ', 'Stock Out')} — {moveTarget.name}
              </p>
              <button onClick={() => setMoveTarget(null)}>
                <X size={20} color={COLORS.muted} strokeWidth={2} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: COLORS.muted }}>
              {tr('ស្តុកបច្ចុប្បន្ន', 'Current stock')}:{' '}
              <span className="font-bold" style={{ color: COLORS.navy, ...latinFont }}>
                {moveTarget.quantity} {moveTarget.unit}
              </span>
            </p>

            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
              {tr('ថ្ងៃទី', 'Date')}
            </label>
            <input
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
              style={inputStyle}
            />

            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
              {tr('ចំនួន', 'Quantity')} ({moveTarget.unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={moveQty}
              onChange={(e) => setMoveQty(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
              style={inputStyle}
            />

            <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
              {tr('កំណត់ចំណាំ', 'Note')}
            </label>
            <input
              value={moveNote}
              onChange={(e) => setMoveNote(e.target.value)}
              placeholder={
                moveType === 'in'
                  ? tr('ឧ. ទិញបន្ថែមពីអ្នកផ្គត់ផ្គង់', 'e.g. Restock from supplier')
                  : tr('ឧ. ខូច, បាត់, ប្រើប្រាស់ផ្ទាល់ខ្លួន', 'e.g. Damaged, lost, personal use')
              }
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
              style={inputStyle}
            />

            {moveError && (
              <p className="text-xs mb-2" style={{ color: COLORS.danger }}>
                {moveError}
              </p>
            )}

            <button
              onClick={handleAddMovement}
              disabled={moveBusy}
              className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
              style={{ backgroundColor: moveType === 'in' ? COLORS.success : COLORS.danger }}
            >
              {moveBusy ? tr('កំពុងរក្សាទុក...', 'Saving...') : tr('បញ្ជាក់', 'Confirm')}
            </button>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyTarget && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ backgroundColor: 'rgba(18,48,58,0.5)' }}
          onClick={() => setHistoryTarget(null)}
        >
          <div
            className="bg-white rounded-t-2xl p-5 w-full max-w-md max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm font-bold" style={{ color: COLORS.navy }}>
                {tr('ប្រវត្តិស្តុក', 'Stock History')} — {historyTarget.name}
              </p>
              <button onClick={() => setHistoryTarget(null)}>
                <X size={20} color={COLORS.muted} strokeWidth={2} />
              </button>
            </div>
            {movementsLoading && (
              <p className="text-xs text-center py-4" style={{ color: COLORS.muted }}>
                {tr('កំពុងផ្ទុក...', 'Loading...')}
              </p>
            )}
            {!movementsLoading && movements.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: COLORS.muted }}>
                {tr('មិនទាន់មានប្រវត្តិនៅឡើយទេ', 'No history yet')}
              </p>
            )}
            {movements.map((m) => (
              <div key={m.id} className="flex justify-between items-center py-2 border-b last:border-b-0" style={{ borderColor: COLORS.border }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: COLORS.navy, ...latinFont }}>
                    {m.movement_date}
                  </p>
                  {m.note && (
                    <p className="text-[11px]" style={{ color: COLORS.muted }}>
                      {m.note}
                    </p>
                  )}
                </div>
                <span
                  className="text-sm font-bold"
                  style={{ color: m.type === 'in' ? COLORS.success : COLORS.danger, ...latinFont }}
                >
                  {m.type === 'in' ? '+' : '-'}
                  {m.quantity} {historyTarget.unit}
                </span>
              </div>
            ))}
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
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
            <IconBadge icon={Trash2} size={ACTION} tint="danger" shape="rounded" className="mx-auto" />
            <p className="text-sm font-bold mt-3 mb-1" style={{ color: COLORS.navy }}>
              {tr('លុបទំនិញ?', 'Delete Product?')}
            </p>
            <p className="text-xs mb-4" style={{ color: COLORS.muted }}>
              {deleteTarget.name}
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
