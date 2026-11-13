import { Platform } from 'react-native';
import { palette } from '@/lib/darts';

/* Svetlý / tmavý režim. Voľba sa ukladá v telefóne; po zmene sa appka znova
 * načíta, aby sa nové farby prejavili všade (aj tam, kde sa čítajú raz). */

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'dartmate:theme';

export function getThemePref(): ThemePref {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    }
  } catch {
    // bez úložiska = svetlý
  }
  return 'light';
}
export function resolvedTheme(pref: ThemePref = getThemePref()): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}
export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // nič
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
}

/** Farby tmavého režimu (písmo svetlé, plochy tmavé; výplne „navy“ ostávajú). */
const DARK: Partial<typeof palette> = {
  ink: '#E6EAF2',
  paper: '#121927',
  surface: '#1C2536',
  muted: '#A3ADBF',
  line: '#2C374B',
  danger: '#FF7A86',
  success: '#5FD38D',
};

/** Spustí sa raz pri štarte appky (pred vykreslením). */
export function applyTheme(): 'light' | 'dark' {
  const t = resolvedTheme();
  if (t === 'dark') Object.assign(palette, DARK);
  if (Platform.OS === 'web' && typeof document !== 'undefined')
    document.documentElement.style.colorScheme = t;
  return t;
}
