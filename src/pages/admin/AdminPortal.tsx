import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import {
  BadgePercent,
  ClipboardList,
  Inbox,
  LayoutGrid,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  Truck,
  UserRound,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import ProfilePanel from '../../components/ProfilePanel';
import { ErrorPanel, PageHeader, usePageTitle } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useOnline } from '../../lib/pwa';
import type { Order, OrdersResponse } from '../../lib/types';
import CatalogTab from './CatalogTab';
import CommissionsTab from './CommissionsTab';
import DeliveriesTab from './DeliveriesTab';
import InboxTab from './InboxTab';
import OrdersTab from './OrdersTab';
import PaymentsTab from './PaymentsTab';
import SettingsTab from './SettingsTab';
import UsersTab from './UsersTab';
import type { OpsProps } from './shared';
import { t } from '../../lib/i18n';

const POLL_MS = 30000;

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  adminOnly?: boolean;
}

export default function AdminPortal() {
  const { profile, signOut } = useAuth();
  const online = useOnline();
  const isAdmin = profile?.role === 'admin';
  usePageTitle(isAdmin ? t('Admin portal') : t('Staff portal'), { noIndex: true });

  const [orders, setOrders] = useState<Order[]>([]);
  const [sellerVat, setSellerVat] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const hasData = useRef(false);

  // The server scopes this list by role: staff only receive their own assignments.
  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await api<OrdersResponse>('/api/orders');
      setOrders(response.orders);
      setSellerVat(response.seller_vat_number);
      setLoadedAt(new Date().toISOString());
      setError(null);
      hasData.current = true;
    } catch (err) {
      // Keep showing the last good data during a brief network drop.
      if (!(err instanceof ApiError && err.isNetwork && hasData.current)) {
        setError(errorMessage(err));
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onOnline = () => void reload();
    window.addEventListener('online', onOnline);
    const interval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void reload();
    }, POLL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
  }, [reload]);

  if (!profile) return null;

  const withDelivery = orders.filter((o) => o.delivery).length;
  const withPayment = orders.filter((o) => o.payment).length;

  const tabs: Tab[] = [
    { to: 'catalog', label: 'Catalog', icon: LayoutGrid, adminOnly: true },
    { to: 'orders', label: 'Orders', icon: ClipboardList, count: orders.length },
    { to: 'deliveries', label: 'Deliveries', icon: Truck, count: withDelivery },
    { to: 'payments', label: 'Payments', icon: Wallet, count: withPayment },
    { to: 'commissions', label: 'Commissions', icon: BadgePercent },
    { to: 'users', label: 'Users & staff', icon: Users, adminOnly: true },
    { to: 'settings', label: 'Settings', icon: SettingsIcon, adminOnly: true },
    { to: 'inbox', label: 'Inbox', icon: Inbox, adminOnly: true },
    { to: 'profile', label: 'Profile', icon: UserRound },
  ].filter((tab) => isAdmin || !tab.adminOnly);

  const ops: OpsProps = { orders, sellerVat, isAdmin, me: profile, reload };
  const home = isAdmin ? 'orders' : 'deliveries';
  const adminOnly = (element: React.ReactNode) =>
    isAdmin ? element : <Navigate to={`/admin/${home}`} replace />;

  return (
    <>
      <PageHeader
        tone="dark"
        eyebrow={isAdmin ? t("Operations · administrator") : t("Operations · delivery staff")}
        title={isAdmin ? t("Admin portal") : t("Staff portal · {0}", [profile.full_name.split(' ')[0]])}
        description={
          isAdmin
            ? t("Manage the catalogue, confirm orders, assign deliveries, record payments, pay commissions and configure VAT.")
            : t("Your assigned deliveries with their orders, payments and commissions. You only see records that are assigned to you.")
        }
      >
        <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          {online ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-bright/15 px-3.5 py-1.5 font-semibold text-primary-bright">
              <Wifi className="h-4 w-4" aria-hidden="true" />
              {t("Online")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-brass/25 px-3.5 py-1.5 font-semibold text-brass-soft">
              <WifiOff className="h-4 w-4" aria-hidden="true" />
              {t("Offline · changes are disabled")}
            </span>
          )}
          <span className="text-paper/70" role="status">
            {refreshing ? t("Refreshing…") : loadedAt ? t("Updated {0}", [formatDateTime(loadedAt)]) : ''}
          </span>
          <button
            type="button"
            className="btn btn-on-dark btn-sm"
            onClick={() => void reload()}
            disabled={refreshing || !online}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t("Refresh")}
          </button>
          <button type="button" className="btn btn-on-dark btn-sm" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("Sign out")}
          </button>
        </div>
      </PageHeader>

      <div className="sticky top-16 z-30 border-b border-line bg-paper/95 backdrop-blur-md sm:top-[68px] print:hidden">
        <nav aria-label={t("Operations")} className="container-x">
          <ul className="flex flex-wrap gap-1 py-2.5">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={`/admin/${tab.to}`}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                      isActive ? 'bg-forest text-paper' : 'text-ink/80 hover:bg-paper-deep'
                    }`
                  }
                >
                  <tab.icon className="h-4 w-4" aria-hidden="true" />
                  {t(tab.label)}
                  {tab.count !== undefined && (
                    <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums">
                      {tab.count}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <section className="container-x py-8 lg:py-12">
        {error && (
          <div className="mb-6">
            <ErrorPanel message={error} onRetry={() => void reload()} />
          </div>
        )}
        {loading ? (
          <div className="space-y-4" role="status">
            <p className="sr-only">{t("Loading operations data")}</p>
            <div className="skeleton h-9 w-64" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-40 rounded-2xl" />
            ))}
          </div>
        ) : (
          <Routes>
            <Route index element={<Navigate to={`/admin/${home}`} replace />} />
            <Route path="catalog" element={adminOnly(<CatalogTab />)} />
            <Route path="orders" element={<OrdersTab {...ops} />} />
            <Route path="deliveries" element={<DeliveriesTab {...ops} />} />
            <Route path="payments" element={<PaymentsTab {...ops} />} />
            <Route path="commissions" element={<CommissionsTab {...ops} />} />
            <Route path="users" element={adminOnly(<UsersTab me={profile} />)} />
            <Route path="settings" element={adminOnly(<SettingsTab />)} />
            <Route path="inbox" element={adminOnly(<InboxTab />)} />
            <Route path="profile" element={<ProfilePanel />} />
            <Route path="*" element={<Navigate to={`/admin/${home}`} replace />} />
          </Routes>
        )}
      </section>
    </>
  );
}
