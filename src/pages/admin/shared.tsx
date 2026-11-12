import { useCallback, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import type { Order, Profile } from '../../lib/types';

/** Data every operations tab receives from the portal shell. */
export interface OpsProps {
  /** Admin: every order. Staff: only orders whose delivery is assigned to them. */
  orders: Order[];
  sellerVat: string;
  isAdmin: boolean;
  me: Profile;
  reload: () => Promise<void>;
}

/** Runs a mutation, then reloads the shared data. Tracks which button is busy. */
export function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, work: () => Promise<unknown>): Promise<boolean> => {
      setBusy(key);
      setError(null);
      try {
        await work();
        await reload();
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  return { busy, error, setError, run };
}

export function TabIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl sm:text-3xl">{title}</h2>
      {children && <p className="mt-2 max-w-3xl text-muted">{children}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-card px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-2xl">{title}</h3>
      {children && <p className="mt-2 max-w-md text-muted">{children}</p>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}
