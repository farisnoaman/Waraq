import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { FullPageLoader } from './components/ui';
import { AuthProvider } from './contexts/AuthContext';
import { RequestListProvider } from './contexts/RequestListContext';
import Contact from './pages/Contact';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import ProductDetail from './pages/ProductDetail';
import Products from './pages/Products';
import RequestPage from './pages/Request';
import Services from './pages/Services';
import { t, useLang } from './lib/i18n';

const BuyerPortal = lazy(() => import('./pages/buyer/BuyerPortal'));
const AdminPortal = lazy(() => import('./pages/admin/AdminPortal'));

export default function App() {
  // Subscribing here re-renders the whole tree when the language is switched.
  useLang();
  return (
    <BrowserRouter>
      <AuthProvider>
        <RequestListProvider>
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
        </RequestListProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
