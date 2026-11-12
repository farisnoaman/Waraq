import type { Order } from './types';

/*
 * Offline storage for the buyer portal (IndexedDB).
 *
 *   orders  one record per user: their orders as last synced from the server
 *   outbox  actions taken while offline, replayed when the device reconnects
 *
 * Everything is keyed by user id and wiped when that user signs out, so one
 * person's orders are never shown to the next person on a shared device.
 */

const DB_NAME = 'waraqpro-offline';
const DB_VERSION = 1;
const ORDERS = 'orders';
const OUTBOX = 'outbox';

export interface OrdersSnapshot {
  userId: string;
  orders: Order[];
  sellerVatNumber: string;
  syncedAt: string;
}

export interface QueuedAction {
  id?: number;
  userId: string;
  type: 'confirm_reception';
  orderId: number;
  queuedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ORDERS)) db.createObjectStore(ORDERS, { keyPath: 'userId' });
      if (!db.objectStoreNames.contains(OUTBOX)) {
        const store = db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = work(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Offline storage request failed'));
      }),
  );
}

export async function saveOrdersSnapshot(snapshot: OrdersSnapshot): Promise<void> {
  try {
    await run(ORDERS, 'readwrite', (store) => store.put(snapshot));
  } catch {
    /* storage unavailable (private mode, quota): the portal still works online */
  }
}

export async function loadOrdersSnapshot(userId: string): Promise<OrdersSnapshot | null> {
  try {
    const result = await run<OrdersSnapshot | undefined>(ORDERS, 'readonly', (store) =>
      store.get(userId),
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function listQueuedActions(userId: string): Promise<QueuedAction[]> {
  try {
    return await run<QueuedAction[]>(OUTBOX, 'readonly', (store) =>
      store.index('userId').getAll(userId),
    );
  } catch {
    return [];
  }
}

export async function queueAction(action: QueuedAction): Promise<void> {
  const existing = await listQueuedActions(action.userId);
  if (existing.some((a) => a.type === action.type && a.orderId === action.orderId)) return;
  await run(OUTBOX, 'readwrite', (store) => store.add(action));
}

export async function removeQueuedAction(id: number): Promise<void> {
  try {
    await run(OUTBOX, 'readwrite', (store) => store.delete(id));
  } catch {
    /* nothing to remove */
  }
}

/** Removes everything stored for a user. Called on sign-out. */
export async function clearOfflineData(userId: string): Promise<void> {
  try {
    await run(ORDERS, 'readwrite', (store) => store.delete(userId));
    const queued = await listQueuedActions(userId);
    await Promise.all(queued.map((a) => (a.id != null ? removeQueuedAction(a.id) : undefined)));
  } catch {
    /* nothing stored */
  }
}
