import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ClipboardList,
  Clock,
  Download,
  Earth,
  Globe,
  LogOut,
  Mail,
  MapPin,
  Menu,
  ShieldCheck,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRequestList } from '../contexts/RequestListContext';
import { useInstallPrompt, useOnline } from '../lib/pwa';
import { PHONE_DISPLAY, SITE_DOMAIN, SITE_EMAIL, whatsappLink } from '../lib/site';
import { ROLE_LABEL } from '../lib/format';
import Logo from './Logo';
import WhatsAppIcon from './WhatsAppIcon';
import { t, toggleLang, useLang } from '../lib/i18n';

function InstallButton() {
  const { canPrompt, isInstalled, install } = useInstallPrompt();
  const [showHelp, setShowHelp] = useState(false);

  if (isInstalled) return null;

  const onClick = async () => {
    const outcome = await install();
    if (outcome === 'manual') setShowHelp((open) => !open);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => void onClick()}
        aria-expanded={canPrompt ? undefined : showHelp}
        className="inline-flex items-center gap-1 rounded-full bg-primary-bright/20 px-2.5 py-0.5 text-xs font-semibold text-primary-bright transition-colors hover:bg-primary-bright hover:text-forest"
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        {t("Install app")}
      </button>
      {showHelp && (
        <span
          role="status"
          className="absolute end-0 top-full z-50 mt-2 w-64 rounded-xl bg-card p-3 text-start text-xs leading-relaxed text-ink shadow-lg"
        >
          {t("Open your browser menu and choose")}{' '}<strong>{t("Install app")}</strong>{' '}{t("or")}{' '}
          <strong>{t("Add to Home Screen")}</strong>{t(". Waraq Pro then opens like an app and keeps your orders available offline.")}
        </span>
      )}
    </span>
  );
}

function TopBar() {
  const { profile, signOut } = useAuth();
  return (
    <aside
      aria-label={t("Contact and account details")}
      className="on-dark bg-forest text-paper/85 print:hidden"
    >
      <div className="container-x flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-[13px]">
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-brass-soft" aria-hidden="true" />
          <span className="sm:hidden">{t("Jeddah ·")}{' '}{SITE_DOMAIN}</span>
          <span className="hidden sm:inline">{t("Jeddah, Kingdom of Saudi Arabia ·")}{' '}{SITE_DOMAIN}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <InstallButton />
          <a
            href={whatsappLink('Hello Waraq Pro, I have an enquiry about your products.')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-paper transition-colors hover:text-primary-bright"
          >
            <WhatsAppIcon className="h-3.5 w-3.5 text-brass-soft" />
            <span>{PHONE_DISPLAY}</span>
          </a>
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="hidden items-center gap-1.5 font-medium text-paper transition-colors hover:text-primary-bright sm:inline-flex"
          >
            <Mail className="h-3.5 w-3.5 text-brass-soft" aria-hidden="true" />
            <span>{SITE_EMAIL}</span>
          </a>
          {profile ? (
            <span className="inline-flex items-center gap-3">
              <Link
                to={profile.role === 'buyer' ? '/buyer' : '/admin'}
                className="inline-flex items-center gap-1 font-semibold text-brass-soft hover:text-white"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {profile.full_name.split(' ')[0]} · {t(ROLE_LABEL[profile.role])}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-semibold text-paper transition-colors hover:border-danger hover:bg-danger hover:text-white"
              >
                <LogOut className="h-3 w-3" aria-hidden="true" />
                {t("Sign out")}
              </button>
            </span>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1 font-semibold text-brass-soft hover:text-white"
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Sign in")}
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { count } = useRequestList();
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const lang = useLang();

  const links = [
    { to: '/', label: 'Home', end: true },
    { to: '/products', label: 'Products', end: false },
    { to: '/services', label: 'Services', end: false },
    { to: '/contact', label: 'Contact', end: false },
    { to: '/buyer', label: 'Buyer Portal', end: false },
    ...(profile?.role === 'admin' || profile?.role === 'staff'
      ? [{ to: '/admin', label: profile.role === 'staff' ? 'Staff Portal' : 'Admin', end: false }]
      : []),
  ];

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur-md print:hidden">
      <div className="container-x flex h-[68px] items-center justify-between gap-4">
        <Link to="/" className="rounded-lg">
          <Logo />
        </Link>

        <nav aria-label={t("Main")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium transition-colors ${
                      isActive
                        ? 'text-primary-strong after:absolute after:inset-x-3.5 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-primary'
                        : 'text-ink/80 hover:bg-paper-deep hover:text-ink'
                    }`
                  }
                >
                  {link.to === '/admin' && (
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  )}
                  {link.to === '/buyer' && (
                    <UserRound className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  )}
                  {t(link.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Language toggle: Arabic (default, right-to-left) <-> English. */}
          <button
            type="button"
            onClick={toggleLang}
            aria-label={
              lang === 'ar' ? 'EN — Switch to English' : 'عربي — التبديل إلى العربية'
            }
            title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep"
          >
            <Earth className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
            <span lang={lang === 'ar' ? 'en' : 'ar'}>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>
          <Link
            to="/request"
            className="btn btn-primary px-3 sm:px-5"
            aria-label={t("Request list, {0} {1}", [count, count === 1 ? t("item") : t("items")])}
          >
            <ClipboardList className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="hidden sm:inline">{t("Request list")}</span>
            <span
              className="grid h-6 min-w-6 place-items-center rounded-full bg-white/20 px-1.5 text-xs font-bold tabular-nums"
              aria-hidden="true"
            >
              {count}
            </span>
          </Link>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper-deep lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t("Close menu") : t("Open menu")}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label={t("Mobile")}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-full border-b border-line bg-paper shadow-[0_24px_40px_-24px_rgba(4,38,29,0.4)] lg:hidden"
          >
            <ul className="container-x py-3">
              {links.map((link) => (
                <li key={link.to} className="border-b border-line last:border-b-0">
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `flex min-h-14 items-center justify-between font-display text-2xl ${
                        isActive ? 'text-primary-strong' : 'text-ink'
                      }`
                    }
                  >
                    <span>{t(link.label)}</span>
                  </NavLink>
                </li>
              ))}
              <li className="border-b border-line last:border-b-0">
                {profile ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void signOut();
                    }}
                    className="flex min-h-14 w-full items-center justify-between font-display text-2xl text-danger"
                  >
                    <span>{t("Sign out (")}{profile.full_name.split(' ')[0]})</span>
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                  </button>
                ) : (
                  <NavLink
                    to="/login"
                    className="flex min-h-14 items-center justify-between font-display text-2xl text-ink"
                  >
                    <span>{t("Sign in")}</span>
                  </NavLink>
                )}
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  const links = [
    { to: '/', label: 'Home' },
    { to: '/products', label: 'Products' },
    { to: '/services', label: 'Services' },
    { to: '/contact', label: 'Contact' },
    { to: '/buyer', label: 'Buyer Portal' },
    { to: '/login', label: 'Account sign in' },
  ];
  return (
    <footer className="on-dark bg-forest text-paper print:hidden">
      <div className="container-x grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo tone="dark" />
          <p className="mt-5 max-w-sm text-paper/70">
            {t("Waraq Pro (")}{SITE_DOMAIN}{t(") is a Jeddah-based supply company established in 2015. Paper, packaging and office products, from your request to delivery at your door.")}
          </p>
        </div>
        <nav aria-label={t("Footer")} className="md:col-span-3">
          <p className="eyebrow text-brass-soft">{t("Explore")}</p>
          <ul className="mt-4 space-y-1">
            {links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="inline-flex min-h-10 items-center text-paper/85 transition-colors hover:text-primary-bright"
                >
                  {t(link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="md:col-span-4">
          <p className="eyebrow text-brass-soft">{t("Contact")}</p>
          <ul className="mt-4 space-y-4">
            <li>
              <a
                href={`mailto:${SITE_EMAIL}`}
                className="inline-flex items-center gap-3 font-display text-2xl text-paper transition-colors hover:text-primary-bright"
              >
                <Mail className="h-5 w-5 text-brass-soft" aria-hidden="true" />
                {SITE_EMAIL}
              </a>
            </li>
            <li>
              <a
                href={whatsappLink('Hello Waraq Pro, I would like to enquire about your products.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 font-display text-2xl text-paper transition-colors hover:text-primary-bright"
              >
                <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
                {PHONE_DISPLAY}
              </a>
            </li>
            <li className="flex items-center gap-3 text-paper/85">
              <Globe className="h-5 w-5 shrink-0 text-brass-soft" aria-hidden="true" />
              {SITE_DOMAIN}
            </li>
            <li className="flex items-center gap-3 text-paper/85">
              <MapPin className="h-5 w-5 shrink-0 text-brass-soft" aria-hidden="true" />
              {t("Jeddah, Kingdom of Saudi Arabia")}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-6 pe-20 text-sm text-paper/60 sm:flex-row sm:items-center sm:justify-between sm:pe-56">
          <p>
            © {year}{' '}{t("Waraq Pro (")}{SITE_DOMAIN}{t("). All rights reserved.")}
          </p>
          <p>{t("Established 2015 in Jeddah ·")}{' '}{PHONE_DISPLAY}</p>
        </div>
      </div>
    </footer>
  );
}

function Toast() {
  const { notice, dismissNotice } = useRequestList();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 print:hidden"
    >
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22 }}
            className="on-dark pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-forest py-3 ps-4 pe-3 text-[15px] text-paper shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)]"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-bright text-forest">
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">{notice.text}</span>
            <Link
              to="/request"
              onClick={dismissNotice}
              className="ms-1 inline-flex min-h-10 shrink-0 items-center rounded-full px-3 font-semibold text-primary-bright underline-offset-4 hover:underline"
            >
              {t("View list")}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WhatsAppFab() {
  return (
    <a
      href={whatsappLink('Hello Waraq Pro, I would like to enquire about your products and quotation.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("Chat with Waraq Pro on WhatsApp at {0}", [PHONE_DISPLAY])}
      title={t("WhatsApp Waraq Pro ({0})", [PHONE_DISPLAY])}
      className="group fixed bottom-5 end-5 z-40 flex items-center gap-2.5 rounded-full bg-[#25D366] p-3.5 text-forest shadow-[0_12px_32px_-8px_rgba(37,211,102,0.65)] ring-2 ring-white/80 transition-all duration-200 hover:scale-105 hover:bg-[#20bd5a] sm:px-4 sm:py-3 print:hidden"
    >
      <WhatsAppIcon className="h-6 w-6 shrink-0 text-forest" />
      <span className="hidden text-sm font-bold tracking-tight text-forest sm:inline">
        {t("WhatsApp")}{' '}{PHONE_DISPLAY}
      </span>
    </a>
  );
}

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-brass px-4 py-2 text-center text-sm font-semibold text-forest print:hidden"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t("You are offline. Saved pages and your saved orders are still available.")}
    </div>
  );
}

/** Shown for the last minute before the automatic 10-minute sign-out. */
function IdleWarning() {
  const { idleSecondsLeft, stayActive, signOut } = useAuth();
  if (idleSecondsLeft === null) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 print:hidden">
      <div
        role="alertdialog"
        aria-labelledby="idle-title"
        aria-describedby="idle-text"
        className="on-dark flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-forest p-5 text-paper shadow-[0_24px_50px_-18px_rgba(0,0,0,0.6)] sm:flex-row sm:items-center"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brass/25 text-brass-soft">
          <Clock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="idle-title" className="font-semibold">
            {t("Still there?")}
          </p>
          <p id="idle-text" className="text-sm text-paper/75">
            {t("You will be signed out in")}{' '}
            <span className="font-semibold tabular-nums text-paper">{idleSecondsLeft} {t('sec')}</span>{' '}{t("because there has been no activity.")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn btn-bright btn-sm" onClick={stayActive}>
            {t("Stay signed in")}
          </button>
          <button type="button" className="btn btn-on-dark btn-sm" onClick={() => void signOut()}>
            {t("Sign out")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:font-semibold focus:text-white"
      >
        {t("Skip to content")}
      </a>
      <TopBar />
      <OfflineBanner />
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toast />
      <aside aria-label={t("Quick contact")}>
        <WhatsAppFab />
      </aside>
      <IdleWarning />
    </div>
  );
}
