import { useEffect, useState } from 'react';
import {
  Receipt,
  Wallet,
  Package,
  BarChart3,
  Download,
  Share2,
  Plus,
  CheckCircle2,
  Smartphone,
  Apple,
  ChevronRight,
  X,
} from 'lucide-react';
import { COLORS, khmerFont, latinFont } from '../lib/theme';
import { IconBadge } from './IconBadge';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Props {
  lang: 'KH' | 'EN';
  onLangToggle: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onDismiss: () => void;
  onInstalled: () => void;
}

const FEATURES = [
  {
    icon: Receipt,
    titleKh: 'វិក្កយបត្រ',
    titleEn: 'Invoices',
    descKh: 'បង្កើត និងចែករំលែកវិក្កយបត្របានយ៉ាងងាយ',
    descEn: 'Create and share invoices effortlessly',
    tint: 'invoice' as const,
    color: COLORS.invoice,
    tintBg: COLORS.invoiceTint,
  },
  {
    icon: Wallet,
    titleKh: 'ហិរញ្ញវត្ថុ',
    titleEn: 'Finance',
    descKh: 'តាមដានចំណូល និងចំណាយតាមរយៈប្រាក់ USD/KHR',
    descEn: 'Track income & expenses in USD/KHR',
    tint: 'success' as const,
    color: COLORS.success,
    tintBg: COLORS.successTint,
  },
  {
    icon: Package,
    titleKh: 'ស្តុកទំនិញ',
    titleEn: 'Stock',
    descKh: 'គ្រប់គ្រងស្តុកផលិតផលបានត្រឹមត្រូវ',
    descEn: 'Manage product stock accurately',
    tint: 'stock' as const,
    color: COLORS.stock,
    tintBg: COLORS.stockTint,
  },
  {
    icon: BarChart3,
    titleKh: 'របាយការណ៍',
    titleEn: 'Reports',
    descKh: 'មើលស្ថិតិ និងទិន្នន័យអាជីវកម្ម',
    descEn: 'View business statistics and data',
    tint: 'navy' as const,
    color: COLORS.navy,
    tintBg: COLORS.navyTint,
  },
];

export default function InstallScreen({ lang, onLangToggle, onSignIn, onSignUp, onDismiss, onInstalled }: Props) {
  const tr = (kh: string, en: string) => (lang === 'KH' ? kh : en);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

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

  // Auto-rotate feature slides
  useEffect(() => {
    const t = setInterval(() => setActiveSlide((s) => (s + 1) % FEATURES.length), 3500);
    return () => clearInterval(t);
  }, []);

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  const handleInstall = async () => {
    if (installEvent) {
      setInstalling(true);
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstalling(false);
      setInstallEvent(null);
      if (choice.outcome === 'accepted') {
        onInstalled();
      }
      return;
    }
    if (isIOS) {
      setShowIOSHelp(true);
    }
  };

  const canInstall = !isStandalone && (installEvent || isIOS);

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${COLORS.navyGradientStart} 0%, ${COLORS.navyGradientEnd} 60%, #0F3358 100%)`,
        ...khmerFont,
      }}
    >
      {/* Decorative background blobs */}
      <div
        className="absolute rounded-full"
        style={{ width: 320, height: 320, top: -120, right: -100, background: 'rgba(255,255,255,0.05)' }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: 240, height: 240, bottom: -80, left: -60, background: 'rgba(255,255,255,0.04)' }}
      />

      {/* Top bar: language + skip */}
      <div className="flex justify-between items-center px-4 pt-4 relative z-10">
        <button
          onClick={onLangToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}
        >
          {lang === 'KH' ? 'ខ្មែរ | EN' : 'EN | ខ្មែរ'}
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}
        >
          {tr('រំលង', 'Skip')}
          <X size={14} color="#FFFFFF" strokeWidth={2} />
        </button>
      </div>

      {/* Hero banner */}
      <div className="flex flex-col items-center px-6 pt-6 pb-4 relative z-10">
        <div
          className="rounded-3xl p-5 flex flex-col items-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: COLORS.gold, boxShadow: `0 8px 24px ${COLORS.gold}66` }}
          >
            <Receipt size={40} color="#FFFFFF" strokeWidth={2} />
          </div>
          <span className="text-2xl font-extrabold text-white tracking-wide" style={latinFont}>
            KH INVOICE
          </span>
          <p className="text-xs text-white/80 text-center mt-1.5 leading-relaxed max-w-xs">
            {tr(
              'វិក្កយបត្រ និងគ្រប់គ្រងទិន្នន័យអាជីវកម្មគ្រប់ប្រភេទ',
              'Invoices & Business Data Management'
            )}
          </p>
        </div>
      </div>

      {/* Feature carousel */}
      <div className="flex-1 px-5 relative z-10 flex flex-col justify-center">
        <div
          className="rounded-3xl p-5 min-h-[220px] flex flex-col justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}
        >
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-4 transition-all duration-500"
              style={{
                opacity: activeSlide === i ? 1 : 0,
                transform: activeSlide === i ? 'translateX(0)' : 'translateX(20px)',
                position: activeSlide === i ? 'relative' : 'absolute',
                pointerEvents: activeSlide === i ? 'auto' : 'none',
              }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: f.tintBg }}
              >
                <f.icon size={32} color={f.color} strokeWidth={2} />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold" style={{ color: COLORS.navy }}>
                  {lang === 'KH' ? f.titleKh : f.titleEn}
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: COLORS.muted }}>
                  {lang === 'KH' ? f.descKh : f.descEn}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Slide dots */}
        <div className="flex justify-center gap-2 mt-4">
          {FEATURES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width: activeSlide === i ? 24 : 8,
                height: 8,
                backgroundColor: activeSlide === i ? COLORS.gold : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>

        {/* Caption */}
        <p className="text-center text-sm text-white/90 mt-5 leading-relaxed px-2">
          {tr(
            'ដំឡើងជា App ដើម្បីប្រើប្រាស់លឿន និងដំណើរការក្រៅបណ្តាញ',
            'Install as an App for faster access and offline use'
          )}
        </p>
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-6 pt-2 relative z-10 space-y-2.5">
        {canInstall && (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: COLORS.gold, boxShadow: `0 4px 14px ${COLORS.gold}55` }}
          >
            <Download size={18} color="#FFFFFF" strokeWidth={2.5} />
            {installing
              ? tr('កំពុងដំឡើង...', 'Installing...')
              : isIOS
              ? tr('ដំឡើងលើ iOS', 'Install on iOS')
              : tr('ដំឡើងលើ Android', 'Install on Android')}
          </button>
        )}

        <button
          onClick={onSignUp}
          className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: '#FFFFFF', color: COLORS.navy, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}
        >
          {tr('ចុះឈ្មោះថ្មី', 'Create New Account')}
          <ChevronRight size={18} color={COLORS.navy} strokeWidth={2} />
        </button>

        <button
          onClick={onSignIn}
          className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.3)' }}
        >
          {tr('មានគណនីរួចហើយ? ចូលប្រើ', 'Already have an account? Sign In')}
        </button>
      </div>

      {/* iOS install help modal */}
      {showIOSHelp && (
        <div
          className="fixed inset-0 flex items-end z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowIOSHelp(false)}
        >
          <div
            className="w-full bg-white rounded-t-3xl p-6"
            style={{ boxShadow: '0 -4px 10px rgba(0,0,0,0.15)' }}
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
    </div>
  );
}
