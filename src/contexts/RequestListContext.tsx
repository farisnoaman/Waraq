import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { t } from '../lib/i18n';

export const MAX_QTY = 9999;
const STORAGE_KEY = 'waraqpro.request_list.v1';

export interface RequestLine {
  productId: number;
  qty: number;
}

interface Notice {
  id: number;
  text: string;
}

interface RequestListValue {
  lines: RequestLine[];
  count: number;
  notice: Notice | null;
  add: (productId: number, qty: number, name: string) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  qtyOf: (productId: number) => number;
  dismissNotice: () => void;
}

const RequestListContext = createContext<RequestListValue | null>(null);

function readStored(): RequestLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((line) => ({
        productId: Number((line as RequestLine).productId),
        qty: Number((line as RequestLine).qty),
      }))
      .filter(
        (line) =>
          Number.isInteger(line.productId) &&
          line.productId > 0 &&
          Number.isInteger(line.qty) &&
          line.qty >= 1 &&
          line.qty <= MAX_QTY,
      );
  } catch {
    return [];
  }
}

const clampQty = (qty: number) => Math.min(MAX_QTY, Math.max(1, Math.round(qty) || 1));

export function RequestListProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<RequestLine[]>(readStored);
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable: the list still works for this visit */
    }
  }, [lines]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const dismissNotice = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setNotice(null);
  }, []);

  const add = useCallback((productId: number, qty: number, name: string) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) =>
          line.productId === productId ? { ...line, qty: clampQty(line.qty + qty) } : line,
        );
      }
      return [...current, { productId, qty: clampQty(qty) }];
    });
    if (timer.current) window.clearTimeout(timer.current);
    setNotice({ id: Date.now(), text: t("{0} added to your request list.", [t(name)]) });
    timer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const setQty = useCallback((productId: number, qty: number) => {
    setLines((current) =>
      current.map((line) => (line.productId === productId ? { ...line, qty: clampQty(qty) } : line)),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<RequestListValue>(
    () => ({
      lines,
      count: lines.length,
      notice,
      add,
      setQty,
      remove,
      clear,
      qtyOf: (productId) => lines.find((line) => line.productId === productId)?.qty ?? 0,
      dismissNotice,
    }),
    [lines, notice, add, setQty, remove, clear, dismissNotice],
  );

  return <RequestListContext.Provider value={value}>{children}</RequestListContext.Provider>;
}

export function useRequestList(): RequestListValue {
  const value = useContext(RequestListContext);
  if (!value) throw new Error('useRequestList must be used inside <RequestListProvider>');
  return value;
}
