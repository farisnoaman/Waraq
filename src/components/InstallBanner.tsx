import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useInstallPrompt } from '../lib/pwa';
import { t } from '../lib/i18n';

const DISMISS_KEY = 'waraqpro.install.banner.dismissed.v1';
const SHOW_DELAY_MS = 2500;

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) != null;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the banner simply shows again next visit */
  }
}

/** iOS Safari has no beforeinstallprompt; there the banner explains the steps. */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * A one-time "install the app" card shown shortly after the first open of the
 * website. Hidden once installed, once dismissed (remembered in localStorage),
 * or on browsers with no install path at all. The compact button in the top
 * bar remains as the permanent fallback either way.
 */
export default function InstallBanner() {
  const { canPrompt, isInstalled, install } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isInstalled || wasDismissed()) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isInstalled]);

  const relevant = canPrompt || isIOS();

  const onInstall = async () => {
    setInstalling(true);
    const outcome = await install();
    setInstalling(false);
    if (outcome !== 'manual') dismiss();
    if (outcome === 'accepted') setVisible(false);
    // 'manual' means no native prompt is available: keep the card open.
  };

  const onHide = () => {
    dismiss();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && relevant && !isInstalled && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.25 }}
          role="status"
          aria-label={t("Install Waraq Pro")}
          className="pointer-events-auto fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-forest p-4 text-paper shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)] sm:bottom-5 print:hidden"
        >
          {/* The mark's icon in its dark variant, so it reads on the forest card. */}
          <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
            <rect width="48" height="48" rx="14" fill="#D8F26A" />
            <path
              d="M17.5 28.5 C15.2 23.2 18.2 18.2 24.2 17.5 C27.2 17.1 29.8 16.1 31.8 14.5 C34.2 20.8 33.4 27.6 28.2 30.8 C24.2 33.2 19.6 32.2 17.5 28.5 Z"
              fill="none"
              stroke="#123D35"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14.5 34.5 C15.2 29.8 18.8 26.8 24.5 24.2"
              fill="none"
              stroke="#123D35"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>

          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold">{t("Install Waraq Pro")}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-paper/75">
              {canPrompt
                ? t("Add it to your device — it opens like an app and keeps your orders available offline.")
                : t('In Safari, tap Share and choose “Add to Home Screen”.')}
            </p>
            {canPrompt && (
              <button
                type="button"
                onClick={() => void onInstall()}
                disabled={installing}
                className="btn btn-bright btn-sm mt-2.5"
              >
                {t("Install")}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onHide}
            aria-label={t("Dismiss")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
