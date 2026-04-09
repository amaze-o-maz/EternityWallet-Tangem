import { create } from 'zustand';

export type ThemeKey = 'shib' | 'midnight' | 'emerald' | 'sakura' | 'royal' | 'amoled';

export interface ThemeDef {
  key: ThemeKey;
  name: string;
  accent: string;
  accentHover: string;
  secondary: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  glow: string;
  glowStrong: string;
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  shib: {
    key: 'shib',
    name: 'Shib Orange',
    accent: '#FF6900',
    accentHover: '#FF8C00',
    secondary: '#FFB800',
    bg: '#0D0D0D',
    surface: '#1A1A1A',
    surfaceAlt: '#222222',
    border: '#2E2E2E',
    glow: 'rgba(255, 105, 0, 0.15)',
    glowStrong: 'rgba(255, 105, 0, 0.35)',
  },
  midnight: {
    key: 'midnight',
    name: 'Midnight Blue',
    accent: '#3B82F6',
    accentHover: '#60A5FA',
    secondary: '#93C5FD',
    bg: '#080C18',
    surface: '#111827',
    surfaceAlt: '#1E293B',
    border: '#1E3A5F',
    glow: 'rgba(59, 130, 246, 0.15)',
    glowStrong: 'rgba(59, 130, 246, 0.35)',
  },
  emerald: {
    key: 'emerald',
    name: 'Emerald',
    accent: '#10B981',
    accentHover: '#34D399',
    secondary: '#6EE7B7',
    bg: '#080F0C',
    surface: '#111C17',
    surfaceAlt: '#1A2E25',
    border: '#1E3A2F',
    glow: 'rgba(16, 185, 129, 0.15)',
    glowStrong: 'rgba(16, 185, 129, 0.35)',
  },
  sakura: {
    key: 'sakura',
    name: 'Sakura',
    accent: '#F472B6',
    accentHover: '#F9A8D4',
    secondary: '#FBCFE8',
    bg: '#0F080C',
    surface: '#1C1118',
    surfaceAlt: '#2E1A25',
    border: '#3A1E30',
    glow: 'rgba(244, 114, 182, 0.15)',
    glowStrong: 'rgba(244, 114, 182, 0.35)',
  },
  royal: {
    key: 'royal',
    name: 'Royal Purple',
    accent: '#8B5CF6',
    accentHover: '#A78BFA',
    secondary: '#C4B5FD',
    bg: '#0A0814',
    surface: '#15112B',
    surfaceAlt: '#211C3A',
    border: '#2E2650',
    glow: 'rgba(139, 92, 246, 0.15)',
    glowStrong: 'rgba(139, 92, 246, 0.35)',
  },
  amoled: {
    key: 'amoled',
    name: 'AMOLED Black',
    accent: '#E5E5E5',
    accentHover: '#FFFFFF',
    secondary: '#A3A3A3',
    bg: '#000000',
    surface: '#0A0A0A',
    surfaceAlt: '#141414',
    border: '#1A1A1A',
    glow: 'rgba(255, 255, 255, 0.08)',
    glowStrong: 'rgba(255, 255, 255, 0.18)',
  },
};

const STORAGE_KEY = 'shibwallet_theme';

interface ThemeState {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem(STORAGE_KEY) as ThemeKey) || 'shib',
  setTheme: (t) => {
    localStorage.setItem(STORAGE_KEY, t);
    set({ theme: t });
  },
}));

/** Apply CSS variables and data-theme attribute to <html> */
export function applyTheme(key: ThemeKey) {
  const t = THEMES[key];
  const root = document.documentElement;

  root.setAttribute('data-theme', key);
  root.style.setProperty('--shib-bg', t.bg);
  root.style.setProperty('--shib-surface', t.surface);
  root.style.setProperty('--shib-surface-alt', t.surfaceAlt);
  root.style.setProperty('--shib-orange', t.accent);
  root.style.setProperty('--shib-orange-hover', t.accentHover);
  root.style.setProperty('--shib-amber', t.secondary);
  root.style.setProperty('--shib-border', t.border);
  root.style.setProperty('--shib-gradient-start', t.accent);
  root.style.setProperty('--shib-gradient-end', t.secondary);
  root.style.setProperty('--shib-glow', t.glow);
  root.style.setProperty('--shib-glow-strong', t.glowStrong);

  // Update <meta name="theme-color"> for mobile browsers
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = t.bg;
}
