import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLoginPage, RequireAdmin } from '../features/auth/AdminAuthPages';

const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));

export default function AdminApp() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Suspense>
  );
}
