import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../lib/types';
import { FullPageLoader } from './ui';
import { t } from '../lib/i18n';

interface Props {
  children: ReactNode;
  /** When set, only these roles may enter. Everyone else is sent to the buyer portal. */
  roles?: Role[];
}

/**
 * Route guard. The role comes from the server-loaded profile, and every API
 * call re-checks it, so this guard decides what is shown, never what is allowed.
 */
export default function ProtectedRoute({ children, roles }: Props) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader label={t("Checking your session")} />;

  if (!profile) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/buyer" replace state={{ denied: location.pathname }} />;
  }

  return <>{children}</>;
}
