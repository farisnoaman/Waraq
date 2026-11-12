import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_QTY } from '../contexts/RequestListContext';
import { t } from '../lib/i18n';

interface Props {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** Minimum order quantity for the product. */
  min?: number;
}

export default function QtyStepper({ value, onChange, label, min = 1 }: Props) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      const next = Math.min(MAX_QTY, Math.max(min, parsed));
      onChange(next);
      setDraft(String(next));
    } else {
      setDraft(String(value));
    }
  };

  const button =
    'grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-paper-deep active:bg-line disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

  return (
    <div
      role="group"
      aria-label={t("Quantity of {0}", [label])}
      className="inline-flex h-11 shrink-0 items-center rounded-full border border-line bg-white"
    >
      <button
        type="button"
        className={button}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={t("Decrease quantity of {0}", [label])}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label={t("Quantity of {0}", [label])}
        className="h-9 w-12 rounded-md bg-transparent text-center text-base font-semibold tabular-nums"
      />
      <button
        type="button"
        className={button}
        onClick={() => onChange(Math.min(MAX_QTY, value + 1))}
        disabled={value >= MAX_QTY}
        aria-label={t("Increase quantity of {0}", [label])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
