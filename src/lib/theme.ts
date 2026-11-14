import { useSyncExternalStore } from 'react';

/*
 * Light / dark theme. Three states: the stored choice ("light" | "dark") or
 * no choice at all, which follows the system. The class lives on <html> so
 * the token overrides in index.css apply before React renders (index.html
 * also sets it inline to avoid a flash of the wrong theme).
 */
export type ThemeChoice = 'light' | 'dark';
const STORAGE_KEY = 'waraqpro.theme.v1';
const listeners = new Set<() => void>();

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function stored(): ThemeChoice | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

function applyToDocument() {
  const dark = stored() === 'dark' || (stored() === null && systemDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function getTheme(): ThemeChoice {
  return stored() ?? (systemDark() ? 'dark' : 'light');
}

export function setTheme(choice: ThemeChoice | null) {
  try {
    if (choice === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  applyToDocument();
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystem = () => {
    if (!stored()) {
      applyToDocument();
      listener();
    }
  };
  media.addEventListener('change', onSystem);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystem);
  };
}

/** Re-renders the calling component when the theme changes. */
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, getTheme, () => 'light' as ThemeChoice);
}
