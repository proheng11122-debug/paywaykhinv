import { useEffect, useRef, useState } from 'react';
import {
  X,
  Clock,
  QrCode,
  Send,
  CheckCircle2,
  Crown,
  Hash,
  Calendar,
  Upload,
  Download,
  Plus,
  Minus,
  DollarSign,
  Percent,
  FileText,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Smartphone,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { COLORS, latinFont } from '../lib/theme';

type PlanKey = '1m' | '6m' | '1y';

const PLANS: {
  key: PlanKey;
  months: number;
  price: number;
  originalPrice: number;
  labelKh: string;
  labelEn: string;
  tag?: string;
}[] = [
  { key: '1m', months: 1, price: 2, originalPrice: 5, labelKh: '១ ខែ', labelEn: '1 Month' },
  { key: '6m', months: 6, price: 7, originalPrice: 10, labelKh: '៦ ខែ', labelEn: '6 Months' },
  { key: '1y', months: 12, price: 14, originalPrice: 20, labelKh: '១ ឆ្នាំ', labelEn: '1 Year', tag: 'Best Value' },
];

interface Profile {
  subscription_qr_url: string | null;
}

interface Props {
  lang: 'KH' | 'EN';
  profile: Profile;
  trialDaysRemaining: number;
  onClose: () => void;
  onOpenTelegram: () => void;
}

export default function SubscriptionModal({ lang, profile, trialDaysRemaining, onClose, onOpenTelegram }: Props) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);
  const [selected, setSelected] = useState<PlanKey>('1y');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [transactionId, setTransactionId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amountPaid, setAmountPaid] = useState('');
  const [discount, setDiscount] = useState('0');
  const [description, setDescription] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // --- Automatic ABA KHQR payment (create-qr-payment / check-qr-status Edge Functions) ---
  type AutoStatus = 'idle' | 'loading' | 'waiting' | 'confirmed' | 'expired' | 'error';
  const [autoStatus, setAutoStatus] = useState<AutoStatus>('idle');
  const [autoQr, setAutoQr] = useState<{ requestId: string; qrImage: string; abapayDeeplink?: string } | null>(null);
  const [autoError, setAutoError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  useEffect(() => stopTimers, []);

  // Changing the plan invalidates any QR already on screen (different amount).
  useEffect(() => {
    stopTimers();
    setAutoStatus('idle');
    setAutoQr(null);
    setAutoError('');
  }, [selected]);

  const startPolling = (requestId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.functions.invoke('check-qr-status', { body: { requestId } });
      if (data?.status === 'confirmed') {
        stopTimers();
        setAutoStatus('confirmed');
        setSubmitted(true);
      } else if (data?.status === 'expired') {
        stopTimers();
        setAutoStatus('expired');
      }
    }, 3000);
  };

  const handleGenerateAutoQr = async () => {
    setAutoStatus('loading');
    setAutoError('');
    const { data, error } = await supabase.functions.invoke('create-qr-payment', {
      body: { plan: selected },
    });
    if (error || data?.error) {
      setAutoStatus('error');
      setAutoError(data?.error || data?.detail || error?.message || 'Something went wrong');
      return;
    }
    setAutoQr({ requestId: data.requestId, qrImage: data.qrImage, abapayDeeplink: data.abapayDeeplink });
    setSecondsLeft(data.expiresInSeconds || 900);
    setAutoStatus('waiting');
    startPolling(data.requestId);

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const selectedPlan = PLANS.find((p) => p.key === selected)!;
  const effectiveAmount = amountPaid.trim() === '' ? selectedPlan.price : parseFloat(amountPaid) || 0;
  const discountVal = parseFloat(discount) || 0;
  const finalAmount = Math.max(effectiveAmount - discountVal, 0);

  const openDetails = () => {
    setAmountPaid(String(selectedPlan.price));
    setShowDetails(true);
  };

  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setProofUploading(false);
      return;
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `subscription-proofs/${userData.user.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('qr-codes').upload(path, file, { upsert: true });
    if (uploadError) {
      setProofUploading(false);
      setError(uploadError.message);
      return;
    }
    const { data: pubData } = supabase.storage.from('qr-codes').getPublicUrl(path);
    setProofUrl(pubData.publicUrl);
    setProofUploading(false);
    setShowDetails(true);
  };

  const handleSaveQr = () => {
    if (!profile.subscription_qr_url) return;
    const a = document.createElement('a');
    a.href = profile.subscription_qr_url;
    a.download = 'kh-invoice-payment-qr.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleConfirmPaid = async () => {
    setError('');
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('subscription_requests').insert({
      user_id: userData.user?.id,
      plan: selectedPlan.key,
      amount: finalAmount,
      discount: discountVal,
      description: description.trim() || null,
      transaction_id: transactionId.trim() || null,
      payment_date: paymentDate,
      proof_url: proofUrl,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(12,24,38,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 rounded-t-3xl relative"
          style={{ background: `linear-gradient(135deg, ${COLORS.navy} 0%, #185FA5 100%)` }}
        >
          <button onClick={onClose} className="absolute top-4 right-4">
            <X size={20} color="#FFFFFF" strokeWidth={2} />
          </button>
          <div className="flex flex-col items-center text-center pt-1">
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Crown size={22} color="#FFD166" strokeWidth={2} />
            </div>
            <p className="text-white font-extrabold text-base">{tr('គម្រោងសមាជិកភាព', 'Subscription Plans')}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Clock size={12} color="rgba(255,255,255,0.75)" strokeWidth={2} />
              <p className="text-white/75 text-[11px]">
                {trialDaysRemaining > 0
                  ? tr(`សាកល្បងនៅសល់ ${trialDaysRemaining} ថ្ងៃ`, `${trialDaysRemaining} trial day${trialDaysRemaining === 1 ? '' : 's'} left`)
                  : tr('ការសាកល្បងបានផុតកំណត់', 'Trial expired')}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          {!submitted ? (
            <>
              {/* Plan cards with promo pricing */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {PLANS.map((p) => {
                  const isSelected = selected === p.key;
                  const pct = Math.round((1 - p.price / p.originalPrice) * 100);
                  return (
                    <button
                      key={p.key}
                      onClick={() => {
                        setSelected(p.key);
                        setShowDetails(false);
                      }}
                      className="relative rounded-2xl border-2 p-2.5 text-center transition-colors"
                      style={{
                        borderColor: isSelected ? COLORS.navy : COLORS.border,
                        backgroundColor: isSelected ? COLORS.goldTint : '#FFFFFF',
                      }}
                    >
                      {p.tag && (
                        <span
                          className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap"
                          style={{ backgroundColor: COLORS.navy }}
                        >
                          {p.tag}
                        </span>
                      )}
                      <p className="text-[11px] font-semibold mt-1" style={{ color: COLORS.navy }}>
                        {lang === 'KH' ? p.labelKh : p.labelEn}
                      </p>
                      <p className="text-[10px] line-through" style={{ color: COLORS.muted, ...latinFont }}>
                        ${p.originalPrice}
                      </p>
                      <p className="text-lg font-extrabold mt-0.5" style={{ color: COLORS.navy, ...latinFont }}>
                        ${p.price}
                      </p>
                      <span
                        className="inline-block mt-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: COLORS.dangerTint, color: COLORS.danger }}
                      >
                        -{pct}%
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Auto-Pay card: generates a real, one-time ABA KHQR code for the exact plan price and
                  auto-confirms the subscription once PayWay reports the payment as approved. */}
              <div className="rounded-2xl border p-4 mb-3" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.navy }}
                    >
                      <DollarSign size={13} color="#FFFFFF" strokeWidth={2.5} />
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: COLORS.muted }}>USD</span>
                  </div>
                  <p className="text-xl font-extrabold" style={{ color: COLORS.navy, ...latinFont }}>
                    ${selectedPlan.price}
                    <span className="text-[10px] font-semibold ml-1" style={{ color: COLORS.muted }}>
                      / {lang === 'KH' ? selectedPlan.labelKh : selectedPlan.labelEn}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-1.5 mb-3 justify-center">
                  <QrCode size={14} color={COLORS.navy} strokeWidth={2} />
                  <p className="text-[11px] font-bold" style={{ color: COLORS.navy }}>
                    {tr('ស្កេនទូទាត់ (ស្វ័យប្រវត្តិ)', 'Scan to Pay (Automatic)')}
                  </p>
                </div>

                {autoStatus === 'idle' && (
                  <button
                    onClick={handleGenerateAutoQr}
                    className="w-full py-3 rounded-xl font-bold text-white text-xs flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: COLORS.navy }}
                  >
                    <QrCode size={14} color="#FFFFFF" strokeWidth={2} />
                    {tr('បង្កើត QR ទូទាត់', 'Generate Payment QR')}
                  </button>
                )}

                {autoStatus === 'loading' && (
                  <div className="w-40 h-40 mx-auto rounded-xl border flex flex-col items-center justify-center gap-2" style={{ borderColor: COLORS.border }}>
                    <Loader2 size={24} color={COLORS.navy} strokeWidth={2} className="animate-spin" />
                    <p className="text-[10px]" style={{ color: COLORS.muted }}>{tr('កំពុងបង្កើត QR...', 'Generating QR...')}</p>
                  </div>
                )}

                {autoStatus === 'waiting' && autoQr && (
                  <>
                    <div className="flex justify-center mb-2">
                      <img
                        src={autoQr.qrImage}
                        alt="ABA KHQR Payment"
                        className="w-44 h-44 rounded-xl border bg-white object-contain p-1"
                        style={{ borderColor: COLORS.border }}
                      />
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <Loader2 size={12} color={COLORS.navy} strokeWidth={2} className="animate-spin" />
                      <p className="text-[10px] font-semibold" style={{ color: COLORS.navy }}>
                        {tr(`កំពុងរង់ចាំការទូទាត់... (${formatCountdown(secondsLeft)})`, `Waiting for payment... (${formatCountdown(secondsLeft)})`)}
                      </p>
                    </div>
                    {autoQr.abapayDeeplink && (
                      <a
                        href={autoQr.abapayDeeplink}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[11px] font-semibold"
                        style={{ borderColor: COLORS.border, color: COLORS.navy }}
                      >
                        <Smartphone size={13} color={COLORS.navy} strokeWidth={2} />
                        {tr('បើក App ABA Mobile', 'Open ABA Mobile App')}
                      </a>
                    )}
                  </>
                )}

                {autoStatus === 'expired' && (
                  <div className="text-center py-2">
                    <p className="text-[11px] mb-2" style={{ color: COLORS.danger }}>
                      {tr('QR បានផុតកំណត់ពេលហើយ', 'This QR code has expired')}
                    </p>
                    <button
                      onClick={handleGenerateAutoQr}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-white text-xs"
                      style={{ backgroundColor: COLORS.navy }}
                    >
                      <RefreshCw size={13} color="#FFFFFF" strokeWidth={2} />
                      {tr('បង្កើត QR ថ្មី', 'Generate New QR')}
                    </button>
                  </div>
                )}

                {autoStatus === 'error' && (
                  <div className="text-center py-2">
                    <p className="text-[11px] mb-2" style={{ color: COLORS.danger }}>{autoError}</p>
                    <button
                      onClick={handleGenerateAutoQr}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-white text-xs"
                      style={{ backgroundColor: COLORS.navy }}
                    >
                      <RefreshCw size={13} color="#FFFFFF" strokeWidth={2} />
                      {tr('ព្យាយាមម្តងទៀត', 'Try Again')}
                    </button>
                  </div>
                )}
              </div>

              {/* Disclosure toggle for the old manual-proof flow, kept as a fallback */}
              <button
                onClick={() => setShowManual((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-1.5 mb-3 text-[10px] font-medium underline"
                style={{ color: COLORS.muted }}
              >
                {showManual ? <ChevronUp size={12} color={COLORS.muted} /> : <ChevronDown size={12} color={COLORS.muted} />}
                {tr('មិនអាចស្កេនបាន? ផ្ទៀងផ្ទាត់ដោយដៃ', "Can't scan? Use manual verification")}
              </button>

              {showManual && (
              <div className="rounded-2xl border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}>
                {/* Currency + total, at the top of the payment section */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.navy }}
                    >
                      <DollarSign size={13} color="#FFFFFF" strokeWidth={2.5} />
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: COLORS.muted }}>USD</span>
                  </div>
                  <p className="text-xl font-extrabold" style={{ color: COLORS.navy, ...latinFont }}>
                    ${selectedPlan.price}
                    <span className="text-[10px] font-semibold ml-1" style={{ color: COLORS.muted }}>
                      / {lang === 'KH' ? selectedPlan.labelKh : selectedPlan.labelEn}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-1.5 mb-2 justify-center">
                  <QrCode size={14} color={COLORS.navy} strokeWidth={2} />
                  <p className="text-[11px] font-bold" style={{ color: COLORS.navy }}>
                    {tr('ស្កេនទូទាត់', 'Scan to Pay')}
                  </p>
                </div>
                <div className="flex justify-center mb-3">
                  {profile.subscription_qr_url ? (
                    <img
                      src={profile.subscription_qr_url}
                      alt="Payment QR"
                      className="w-40 h-40 rounded-xl border bg-white object-cover"
                      style={{ borderColor: COLORS.border }}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div
                      className="w-40 h-40 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center px-3"
                      style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}
                    >
                      <QrCode size={28} color={COLORS.muted} strokeWidth={1.5} />
                      <p className="text-[10px]" style={{ color: COLORS.muted }}>
                        {tr('QR មិនទាន់បានផ្ទុកឡើងទេ — ទាក់ទង Admin', 'QR not uploaded yet — contact admin')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Save QR / Upload proof, directly under the QR */}
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  <button
                    onClick={handleSaveQr}
                    disabled={!profile.subscription_qr_url}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[11px] font-semibold disabled:opacity-50"
                    style={{ borderColor: COLORS.border, color: COLORS.navy, backgroundColor: '#FFFFFF' }}
                  >
                    <Download size={13} color={COLORS.navy} strokeWidth={2} />
                    {tr('រក្សាទុក QR', 'Save QR')}
                  </button>
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*"
                    disabled={proofUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleProofUpload(file);
                    }}
                    className="hidden"
                  />
                  <button
                    onClick={() => proofInputRef.current?.click()}
                    disabled={proofUploading}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: proofUrl ? COLORS.success : COLORS.navy }}
                  >
                    {proofUploading ? (
                      tr('កំពុងផ្ទុក...', 'Uploading...')
                    ) : proofUrl ? (
                      <>
                        <CheckCircle2 size={13} color="#FFFFFF" strokeWidth={2} />
                        {tr('បានផ្ទៀងផ្ទាត់', 'Verified')}
                      </>
                    ) : (
                      <>
                        <Upload size={13} color="#FFFFFF" strokeWidth={2} />
                        {tr('ផ្ទុករូបភាពបញ្ជាក់', 'Upload Proof')}
                      </>
                    )}
                  </button>
                </div>

                {/* Small help link */}
                <button
                  onClick={onOpenTelegram}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium underline"
                  style={{ color: COLORS.muted }}
                >
                  <Send size={11} color={COLORS.muted} strokeWidth={2} />
                  {tr('ជំនួយ Telegram', 'Help: Telegram')}
                </button>

                {/* + payment details panel */}
                <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: COLORS.border, backgroundColor: '#FFFFFF' }}>
                  <button
                    onClick={() => (showDetails ? setShowDetails(false) : openDetails())}
                    className="w-full flex items-center justify-between px-3 py-2.5"
                  >
                    <span className="text-[11px] font-bold" style={{ color: COLORS.navy }}>
                      {tr('លម្អិតការទូទាត់', 'Payment details')}
                    </span>
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.navyTint }}
                    >
                      {showDetails ? (
                        <Minus size={14} color={COLORS.navy} strokeWidth={2.5} />
                      ) : (
                        <Plus size={14} color={COLORS.navy} strokeWidth={2.5} />
                      )}
                    </span>
                  </button>

                  {showDetails && (
                    <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <div className="pt-2.5">
                        <label className="text-[11px] font-semibold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                          <Calendar size={12} color={COLORS.navy} strokeWidth={2} />
                          {tr('ថ្ងៃទីបានទូទាត់', 'Payment date')}
                        </label>
                        <input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                          style={{ borderColor: COLORS.border, color: COLORS.navy }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                            <DollarSign size={12} color={COLORS.navy} strokeWidth={2} />
                            {tr('ចំនួនបានបង់', 'Amount paid')}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={amountPaid}
                            onChange={(e) => setAmountPaid(e.target.value)}
                            className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: COLORS.border, color: COLORS.navy, ...latinFont }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                            <Percent size={12} color={COLORS.navy} strokeWidth={2} />
                            {tr('បញ្ចុះតម្លៃ', 'Discount')}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                            className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: COLORS.border, color: COLORS.navy, ...latinFont }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                          <FileText size={12} color={COLORS.navy} strokeWidth={2} />
                          {tr('ចំណាំ', 'Description')}
                        </label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={2}
                          placeholder={tr('ចំណាំបន្ថែម (ស្រេចចិត្ត)', 'Optional note')}
                          className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none resize-none"
                          style={{ borderColor: COLORS.border, color: COLORS.navy }}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold flex items-center gap-1 mb-1" style={{ color: COLORS.navy }}>
                          <Hash size={12} color={COLORS.navy} strokeWidth={2} />
                          {tr('Transaction ID (ស្រេចចិត្ត)', 'Transaction ID (optional)')}
                        </label>
                        <input
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          placeholder={tr('ចម្លងពី App ABA ក្រោយបង់ប្រាក់', 'Copy from the ABA app after paying')}
                          className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                          style={{ borderColor: COLORS.border, color: COLORS.navy, ...latinFont }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                        <span style={{ color: COLORS.muted }}>{tr('សរុបត្រូវបង់', 'Total due')}</span>
                        <span className="font-extrabold" style={{ color: COLORS.navy, ...latinFont }}>
                          ${finalAmount.toFixed(2)}
                        </span>
                      </div>

                      {error && (
                        <p className="text-xs text-center" style={{ color: COLORS.danger }}>
                          {error}
                        </p>
                      )}

                      <button
                        onClick={handleConfirmPaid}
                        disabled={busy}
                        className="w-full py-2.5 rounded-lg font-bold text-white text-xs disabled:opacity-60"
                        style={{ backgroundColor: COLORS.success }}
                      >
                        {busy ? tr('កំពុងបញ្ជូន...', 'Sending...') : tr('ខ្ញុំបានទូទាត់រួច', "I've Paid")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <CheckCircle2 size={40} color={COLORS.success} strokeWidth={1.5} className="mx-auto" />
              <p className="text-sm font-bold mt-3" style={{ color: COLORS.navy }}>
                {autoStatus === 'confirmed'
                  ? tr('ការទូទាត់បានជោគជ័យ!', 'Payment confirmed!')
                  : tr('បានទទួលសំណើរបស់អ្នក', 'Request received')}
              </p>
              <p className="text-xs mt-1 px-4" style={{ color: COLORS.muted }}>
                {autoStatus === 'confirmed'
                  ? tr(
                      'PayWay បានបញ្ជាក់ការទូទាត់របស់អ្នកដោយស្វ័យប្រវត្តិ។ គម្រោងសមាជិកភាពរបស់អ្នកបានធ្វើឱ្យសកម្មភ្លាមៗ។',
                      'PayWay confirmed your payment automatically. Your subscription is active now.'
                    )
                  : tr(
                      'សូមរង់ចាំការផ្ទៀងផ្ទាត់ពី Admin (ជាធម្មតាក្នុងរយៈពេលពីរបីម៉ោង)។ ជូនដំណឹង Telegram ដើម្បីលឿនជាង។',
                      'Please wait for admin verification (usually within a few hours). Notify via Telegram for faster confirmation.'
                    )}
              </p>
              {autoStatus !== 'confirmed' && (
              <button
                onClick={onOpenTelegram}
                className="mt-4 mr-2 px-4 py-2 rounded-lg font-bold text-xs border inline-flex items-center gap-1.5"
                style={{ borderColor: COLORS.border, color: COLORS.navy }}
              >
                <Send size={13} color={COLORS.navy} strokeWidth={2} />
                {tr('ជូនដំណឹង Telegram', 'Notify on Telegram')}
              </button>
              )}
              <button
                onClick={onClose}
                className="mt-4 px-5 py-2 rounded-lg font-bold text-xs text-white"
                style={{ backgroundColor: COLORS.navy }}
              >
                {tr('បិទ', 'Close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
