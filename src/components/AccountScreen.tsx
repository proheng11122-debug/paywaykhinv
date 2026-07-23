import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  User,
  Phone,
  QrCode,
  Upload,
  LogOut,
  Languages,
  Clock,
  Lock,
  CheckCircle2,
  Building2,
  CreditCard,
  ChevronRight,
  Download,
  Smartphone,
  Apple,
  Share2,
  Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { IconBadge } from './IconBadge';
import { COLORS, latinFont, INLINE, ACTION } from '../lib/theme';


interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Profile {
  id: string;
  business_name: string | null;
  username: string | null;
  phone: string | null;
  is_locked: boolean | null;
  trial_started_at: string | null;
  qr_code_url: string | null;
  avatar_url: string | null;
  subscription_qr_url: string | null;
}

interface Props {
  lang: 'KH' | 'EN';
  profile: Profile;
  onBack: () => void;
  onLogout: () => void;
  onLangToggle: () => void;
  onProfileUpdated: (p: Profile) => void;
  onOpenSubscription: () => void;
}

const inputStyle: CSSProperties = { borderColor: COLORS.border, backgroundColor: '#FFFFFF', color: COLORS.navy };

function getTrialDaysRemaining(trialStartedAt: string | null): number {
  const TRIAL_DAYS = 30;
  if (!trialStartedAt) return TRIAL_DAYS;
  const start = new Date(trialStartedAt).getTime();
  const now = Date.now();
  const elapsedDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - elapsedDays);
}

function InstallAppCard({ lang }: { lang: 'KH' | 'EN' }) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  const handleInstall = async () => {
    if (installEvent) {
      setInstalling(true);
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstalling(false);
      setInstallEvent(null);
      return;
    }
    if (isIOS) setShowIOSHelp(true);
  };

  if (isStandalone) return null;
  if (!installEvent && !isIOS) return null;

  return (
    <>
      <div
        className="rounded-2xl p-4 flex items-center justify-between"
        style={{ backgroundColor: COLORS.navyTint, borderLeft: `4px solid ${COLORS.navy}` }}
      >
        <div className="flex items-center gap-2">
          <IconBadge icon={Download} size={INLINE} tint="navy" shape="rounded" />
          <div className="text-left">
            <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
              {tr('ដំឡើងជា App', 'Install App')}
            </p>
            <p className="text-[11px]" style={{ color: COLORS.muted }}>
              {tr('ប្រើក្រៅបណ្តាញ និងលឿនជាង', 'Offline & faster access')}
            </p>
          </div>
        </div>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-white text-xs disabled:opacity-60"
          style={{ backgroundColor: COLORS.navy }}
        >
          {isIOS ? <Apple size={14} color="#FFFFFF" strokeWidth={2} /> : <Smartphone size={14} color="#FFFFFF" strokeWidth={2} />}
          {installing
            ? tr('កំពុងដំឡើង...', 'Installing...')
            : isIOS
            ? tr('ដំឡើង', 'Install')
            : tr('ដំឡើង', 'Install')}
        </button>
      </div>

      {showIOSHelp && (
        <div
          className="fixed inset-0 flex items-end z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowIOSHelp(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <Apple size={22} color={COLORS.navy} strokeWidth={2} />
              <h3 className="text-base font-bold" style={{ color: COLORS.navy }}>
                {tr('ដំឡើង KH Invoice លើ iOS', 'Install KH Invoice on iOS')}
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.goldTint }}>
                  <Share2 size={16} color={COLORS.goldDark} strokeWidth={2} />
                </div>
                <p className="text-sm" style={{ color: COLORS.navy }}>
                  {tr('១. ចុចរូប Share នៅខាងក្រោម Safari', '1. Tap the Share icon at the bottom of Safari')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.goldTint }}>
                  <Plus size={16} color={COLORS.goldDark} strokeWidth={2} />
                </div>
                <p className="text-sm" style={{ color: COLORS.navy }}>
                  {tr('២. ជ្រើស "Add to Home Screen"', '2. Select "Add to Home Screen"')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.goldTint }}>
                  <CheckCircle2 size={16} color={COLORS.goldDark} strokeWidth={2} />
                </div>
                <p className="text-sm" style={{ color: COLORS.navy }}>
                  {tr('៣. ចុច "Add" — រួចរាល់!', '3. Tap "Add" — done!')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowIOSHelp(false)}
              className="w-full py-3 rounded-xl font-bold text-white text-sm mt-5"
              style={{ backgroundColor: COLORS.navy }}
            >
              {tr('យល់ព្រម', 'Got it')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function AccountScreen({ lang, profile, onBack, onLogout, onLangToggle, onProfileUpdated, onOpenSubscription }: Props) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [bizName, setBizName] = useState(profile.business_name || '');
  const [username, setUsername] = useState(profile.username || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  const [uploadingQr, setUploadingQr] = useState(false);
  const [qrError, setQrError] = useState('');

  const [uploadingSubQr, setUploadingSubQr] = useState(false);
  const [subQrError, setSubQrError] = useState('');
  const subQrInputRef = useRef<HTMLInputElement>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);

  const trialDaysRemaining = getTrialDaysRemaining(profile.trial_started_at);

  const handleAvatarUpload = async (file: File) => {
    setAvatarError('');
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop() || 'png';
    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingAvatar(false);
      setAvatarError(uploadError.message);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from('qr-codes').getPublicUrl(path);
    const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', profile.id)
      .select()
      .maybeSingle();
    setUploadingAvatar(false);
    if (error) {
      setAvatarError(error.message);
      return;
    }
    if (data) onProfileUpdated(data as Profile);
  };


  const handleSaveProfile = async () => {
    setProfileError('');
    setProfileSaved(false);
    if (!bizName.trim() || !username.trim()) {
      setProfileError(tr('សូមបញ្ចូលព័ត៌មានឱ្យគ្រប់', 'Please fill in all fields'));
      return;
    }
    setSavingProfile(true);
    const { data, error } = await supabase
      .from('profiles')
      .update({ business_name: bizName.trim(), username: username.trim() })
      .eq('id', profile.id)
      .select()
      .maybeSingle();
    setSavingProfile(false);
    if (error) {
      setProfileError(error.message);
      return;
    }
    if (data) onProfileUpdated(data as Profile);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleQrUpload = async (file: File) => {
    setQrError('');
    setUploadingQr(true);
    const ext = file.name.split('.').pop() || 'png';
    const path = `${profile.id}/qr.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingQr(false);
      setQrError(uploadError.message);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from('qr-codes').getPublicUrl(path);
    const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    const { data, error } = await supabase
      .from('profiles')
      .update({ qr_code_url: url })
      .eq('id', profile.id)
      .select()
      .maybeSingle();
    setUploadingQr(false);
    if (error) {
      setQrError(error.message);
      return;
    }
    if (data) onProfileUpdated(data as Profile);
  };

  const handleSubQrUpload = async (file: File) => {
    setSubQrError('');
    setUploadingSubQr(true);
    const ext = file.name.split('.').pop() || 'png';
    const path = `${profile.id}/subscription-qr.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setUploadingSubQr(false);
      setSubQrError(uploadError.message);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from('qr-codes').getPublicUrl(path);
    const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    const { data, error } = await supabase
      .from('profiles')
      .update({ subscription_qr_url: url })
      .eq('id', profile.id)
      .select()
      .maybeSingle();
    setUploadingSubQr(false);
    if (error) {
      setSubQrError(error.message);
      return;
    }
    if (data) onProfileUpdated(data as Profile);
  };

  const handleChangePassword = async () => {
    setPwError('');
    setPwSaved(false);
    if (!newPassword || newPassword.length < 6) {
      setPwError(tr('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួ', 'Password must be at least 6 characters'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(tr('ពាក្យសម្ងាត់មិនត្រូវគ្នាទេ', 'Passwords do not match'));
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwBusy(false);
    if (error) {
      setPwError(error.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.bgApp }}>
      {/* Header */}
      <div
        className="px-4 pt-4 pb-4 flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, ${COLORS.navy} 0%, #185FA5 100%)` }}
      >
        <button
          onClick={onBack}
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' }}
        >
          <ArrowLeft size={INLINE} color="#FFFFFF" strokeWidth={2} />
        </button>
        <div>
          <p className="text-white font-bold text-base">{tr('គណនី', 'Account')}</p>
          <p className="text-white/70 text-xs">
            {tr('ព័ត៌មានអាជីវកម្ម និងការកំណត់', 'Business info and settings')}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 pb-24 -mt-2 space-y-3.5">
        {/* Profile photo */}
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}>
          <div className="flex items-center gap-2 mb-3">
            <IconBadge icon={User} size={INLINE} tint="account" shape="rounded" />
            <p className="text-xs font-bold" style={{ color: COLORS.muted }}>
              {tr('រូបភាពប្រូហ្វាល់', 'Profile Photo')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="w-20 h-20 rounded-full border flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={28} color={COLORS.muted} strokeWidth={1.5} />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                }}
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border font-bold text-xs disabled:opacity-60"
                style={{ borderColor: COLORS.border, color: COLORS.navy }}
              >
                <Upload size={14} color={COLORS.navy} strokeWidth={2} />
                {uploadingAvatar
                  ? tr('កំពុងផ្ទុកឡើង...', 'Uploading...')
                  : profile.avatar_url
                  ? tr('ប្តូររូបភាព', 'Change Photo')
                  : tr('ផ្ទុករូបភាពឡើង', 'Upload Photo')}
              </button>
              {avatarError && (
                <p className="text-[11px] mt-1.5" style={{ color: COLORS.danger }}>
                  {avatarError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Trial status */}
        <div
          className="p-4 rounded-2xl flex items-center gap-3"
          style={{ backgroundColor: trialDaysRemaining <= 7 ? COLORS.dangerTint : COLORS.accountTint }}
        >
          <IconBadge icon={Clock} size={INLINE} tint={trialDaysRemaining <= 7 ? 'danger' : 'account'} shape="rounded" />
          <div>
            <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
              {trialDaysRemaining > 0
                ? tr(`នៅសល់ ${trialDaysRemaining} ថ្ងៃទៀត`, `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left`)
                : tr('ការសាកល្បងបានផុតកំណត់', 'Trial expired')}
            </p>
            <p className="text-[11px]" style={{ color: COLORS.muted }}>
              {tr('រយៈពេលសាកល្បងឥតគិតថ្លៃ', 'Free trial period')}
            </p>
          </div>
        </div>

        {/* Install app */}
        <InstallAppCard lang={lang} />

        {/* Subscription */}
        <button
          onClick={onOpenSubscription}
          className="w-full bg-white rounded-2xl p-4 flex items-center justify-between"
          style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}
        >
          <div className="flex items-center gap-2">
            <IconBadge icon={CreditCard} size={INLINE} tint="account" shape="rounded" />
            <div className="text-left">
              <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
                {tr('គម្រោងសមាជិកភាព', 'Subscription')}
              </p>
              <p className="text-[11px]" style={{ color: COLORS.muted }}>
                {trialDaysRemaining > 0
                  ? tr('មើល និងដំឡើងគម្រោង', 'View and upgrade your plan')
                  : tr('សូមជាវដើម្បីបន្តប្រើប្រាស់', 'Subscribe to keep using the app')}
              </p>
            </div>
          </div>
          <ChevronRight size={18} color={COLORS.muted} strokeWidth={2} />
        </button>

        {/* Business profile */}
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}>
          <div className="flex items-center gap-2 mb-3">
            <IconBadge icon={Building2} size={INLINE} tint="account" shape="rounded" />
            <p className="text-xs font-bold" style={{ color: COLORS.muted }}>
              {tr('ព័ត៌មានអាជីវកម្ម', 'Business Info')}
            </p>
          </div>

          <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
            {tr('ឈ្មោះអាជីវកម្ម', 'Business Name')}
          </label>
          <input
            value={bizName}
            onChange={(e) => setBizName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
            style={inputStyle}
          />

          <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
            {tr('ឈ្មោះអ្នកប្រើប្រាស់', 'Username')}
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
            style={inputStyle}
          />

          <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.navy }}>
            {tr('លេខទូរស័ព្ទ', 'Phone Number')}
          </label>
          <div
            className="flex items-center gap-2 w-full rounded-lg border px-3 py-2.5 text-sm mb-3"
            style={{ borderColor: COLORS.border, backgroundColor: '#F5F4F1', color: COLORS.muted }}
          >
            <Phone size={14} color={COLORS.muted} strokeWidth={2} />
            <span style={latinFont}>{profile.phone || '-'}</span>
          </div>

          {profileError && (
            <p className="text-xs mb-2" style={{ color: COLORS.danger }}>
              {profileError}
            </p>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-white text-sm disabled:opacity-60"
            style={{ backgroundColor: profileSaved ? COLORS.success : COLORS.gold }}
          >
            {profileSaved ? <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2} /> : null}
            {savingProfile
              ? tr('កំពុងរក្សាទុក...', 'Saving...')
              : profileSaved
              ? tr('បានរក្សាទុក', 'Saved')
              : tr('រក្សាទុក', 'Save Changes')}
          </button>
        </div>

        {/* QR code for payments */}
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}>
          <div className="flex items-center gap-2 mb-3">
            <IconBadge icon={QrCode} size={INLINE} tint="account" shape="rounded" />
            <p className="text-xs font-bold" style={{ color: COLORS.muted }}>
              {tr('QR ទូទាត់ប្រាក់', 'Payment QR Code')}
            </p>
          </div>
          <p className="text-[11px] mb-3" style={{ color: COLORS.muted }}>
            {tr(
              'រូបភាព QR នេះនឹងបង្ហាញនៅលើវិក្កយបត្ររបស់អ្នក ដើម្បីអោយអតិថិជនស្កេនទូទាត់ប្រាក់',
              'This QR image can be shown on your invoices so customers can scan to pay'
            )}
          </p>
          <div className="flex items-center gap-3">
            <div
              className="w-20 h-20 rounded-xl border flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}
            >
              {profile.qr_code_url ? (
                <img src={profile.qr_code_url} alt="QR" className="w-full h-full object-cover" />
              ) : (
                <QrCode size={28} color={COLORS.muted} strokeWidth={1.5} />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleQrUpload(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingQr}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border font-bold text-xs disabled:opacity-60"
                style={{ borderColor: COLORS.border, color: COLORS.navy }}
              >
                <Upload size={14} color={COLORS.navy} strokeWidth={2} />
                {uploadingQr
                  ? tr('កំពុងផ្ទុកឡើង...', 'Uploading...')
                  : profile.qr_code_url
                  ? tr('ប្តូររូបភាព', 'Change Image')
                  : tr('ផ្ទុករូបភាពឡើង', 'Upload Image')}
              </button>
              {qrError && (
                <p className="text-[11px] mt-1.5" style={{ color: COLORS.danger }}>
                  {qrError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* QR code for subscription payments (admin) */}
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}>
          <div className="flex items-center gap-2 mb-3">
            <IconBadge icon={QrCode} size={INLINE} tint="account" shape="rounded" />
            <p className="text-xs font-bold" style={{ color: COLORS.muted }}>
              {tr('QR ទូទាត់សមាជិកភាព', 'Subscription Payment QR')}
            </p>
          </div>
          <p className="text-[11px] mb-3" style={{ color: COLORS.muted }}>
            {tr(
              'រូបភាព QR នេះនឹងបង្ហាញនៅក្នុងផ្ទាំង "គម្រោងសមាជិកភាព" ដើម្បីអោយអ្នកប្រើប្រាស់ស្កេនទូទាត់',
              'This QR image is shown in the "Subscription Plans" screen so users can scan to pay'
            )}
          </p>
          <div className="flex items-center gap-3">
            <div
              className="w-20 h-20 rounded-xl border flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgApp }}
            >
              {profile.subscription_qr_url ? (
                <img src={profile.subscription_qr_url} alt="Subscription QR" className="w-full h-full object-cover" />
              ) : (
                <QrCode size={28} color={COLORS.muted} strokeWidth={1.5} />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={subQrInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSubQrUpload(file);
                }}
              />
              <button
                onClick={() => subQrInputRef.current?.click()}
                disabled={uploadingSubQr}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border font-bold text-xs disabled:opacity-60"
                style={{ borderColor: COLORS.border, color: COLORS.navy }}
              >
                <Upload size={14} color={COLORS.navy} strokeWidth={2} />
                {uploadingSubQr
                  ? tr('កំពុងផ្ទុកឡើង...', 'Uploading...')
                  : profile.subscription_qr_url
                  ? tr('ប្តូររូបភាព', 'Change Image')
                  : tr('ផ្ទុករូបភាពឡើង', 'Upload Image')}
              </button>
              {subQrError && (
                <p className="text-[11px] mt-1.5" style={{ color: COLORS.danger }}>
                  {subQrError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-white rounded-2xl p-4 flex items-center justify-between" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}>
          <div className="flex items-center gap-2">
            <IconBadge icon={Languages} size={INLINE} tint="navy" shape="rounded" />
            <p className="text-xs font-bold" style={{ color: COLORS.navy }}>
              {tr('ភាសា', 'Language')}
            </p>
          </div>
          <button
            onClick={onLangToggle}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: COLORS.navy }}
          >
            {lang === 'KH' ? 'ខ្មែរ' : 'EN'}
          </button>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 3px rgba(12,68,124,0.08), 0 4px 12px rgba(12,68,124,0.06)', borderLeft: `4px solid ${COLORS.account}` }}>
          <div className="flex items-center gap-2 mb-3">
            <IconBadge icon={Lock} size={INLINE} tint="navy" shape="rounded" />
            <p className="text-xs font-bold" style={{ color: COLORS.muted }}>
              {tr('ប្តូរពាក្យសម្ងាត់', 'Change Password')}
            </p>
          </div>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={tr('ពាក្យសម្ងាត់ថ្មី', 'New password')}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-2"
            style={inputStyle}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={tr('បញ្ជាក់ពាក្យសម្ងាត់', 'Confirm password')}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none mb-3"
            style={inputStyle}
          />
          {pwError && (
            <p className="text-xs mb-2" style={{ color: COLORS.danger }}>
              {pwError}
            </p>
          )}
          <button
            onClick={handleChangePassword}
            disabled={pwBusy}
            className="w-full py-3 rounded-xl border font-bold text-sm disabled:opacity-60"
            style={{ borderColor: COLORS.border, color: pwSaved ? COLORS.success : COLORS.navy }}
          >
            {pwBusy
              ? tr('កំពុងធ្វើបច្ចុប្បន្នភាព...', 'Updating...')
              : pwSaved
              ? tr('បានប្តូររួច', 'Updated')
              : tr('ប្តូរពាក្យសម្ងាត់', 'Update Password')}
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm border"
          style={{ borderColor: COLORS.dangerTint, backgroundColor: COLORS.dangerTint, color: COLORS.danger }}
        >
          <LogOut size={16} color={COLORS.danger} strokeWidth={2} />
          {tr('ចាកចេញ', 'Log Out')}
        </button>
      </div>
    </div>
  );
}
