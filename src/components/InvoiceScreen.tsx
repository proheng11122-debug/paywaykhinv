import { useState, useRef, useMemo, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  QrCode,
  Save,
  Share2,
  Pencil,
  Eye,
  Hash,
  User,
  Package,
  Calendar,
  FileText,
  Minus,
  DollarSign,
  Percent,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { IconBadge } from './IconBadge';
import { COLORS, khmerFont, INLINE, DEFAULT_UNITS } from '../lib/theme';

type Tab = 'edit' | 'preview';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  unit: string;
  product_id: string | null;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  sell_price: number;
  quantity: number;
}

interface Profile {
  id: string;
  business_name: string | null;
  username: string | null;
  phone: string | null;
  qr_code_url: string | null;
  avatar_url: string | null;
}

interface Props {
  lang: 'KH' | 'EN';
  profile: Profile;
  onBack: () => void;
  editInvoiceId?: string | null;
}

let itemIdCounter = 0;
const genItemId = () => `item-${++itemIdCounter}`;

function fmtMoney(n: number, currency: string) {
  const formattedNumber = n.toLocaleString(undefined, {
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  });
  return currency === 'USD' ? `$${formattedNumber}` : `៛${formattedNumber}`;
}

export default function InvoiceScreen({ lang, profile, onBack, editInvoiceId }: Props) {
  const [tab, setTab] = useState<Tab>(editInvoiceId ? 'preview' : 'edit');
  const [invoiceId, setInvoiceId] = useState<string | null>(editInvoiceId ?? null);
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: genItemId(), description: '', quantity: '1', unit_price: '', unit: DEFAULT_UNITS[0], product_id: null },
  ]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [discount, setDiscount] = useState('0');

  // Payment (kept simple: one running "paid so far" figure, backed by the
  // invoice_payments ledger so it stays consistent with the Settle feature
  // on the invoice list screen).
  const [paidInput, setPaidInput] = useState('0');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState('');
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState<number | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [showQR, setShowQR] = useState(false);
  const [showQRUpload, setShowQRUpload] = useState(false);
  const [qrUploadBusy, setQrUploadBusy] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(profile.qr_code_url);
  const [shareBusy, setShareBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Units (shared pattern with Income/Expense)
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [addingUnitFor, setAddingUnitFor] = useState<string | null>(null);
  const [newUnitName, setNewUnitName] = useState('');

  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);

  useEffect(() => {
    setQrCodeUrl(profile.qr_code_url);
  }, [profile.qr_code_url]);

  useEffect(() => {
    supabase
      .from('custom_units')
      .select('name')
      .order('created_at')
      .then(({ data, error }) => {
        if (!error) setCustomUnits((data || []).map((u: { name: string }) => u.name));
      });
    supabase
      .from('products')
      .select('id, name, unit, sell_price, quantity')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (!error) setProducts((data as Product[]) || []);
      });
  }, []);

  const selectProductForItem = (itemId: string, productId: string) => {
    if (!productId) {
      updateItem(itemId, 'product_id', '');
      return;
    }
    const p = products.find((pr) => pr.id === productId);
    if (!p) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, product_id: p.id, description: p.name, unit: p.unit, unit_price: String(p.sell_price) }
          : i
      )
    );
  };

  const handleAddNewUnit = async (itemId: string) => {
    const name = newUnitName.trim();
    if (!name) return;
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase
        .from('custom_units')
        .upsert({ user_id: userData.user.id, name }, { onConflict: 'user_id,name' });
    }
    setCustomUnits((prev) => (prev.includes(name) ? prev : [...prev, name]));
    updateItem(itemId, 'unit', name);
    setNewUnitName('');
    setAddingUnitFor(null);
  };

  useEffect(() => {
    if (!editInvoiceId) return;
    let cancelled = false;
    (async () => {
      const { data: inv } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', editInvoiceId)
        .maybeSingle();
      if (!inv || cancelled) return;
      setInvoiceNumber(inv.invoice_number);
      setCustomerName(inv.customer_name || '');
      setCustomerPhone(inv.customer_phone || '');
      setInvoiceDate(inv.invoice_date || new Date().toISOString().slice(0, 10));
      setDueDate(inv.due_date || '');
      setCurrency(inv.currency || 'USD');
      setDiscount(String(inv.discount || '0'));
      setPaidInput(String(inv.paid_amount || '0'));
      if (Number(inv.discount) > 0 || Number(inv.paid_amount) > 0) setShowPaymentPanel(true);

      const { data: itemRows } = await supabase
        .from('invoice_items')
        .select('description, quantity, unit_price, unit, product_id')
        .eq('invoice_id', editInvoiceId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (itemRows && itemRows.length > 0) {
        setItems(
          itemRows.map((r: { description: string; quantity: number; unit_price: number; unit: string | null; product_id: string | null }) => ({
            id: genItemId(),
            description: r.description || '',
            quantity: String(r.quantity),
            unit_price: String(r.unit_price),
            unit: r.unit || DEFAULT_UNITS[0],
            product_id: r.product_id || null,
          }))
        );
      }

      // Pull the most recent ledger entry (if any) just to prefill the
      // date/note shown in the editor — the running total itself comes
      // from invoices.paid_amount above, which the DB keeps in sync.
      const { data: lastPayment } = await supabase
        .from('invoice_payments')
        .select('payment_date, note')
        .eq('invoice_id', editInvoiceId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && lastPayment) {
        if (lastPayment.payment_date) setPaymentDate(lastPayment.payment_date);
        if (lastPayment.note) setPaymentNote(lastPayment.note);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editInvoiceId]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        return sum + qty * price;
      }, 0),
    [items]
  );

  const discountVal = parseFloat(discount) || 0;
  const paidVal = parseFloat(paidInput) || 0;
  const balance = subtotal - discountVal - paidVal;

  const addItem = () =>
    setItems([
      ...items,
      { id: genItemId(), description: '', quantity: '1', unit_price: '', unit: DEFAULT_UNITS[0], product_id: null },
    ]);

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const handleSave = async () => {
    setSaveError('');
    setSaveSuccess(false);
    const validItems = items.filter((i) => i.description.trim() && (parseFloat(i.quantity) || 0) > 0);
    if (!customerName.trim()) {
      setSaveError(tr('សូមបញ្ចូលឈ្មោះអតិថិជន', 'Please enter customer name'));
      return;
    }
    if (validItems.length === 0) {
      setSaveError(tr('សូមបញ្ចូលបញ្ជីទំនិញយ៉ាងហោចណាស់មួយ', 'Please add at least one item'));
      return;
    }
    setSaveBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaveBusy(false);
      setSaveError(tr('មិនអាចរក្សាទុកបានទេ', 'Could not save'));
      return;
    }

    const invoicePayload = {
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      subtotal,
      discount: discountVal,
      currency,
    };

    const itemRows = validItems.map((i) => ({
      description: i.description.trim(),
      quantity: parseFloat(i.quantity) || 0,
      unit_price: parseFloat(i.unit_price) || 0,
      unit: i.unit,
      product_id: i.product_id || null,
    }));

    let currentInvoiceId = invoiceId;

    if (currentInvoiceId) {
      const { error: updError } = await supabase.from('invoices').update(invoicePayload).eq('id', currentInvoiceId);
      if (updError) {
        setSaveBusy(false);
        setSaveError(updError.message);
        return;
      }
      await supabase.from('invoice_items').delete().eq('invoice_id', currentInvoiceId);
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemRows.map((r) => ({ ...r, invoice_id: currentInvoiceId })));
      if (itemsError) {
        setSaveBusy(false);
        setSaveError(itemsError.message);
        return;
      }
    } else {
      const { data: invData, error: invError } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select()
        .maybeSingle();
      if (invError || !invData) {
        setSaveBusy(false);
        setSaveError(invError?.message || tr('មិនអាចរក្សាទុកបានទេ', 'Could not save'));
        return;
      }
      currentInvoiceId = invData.id;
      setInvoiceId(invData.id);
      setInvoiceNumber(invData.invoice_number);

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemRows.map((r) => ({ ...r, invoice_id: currentInvoiceId })));
      if (itemsError) {
        setSaveBusy(false);
        setSaveError(itemsError.message);
        return;
      }

      // Deduct stock for items linked to a product — first save only, to
      // avoid double-deducting when an invoice is edited later.
      const stockRows = itemRows
        .filter((r) => r.product_id && r.quantity > 0)
        .map((r) => ({
          product_id: r.product_id,
          user_id: userData.user!.id,
          type: 'out' as const,
          quantity: r.quantity,
          note: tr('លក់តាមវិក្កយបត្រ', 'Sold via invoice'),
          movement_date: invoiceDate,
        }));
      if (stockRows.length > 0) {
        await supabase.from('stock_movements').insert(stockRows);
      }
    }

    // Keep the "paid so far" figure backed by the payment ledger (a single
    // row representing the running total) so invoices.paid_amount — kept in
    // sync by the DB trigger — matches what's shown here AND on the invoice
    // list's Settle feature.
    await supabase.from('invoice_payments').delete().eq('invoice_id', currentInvoiceId);
    if (paidVal > 0) {
      await supabase.from('invoice_payments').insert({
        invoice_id: currentInvoiceId,
        amount: paidVal,
        note: paymentNote.trim() || null,
        payment_date: paymentDate,
      });
    }

    setSaveBusy(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleShare = async () => {
    if (!previewRef.current) return;
    setShareBusy(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, { backgroundColor: '#FFFFFF', scale: 2, useCORS: true });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceNumber || 'draft'}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      console.error(e);
    }
    setShareBusy(false);
  };

  const handleQRUpload = async (file: File) => {
    setQrUploadBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const path = `${userData.user.id}/qr-code.png`;
    await supabase.storage.from('qr-codes').upload(path, file, { upsert: true });
    const { data: pubData } = supabase.storage.from('qr-codes').getPublicUrl(path);
    await supabase.from('profiles').update({ qr_code_url: pubData.publicUrl }).eq('id', userData.user.id);
    setQrCodeUrl(pubData.publicUrl);
    setQrUploadBusy(false);
    setShowQRUpload(false);
  };

  const inputStyle: CSSProperties = {
    borderColor: COLORS.border,
    backgroundColor: '#FAFAF8',
    color: COLORS.navy,
    ...khmerFont,
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.bgApp, ...khmerFont }}>
      {/* Upper header navigation */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${COLORS.navyGradientStart}, ${COLORS.navyGradientEnd})` }}>
        <button onClick={onBack} className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <ArrowLeft size={INLINE} color="#FFFFFF" strokeWidth={2} />
        </button>
        <div>
          <p className="text-white font-bold text-sm">{tr('វិក្កយបត្រ', 'Invoice Management')}</p>
          <p className="text-white/70 text-xs">{tr('គ្រប់គ្រង និងកែសម្រួលវិក្កយបត្រ', 'Manage and view details')}</p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="px-4 pt-3">
        <div className="flex rounded-xl border p-1 gap-1 bg-gray-100" style={{ borderColor: COLORS.border }}>
          <button
            onClick={() => setTab('edit')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{ backgroundColor: tab === 'edit' ? COLORS.invoice : 'transparent', color: tab === 'edit' ? '#FFF' : COLORS.muted }}
          >
            <Pencil size={INLINE} strokeWidth={2} />
            {tr('កែសម្រួល', 'Edit')}
          </button>
          <button
            onClick={() => setTab('preview')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{ backgroundColor: tab === 'preview' ? COLORS.invoice : 'transparent', color: tab === 'preview' ? '#FFF' : COLORS.muted }}
          >
            <Eye size={INLINE} strokeWidth={2} />
            {tr('មើល', 'Preview')}
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'edit' ? (
          <div className="space-y-3">
            {/* Identity Info */}
            <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: COLORS.border }}>
              <div className="flex items-center gap-2 mb-3">
                <IconBadge icon={Hash} size={INLINE} tint="invoice" shape="rounded" />
                <p className="text-xs font-bold text-gray-500">{tr('អត្តសញ្ញាណ', 'Identity')}</p>
                <span className="ml-auto text-sm font-bold" style={{ color: COLORS.navy }}>
                  {invoiceNumber ? `#${String(invoiceNumber).padStart(6, '0')}` : tr('#ថ្មី', '#New')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold block mb-1 text-gray-700">{tr('ថ្ងៃទី', 'Date')}</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1 text-gray-700">{tr('ថ្ងៃផុតកំណត់', 'Due Date')}</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: COLORS.border }}>
              <div className="flex items-center gap-2 mb-3">
                <IconBadge icon={User} size={INLINE} tint="invoice" shape="rounded" />
                <p className="text-xs font-bold text-gray-500">{tr('ព័ត៌មានអតិថិជន', 'Customer Info')}</p>
              </div>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={tr('ឈ្មោះអតិថិជន', 'Customer name')}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-2"
                style={inputStyle}
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={tr('លេខទូរស័ព្ទ', 'Phone number')}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </div>

            {/* Items List */}
            <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: COLORS.border }}>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <Package size={INLINE} className="text-blue-600" />
                  <p className="text-xs font-bold text-gray-500">{tr('បញ្ជីទំនិញ', 'Products')}</p>
                </div>
                <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold" style={{ color: COLORS.invoice }}>
                  <Plus size={INLINE} strokeWidth={2} />
                  {tr('បន្ថែមជួរ', 'Append Row')}
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={item.id} className="mb-3 p-3 rounded-lg border bg-gray-50" style={{ borderColor: COLORS.border }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(item.id)}>
                        <Trash2 size={INLINE} color={COLORS.danger} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  {products.length > 0 && (
                    <select
                      value={item.product_id || ''}
                      onChange={(e) => selectProductForItem(item.id, e.target.value)}
                      className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none mb-2"
                      style={{ ...inputStyle, color: item.product_id ? COLORS.navy : COLORS.muted }}
                    >
                      <option value="">{tr('— ជ្រើសពីស្តុក (ស្រេចចិត្ត) —', '— Pick from stock (optional) —')}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.quantity} {p.unit} {tr('នៅសល់', 'left')})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder={tr('ការពិពណ៌នាទំនិញ ឬសេវាកម្ម', 'Description')}
                    className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none mb-2"
                    style={inputStyle}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold block mb-0.5 text-gray-500">{tr('ចំនួន', 'Qty')}</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold block mb-0.5 text-gray-500">
                        {tr('តម្លៃរាយ', 'Price')} ({currency === 'USD' ? '$' : '៛'})
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 text-sm font-extrabold" style={{ color: COLORS.navy }}>{currency === 'USD' ? '$' : '៛'}</span>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(item.id, 'unit_price', e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border pl-7 pr-2.5 py-2 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-[10px] font-semibold block mb-0.5 text-gray-500">{tr('ឯកតា', 'Unit')}</label>
                    <div className="flex gap-1">
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border px-2 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        {[...DEFAULT_UNITS, ...customUnits.filter((u) => !DEFAULT_UNITS.includes(u))].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setAddingUnitFor(addingUnitFor === item.id ? null : item.id)}
                        className="w-8 rounded-lg border font-bold flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: COLORS.border, backgroundColor: COLORS.goldTint, color: COLORS.goldDark }}
                      >
                        <Plus size={16} color={COLORS.goldDark} strokeWidth={2} />
                      </button>
                    </div>
                    {addingUnitFor === item.id && (
                      <div className="flex gap-1 mt-1">
                        <input
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          placeholder={tr('ឯកតាថ្មី', 'New unit')}
                          className="flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none"
                          style={inputStyle}
                        />
                        <button
                          onClick={() => handleAddNewUnit(item.id)}
                          className="px-2.5 rounded-lg font-bold text-white text-xs"
                          style={{ backgroundColor: COLORS.navy }}
                        >
                          {tr('បន្ថែម', 'Add')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Currency — placed above the payment section on its own */}
            <div className="bg-white rounded-2xl p-3.5 border" style={{ borderColor: COLORS.border }}>
              <label className="text-xs font-semibold block mb-1.5 text-gray-700">{tr('រូបិយប័ណ្ណ', 'Currency')}</label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCurrency('USD')}
                  className="flex-1 py-2 rounded-lg border text-xs font-bold"
                  style={{ backgroundColor: currency === 'USD' ? COLORS.invoice : '#FFF', color: currency === 'USD' ? '#FFF' : '#333', borderColor: COLORS.border }}
                >
                  USD
                </button>
                <button
                  onClick={() => setCurrency('KHR')}
                  className="flex-1 py-2 rounded-lg border text-xs font-bold"
                  style={{ backgroundColor: currency === 'KHR' ? COLORS.invoice : '#FFF', color: currency === 'KHR' ? '#FFF' : '#333', borderColor: COLORS.border }}
                >
                  KHR
                </button>
              </div>
            </div>

            {/* Payment card — collapsed by default, "+" opens the panel */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: COLORS.border }}>
              <button
                onClick={() => setShowPaymentPanel((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.invoiceTint }}>
                    <DollarSign size={14} color={COLORS.invoice} strokeWidth={2.5} />
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-bold" style={{ color: COLORS.navy }}>{tr('ការទូទាត់ប្រាក់', 'Payment')}</p>
                    {(paidVal > 0 || discountVal > 0) && (
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        {tr('បានបង់', 'Paid')} {fmtMoney(paidVal, currency)}
                        {discountVal > 0 && ` · ${tr('បញ្ចុះ', 'Disc.')} ${fmtMoney(discountVal, currency)}`}
                      </p>
                    )}
                  </div>
                </div>
                <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.invoiceTint }}>
                  {showPaymentPanel ? (
                    <Minus size={15} color={COLORS.invoice} strokeWidth={2.5} />
                  ) : (
                    <Plus size={15} color={COLORS.invoice} strokeWidth={2.5} />
                  )}
                </span>
              </button>

              {showPaymentPanel && (
                <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <div className="pt-3">
                    <label className="text-[11px] font-bold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                      <Calendar size={12} />
                      {tr('ថ្ងៃទីអតិថិជនបង់ប្រាក់', 'Payment Date')}
                    </label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                      style={inputStyle}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                        <DollarSign size={12} />
                        {tr('ប្រាក់បានបង់', 'Amount Paid')} ({currency === 'USD' ? '$' : '៛'})
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 text-sm font-extrabold" style={{ color: COLORS.navy }}>{currency === 'USD' ? '$' : '៛'}</span>
                        <input
                          type="number"
                          value={paidInput}
                          onChange={(e) => setPaidInput(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border pl-7 pr-2.5 py-2 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                        <Percent size={12} />
                        {tr('ការបញ្ចុះតម្លៃ', 'Discount')} ({currency === 'USD' ? '$' : '៛'})
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 text-sm font-extrabold" style={{ color: COLORS.navy }}>{currency === 'USD' ? '$' : '៛'}</span>
                        <input
                          type="number"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border pl-7 pr-2.5 py-2 text-sm outline-none"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>


                  <div>
                    <label className="text-[11px] font-bold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                      <FileText size={12} />
                      {tr('ចំណាំ', 'Description')}
                    </label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder={tr('ឧទាហរណ៍៖ បង់តាមកុងវីង, ABA...', 'e.g. Paid via ABA')}
                      className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="bg-white rounded-2xl p-4 border space-y-2" style={{ borderColor: COLORS.border }}>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{tr('សរុបរង', 'Subtotal')}</span>
                <span className="font-bold">{fmtMoney(subtotal, currency)}</span>
              </div>
              {discountVal > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>{tr('បញ្ចុះតម្លៃ', 'Discount')}</span>
                  <span className="font-bold">-{fmtMoney(discountVal, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-green-600">
                <span>{tr('បានបង់', 'Paid')}</span>
                <span className="font-bold">{fmtMoney(paidVal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t font-extrabold" style={{ borderColor: COLORS.border, color: COLORS.navy }}>
                <span>{tr('នៅសល់', 'Balance')}</span>
                <span className="text-red-500">{fmtMoney(balance, currency)}</span>
              </div>
            </div>

            <button
              onClick={() => (qrCodeUrl ? setShowQR(true) : setShowQRUpload(true))}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold bg-amber-50 text-amber-800"
              style={{ borderColor: COLORS.border }}
            >
              <QrCode size={INLINE} strokeWidth={2} />
              {qrCodeUrl ? tr('បង្ហាញ QR បង់ប្រាក់', 'Show Payment QR') : tr('បញ្ចូល QR បង់ប្រាក់', 'Upload Payment QR')}
            </button>

            {saveError && <div className="p-2 bg-red-50 text-red-600 rounded-lg text-xs text-center border border-red-200">{saveError}</div>}
            {saveSuccess && <div className="p-2 bg-green-50 text-green-600 rounded-lg text-xs text-center border border-green-200">{tr('រក្សាទុកបានជោគជ័យ!', 'Saved successfully!')}</div>}

            <div className="flex gap-2 pb-5">
              <button onClick={handleSave} disabled={saveBusy} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-white text-xs bg-slate-900">
                <Save size={INLINE} strokeWidth={2} />
                {saveBusy ? tr('កំពុងរក្សា...', 'Saving...') : tr('រក្សាទុក', 'Save')}
              </button>
              <button onClick={handleShare} disabled={shareBusy} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-white text-xs bg-amber-500">
                <Share2 size={INLINE} strokeWidth={2} />
                {shareBusy ? tr('កំពុងបង្កើត...', 'Sharing...') : tr('ចែករំលែក', 'Share')}
              </button>
            </div>
          </div>
        ) : (
          /* =========================================================
             INVOICE PREVIEW MODE
             ========================================================= */
          <div ref={previewRef} className="bg-white rounded-2xl overflow-hidden border" style={{ boxShadow: '0 4px 20px rgba(24,41,62,0.05)', borderColor: COLORS.border }}>

            {/* Banner ផ្នែកខាងលើ */}
            <div className="relative pt-6 pb-9 px-5 text-white overflow-hidden" style={{ backgroundColor: '#1E3A8A' }}>
              <div className="absolute bottom-0 right-0 left-0 h-4 bg-[#F59E0B] transform -skew-y-1 origin-bottom-left scale-110"></div>

              <div className="relative z-10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {profile.avatar_url ? (
                    <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border-2 border-white shadow-md">
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center text-[#1E3A8A] text-xl font-black shadow-md border border-blue-200">
                      {profile.business_name ? profile.business_name.charAt(0).toUpperCase() : 'B'}
                    </div>
                  )}
                  <div>
                    <h2 className="text-sm font-black tracking-wide uppercase leading-tight text-white drop-shadow-sm">
                      {profile.business_name || 'Business Name'}
                    </h2>
                    <p className="text-[10px] text-blue-100 font-bold mt-0.5">{profile.phone || '012 345 678'}</p>
                  </div>
                </div>

                <div className="text-right">
                  <h1 className="text-base font-black tracking-wider text-[#F59E0B] drop-shadow-md uppercase">{tr('វិក្កយបត្រ', 'INVOICE')}</h1>
                  <p className="text-[10px] font-black mt-1 bg-white text-[#1E3A8A] px-2 py-0.5 rounded-md shadow-sm inline-block">
                    #{invoiceNumber ? String(invoiceNumber).padStart(6, '0') : '------'}
                  </p>
                </div>
              </div>
            </div>

            {/* Content Body Details */}
            <div className="p-4 relative z-20 bg-white rounded-t-xl -mt-2">
              <div className="grid grid-cols-2 gap-4 mb-4 pb-3 border-b border-gray-200">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">{tr('អតិថិជន', 'BILL TO')}</p>
                  <p className="text-sm font-black text-slate-900">{customerName || '---'}</p>
                  {customerPhone && <p className="text-[11px] text-slate-600 font-bold mt-0.5">{customerPhone}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">{tr('កាលបរិច្ឆេទ', 'DATES')}</p>
                  <p className="text-[11px] text-slate-800 font-bold">{tr('ថ្ងៃចេញ៖ ', 'Issued: ')}{invoiceDate}</p>
                  {dueDate && <p className="text-[11px] text-red-600 font-extrabold mt-0.5">{tr('ផុតកំណត់៖ ', 'Due: ')}{dueDate}</p>}
                </div>
              </div>

              <table className="w-full mb-4">
                <thead>
                  <tr className="bg-[#1E3A8A] text-white">
                    <th className="text-[11px] font-black px-2 py-2 text-left rounded-l">{tr('ការពិពណ៌នា', 'Description')}</th>
                    <th className="text-[11px] font-black py-2 text-center">{tr('ចំនួន', 'Qty')}</th>
                    <th className="text-[11px] font-black py-2 text-right">{tr('តម្លៃរាយ', 'Price')}</th>
                    <th className="text-[11px] font-black px-2 py-2 text-right rounded-r">{tr('សរុប', 'Total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.filter((i) => i.description.trim()).map((item) => {
                    const qty = parseFloat(item.quantity) || 0;
                    const price = parseFloat(item.unit_price) || 0;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="text-xs px-2 py-3 font-bold text-slate-800">{item.description}</td>
                        <td className="text-xs py-3 text-center text-slate-700 font-bold">{qty} {item.unit}</td>
                        <td className="text-xs py-3 text-right text-slate-700 font-extrabold">{fmtMoney(price, currency)}</td>
                        <td className="text-xs px-2 py-3 text-right font-black text-slate-900">{fmtMoney(qty * price, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-end mb-4">
                <div className="w-52 space-y-2 text-[11px] border border-gray-200 bg-slate-50 p-3 rounded-xl shadow-sm">
                  <div className="flex justify-between text-slate-600 font-bold">
                    <span>{tr('សរុបរង', 'Subtotal')}</span>
                    <span className="font-extrabold text-slate-900">{fmtMoney(subtotal, currency)}</span>
                  </div>
                  {discountVal > 0 && (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>{tr('បញ្ចុះតម្លៃ (-)', 'Discount (-)')}</span>
                      <span className="font-extrabold">-{fmtMoney(discountVal, currency)}</span>
                    </div>
                  )}
                  {paidVal > 0 && (
                    <div className="space-y-0.5 border-b border-dashed border-gray-300 pb-1.5 mb-1">
                      <div className="flex justify-between text-emerald-700 font-black text-xs">
                        <span>{tr('បានបង់រួច', 'Paid Amount')}</span>
                        <span>{fmtMoney(paidVal, currency)}</span>
                      </div>
                      <p className="text-[9px] text-slate-600 text-right font-bold bg-amber-100/70 px-1.5 py-0.5 rounded mt-1">
                        {paymentDate && `${tr('បង់ថ្ងៃទី៖ ', 'Paid on: ')} ${paymentDate}`}
                        {paymentNote && ` (${paymentNote})`}
                      </p>
                    </div>
                  )}
                  <div className="flex justify-between text-xs pt-1 font-black border-t border-gray-200">
                    <span className="text-slate-900">{tr('នៅសល់', 'Balance Due')}</span>
                    <span className={balance > 0 ? 'text-red-600 text-sm font-black' : 'text-emerald-700 text-sm font-black'}>
                      {fmtMoney(balance, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {qrCodeUrl && (
                <div className="pt-3 border-t border-gray-200 flex flex-col items-center justify-center bg-slate-50 rounded-xl p-3">
                  <img src={qrCodeUrl} alt="Payment QR" className="w-24 h-24 rounded-lg bg-white p-1 border shadow-md" crossOrigin="anonymous" />
                  <p className="text-[9px] text-slate-700 font-black tracking-wider mt-2 uppercase">{tr('ស្កេន QR ដើម្បីទូទាត់ប្រាក់', 'SCAN QR CODE TO PAY')}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Popups models sections */}
      {showQR && qrCodeUrl && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 px-4" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold mb-3 text-slate-800">{tr('ស្កេន QR ដើម្បីបង់ប្រាក់', 'Scan QR to Pay')}</p>
            <img src={qrCodeUrl} alt="Payment QR" className="w-48 h-48 mx-auto rounded-xl border" crossOrigin="anonymous" />
          </div>
        </div>
      )}

      {showQRUpload && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 px-4" onClick={() => setShowQRUpload(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold mt-2 mb-4 text-slate-800">{tr('បញ្ចូលរូបភាព QR', 'Upload QR Image')}</p>
            <input
              type="file"
              accept="image/*"
              disabled={qrUploadBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleQRUpload(file);
              }}
              className="hidden"
              id="qr-file-upload-input"
            />
            <label htmlFor="qr-file-upload-input" className="block w-full py-2.5 rounded-lg font-bold text-white text-xs cursor-pointer bg-slate-900">
              {qrUploadBusy ? tr('កំពុងបញ្ចូល...', 'Uploading...') : tr('ជ្រើសរើសរូបភាព', 'Choose Image')}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
