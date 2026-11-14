import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from './ui';
import { t } from '../lib/i18n';

export interface ConfirmChange {
  /** What is changing, e.g. the line name or field label. */
  label: string;
  /** Current value; shown struck-through when a new value is present. */
  from?: string;
  /** New value, emphasised. */
  to?: string;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  /** Shown as a "from → to" list (edits). Omit for simple yes/no deletes. */
  changes?: ConfirmChange[];
  /** danger = destructive (red confirm); primary = regular edits. */
  tone?: 'danger' | 'primary';
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmation dialog for destructive and editing actions. Deletes pass a
 * title + message; edits pass a `changes` list rendering "from → to" per
 * field, so the administrator sees exactly what will change before saving.
 */
export default function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, busy, onClose]);

  const confirm = async () => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  const danger = request?.tone !== 'primary';

  return createPortal(
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-forest/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md rounded-2xl border border-line bg-card p-5 text-ink shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                  danger ? 'bg-danger/10 text-danger' : 'bg-mint text-primary-strong'
                }`}
              >
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 id="confirm-title" className="font-display text-lg font-semibold leading-snug">
                {request.title}
              </h2>
            </div>

            {request.message && <p className="mt-2 text-sm text-muted">{request.message}</p>}

            {request.changes && request.changes.length > 0 && (
              <ul className="mt-3 divide-y divide-dotted divide-line/80 rounded-xl border border-line bg-paper-deep/40 px-3 py-1 text-sm">
                {request.changes.map((change) => (
                  <li key={change.label} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-muted">{change.label}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-end">
                      {change.from != null && change.from !== '' && (
                        <span className="text-xs text-muted line-through">{change.from}</span>
                      )}
                      {change.to != null && change.to !== '' && (
                        <span className="font-semibold text-primary-strong">{change.to}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex justify-end gap-2.5">
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onClose}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy && <Spinner />}
                {request.confirmLabel ?? t("Confirm")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
