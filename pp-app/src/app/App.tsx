import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { EntryRedirect } from '../features/auth/AuthPages';
import { AdminLoginPage, RequireAdmin } from '../features/auth/AdminAuthPages';
import { mobileRouteElements } from './MobileApp';

const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {mobileRouteElements(false)}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="*" element={<EntryRedirect />} />
      </Routes>
    </Suspense>
  );
}
