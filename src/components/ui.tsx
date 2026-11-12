import { useEffect, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Boxes,
  Check,
  ClipboardList,
  FileCheck,
  FileText,
  LifeBuoy,
  PackageSearch,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '../lib/format';
import { getLang } from '../lib/i18n';
import { t } from '../lib/i18n';

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SERVICE_ICONS: Record<string, LucideIcon> = {
  'clipboard-list': ClipboardList,
  'file-text': FileText,
  'file-check': FileCheck,
  'package-search': PackageSearch,
  'shield-check': ShieldCheck,
  truck: Truck,
  search: Search,
  repeat: Repeat,
  boxes: Boxes,
  'life-buoy': LifeBuoy,
};

export function serviceIcon(name: string): LucideIcon {
  return SERVICE_ICONS[name] ?? Check;
}

export function usePageTitle(title?: string) {
  const lang = getLang();
  useEffect(() => {
    document.title = title
      ? `${title} | ${t('Waraq Pro')} (waraq.pro)`
      : t('Waraq Pro | Paper, packaging and office supply in Jeddah (waraq.pro)');
  }, [title, lang]);
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.li>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  tone = 'light',
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: 'light' | 'dark';
  children?: ReactNode;
}) {
  const dark = tone === 'dark';
  return (
    <section
      className={
        dark
          ? 'on-dark relative overflow-hidden bg-forest text-paper print:hidden'
          : 'relative overflow-hidden border-b border-line bg-paper-deep print:hidden'
      }
    >
      <div aria-hidden="true" className={`absolute inset-0 ${dark ? 'ruled' : 'ruled-light'}`} />
      <div className="container-x relative py-14 sm:py-20">
        <p className={`eyebrow ${dark ? 'text-brass-soft' : 'text-primary-strong'}`}>{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-[1.06] sm:text-5xl lg:text-6xl">{title}</h1>
        {description && (
          <p className={`mt-5 max-w-2xl text-lg ${dark ? 'text-paper/75' : 'text-muted'}`}>
            {description}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  dark = false,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  dark?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className={`eyebrow ${dark ? 'text-brass-soft' : 'text-primary-strong'}`}>{eyebrow}</p>
        <h2 className="mt-3 text-3xl leading-[1.1] sm:text-4xl lg:text-[2.75rem]">{title}</h2>
        {description && (
          <p className={`mt-4 text-lg ${dark ? 'text-paper/75' : 'text-muted'}`}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
  dark = false,
}: {
  message: string;
  onRetry?: () => void;
  dark?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between ${
        dark ? 'border-white/15 bg-white/5 text-paper' : 'border-line bg-card text-ink'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className={`mt-0.5 h-5 w-5 shrink-0 ${dark ? 'text-brass-soft' : 'text-danger'}`}
          aria-hidden="true"
        />
        <p className="text-[15px]">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`btn ${dark ? 'btn-on-dark' : 'btn-outline'}`}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("Try again")}
        </button>
      )}
    </div>
  );
}

export function StockBadge({ inStock, solid = false }: { inStock: boolean; solid?: boolean }) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none';
  return inStock ? (
    <span
      className={`${base} ${solid ? 'bg-card text-primary-strong shadow-sm' : 'bg-mint text-primary-strong'}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
      {t("In stock")}
    </span>
  ) : (
    <span className={`${base} ${solid ? 'bg-card text-ink shadow-sm' : 'bg-paper-deep text-ink'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
      {t("On request")}
    </span>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card" aria-hidden="true">
      <div className="skeleton aspect-[4/3] rounded-none" />
      <div className="space-y-3 p-5">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-6 w-4/5" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton mt-4 h-11 w-40 rounded-full" />
      </div>
    </div>
  );
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-paper-deep text-ink',
  brass: 'bg-brass/20 text-brass-deep',
  mint: 'bg-mint text-primary-strong',
  solid: 'bg-primary text-white',
  dark: 'bg-forest text-brass-soft',
  danger: 'bg-danger/10 text-danger',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-tight ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status">
      <div className="flex items-center gap-3 text-muted">
        <Spinner className="h-5 w-5 text-primary" />
        <span>{label ?? t('Loading')}…</span>
      </div>
    </div>
  );
}

export function Alert({
  tone = 'danger',
  children,
  className = '',
}: {
  tone?: 'danger' | 'info' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    danger: 'border-danger/30 bg-danger/5 text-danger',
    info: 'border-line bg-paper-deep/70 text-ink',
    success: 'border-primary/30 bg-mint/40 text-primary-strong',
  }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border p-4 text-[15px] ${styles} ${className}`}
    >
      {tone === 'success' ? (
        <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

interface FieldShell {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function Field({ id, label, error, hint, required, children }: FieldShell & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({
  id,
  label,
  error,
  hint,
  required,
  className = '',
  ...rest
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <input
        id={id}
        className={`field-input ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      />
    </Field>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  hint,
  required,
  className = '',
  ...rest
}: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        className={`field-input ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      />
    </Field>
  );
}

export function SelectField({
  id,
  label,
  error,
  hint,
  required,
  className = '',
  children,
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <select
        id={id}
        className={`field-input ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}
