import { t } from './i18n';

export const SITE_NAME = 'Waraq Pro';
export const SITE_DOMAIN = 'waraq.pro';
export const SITE_EMAIL = 'info@warq.pro';
// Wrapped in left-to-right isolate marks so the leading + stays in front inside Arabic text.
export const PHONE_DISPLAY = '\u2066+966533014118\u2069';
const WHATSAPP_NUMBER = '966533014118';

export function whatsappLink(text = ''): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  // The prefilled message follows the current language.
  return text ? `${base}?text=${encodeURIComponent(t(text))}` : base;
}

export function mailtoLink(subject: string, body = ''): string {
  const parts = [`subject=${encodeURIComponent(subject)}`];
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SITE_EMAIL}?${parts.join('&')}`;
}
