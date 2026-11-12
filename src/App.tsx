import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { FullPageLoader } from './components/ui';
import { AuthProvider } from './contexts/AuthContext';
import { RequestListProvider } from './contexts/RequestListContext';
import NotFound from './pages/NotFound';
import { t, useLang } from './lib/i18n';

const BuyerPortal = lazy(() => import('./pages/buyer/BuyerPortal'));
const AdminPortal = lazy(() => import('./pages/admin/AdminPortal'));
const Contact = lazy(() => import('./pages/Contact'));
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Products = lazy(() => import('./pages/Products'));
const RequestPage = lazy(() => import('./pages/Request'));
const Services = lazy(() => import('./pages/Services'));

function RouteFallback() {
  return <FullPageLoader label={t('Loading')} />;
}

export default function App() {
  useLang();
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <RequestListProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="products" element={<Products />} />
                  <Route path="products/:slug" element={<ProductDetail />} />
                  <Route path="services" element={<Services />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="request" element={<RequestPage />} />
                  <Route path="login" element={<Login />} />

                  {/* Any signed-in user has a buyer portal for their own orders. */}
                  <Route
                    path="buyer/*"
                    element={
                      <ProtectedRoute>
                        <Suspense fallback={<FullPageLoader label={t("Opening your portal")} />}>
                          <BuyerPortal />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />

                  {/* Admin and staff only. Buyers are redirected to /buyer. */}
                  <Route
                    path="admin/*"
                    element={
                      <ProtectedRoute roles={['admin', 'staff']}>
                        <Suspense fallback={<FullPageLoader label={t("Opening the operations portal")} />}>
                          <AdminPortal />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
        </RequestListProvider>
      </AuthProvider>
    </BrowserRouter>
    </MotionConfig>
  );
}
