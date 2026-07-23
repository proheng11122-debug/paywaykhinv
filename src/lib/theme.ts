import type { CSSProperties } from 'react';

/**
 * Shared design tokens for the whole app.
 * Import from here instead of redefining COLORS / fonts in each component —
 * keeps every screen visually consistent and avoids drift when the theme changes.
 */

export const COLORS = {
  navy: '#0C447C',
  navyGradientStart: '#0C447C',
  navyGradientEnd: '#185FA5',
  navyTint: '#E6F1FB',
  gold: '#185FA5',
  goldDark: '#124A7D',
  goldTint: '#E6F1FB',
  bgApp: '#F7FAFD',
  border: '#E1E9F0',
  success: '#1F9D6B',
  successTint: '#E8F6F0',
  danger: '#E5533D',
  dangerTint: '#FDEDE9',
  muted: '#6B7B8A',
  stock: '#0F6E56',
  stockTint: '#E1F5EE',
  invoice: '#2E86C1',
  invoiceTint: '#EAF3FB',
  account: '#E0A93E',
  accountTint: '#FBF1E0',
} as const;

export const khmerFont: CSSProperties = { fontFamily: "'Battambang', sans-serif" };
export const latinFont: CSSProperties = { fontFamily: "'Inter', sans-serif" };

// Standard icon sizes used across IconBadge instances
export const INLINE = 20 as const;
export const ACTION = 28 as const;

export const DEFAULT_UNITS = ['ដុំ', 'កែវ', 'ដប', 'កញ្ចប់', 'គីឡូ', 'សេវា'];
