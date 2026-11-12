import { useSyncExternalStore } from 'react';
import { ar } from './ar';

/*
 * Two languages: Arabic (default, right-to-left) and English.
 *
 * English text is the lookup key, so `t('Sign in')` returns the Arabic string
 * when Arabic is active and the text itself otherwise. `{0}`, `{1}` are
 * placeholders filled from the optional second argument.
 */
export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'waraqpro.lang.v1';
const listeners = new Set<() => void>();

function readStored(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

let lang: Lang = typeof window === 'undefined' ? 'ar' : readStored();

function applyToDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
applyToDocument();

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  applyToDocument();
  listeners.forEach((listener) => listener());
}

export function toggleLang() {
  setLang(lang === 'ar' ? 'en' : 'ar');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the calling component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'ar' as Lang);
}

// Messages that arrive with values already filled in (mostly from the API).
const PATTERNS: [RegExp, string][] = [
  [/^Keep this under (\d+) characters\.$/, 'يجب ألا يتجاوز النص {1} حرفًا.'],
  [/^Quantities must be between 1 and (\d+)\.$/, 'يجب أن تكون الكمية بين 1 و{1}.'],
  [/^(.+): the minimum order quantity is (\d+)\.$/, '{1}: الحد الأدنى للطلب هو {2}.'],
  [/^(.+): the quantity cannot be more than (\d+)\.$/, '{1}: لا يمكن أن تزيد الكمية على {2}.'],
  [
    /^The amount is more than the remaining balance of SAR ([\d.,]+)\.$/,
    'المبلغ أكبر من الرصيد المتبقي وهو {1} ر.س.',
  ],
];

export function t(text: string | null | undefined, args?: (string | number | null | undefined)[]): string {
  let out = text ?? '';
  if (lang === 'ar' && out) {
    const hit = ar[out];
    if (hit !== undefined) {
      out = hit;
    } else if (!args) {
      for (const [pattern, template] of PATTERNS) {
        const match = out.match(pattern);
        if (match) {
          out = template.replace(/\{(\d)\}/g, (_, i: string) => t(match[Number(i)]));
          break;
        }
      }
    }
  }
  if (args) out = out.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? ''));
  return out;
}
