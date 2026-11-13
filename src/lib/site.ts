import { getLang, t, type Lang } from './i18n';

export const SITE_NAME = 'Waraq Pro';
export const SITE_DOMAIN = 'waraq.pro';
export const SITE_EMAIL = 'info@warq.pro';
// Wrapped in left-to-right isolate marks so the leading + stays in front inside Arabic text.
export const PHONE_DISPLAY = '⁦+966533014118⁩';
const WHATSAPP_NUMBER = '966533014118';

/** The registered address, in the language of the reader. */
export const SITE_ADDRESS_EN = 'Al-Nassem - Al Fayha, Riyadh, Kingdom of Saudi Arabia';
export const SITE_ADDRESS_AR = 'حي النسيم - الفيحاء - الرياض - المملكة العربية السعودية';
export const SITE_POSTAL_CODE = '14253';
/** The Saudi National Address short code. */
export const SITE_SHORT_ADDRESS = 'RQFA2427';
/** The company VAT registration number, printed on bills and receipts. */
export const SITE_VAT_NUMBER = '314635632800003';

export function siteAddress(lang: Lang = getLang()): string {
  return lang === 'ar' ? SITE_ADDRESS_AR : SITE_ADDRESS_EN;
}

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
