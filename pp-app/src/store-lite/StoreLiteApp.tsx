import { lazy, Suspense } from 'react';
import { Aperture, CalendarDays, Images, UserRound } from 'lucide-react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useStoreLiteAuth } from './StoreLiteAuth';
import { StoreLiteLoading } from './StoreLiteUi';

const StoreLiteDiscoverPage = lazy(() => import('./pages/StoreLiteBrowsePages').then((module) => ({ default: module.StoreLiteDiscoverPage })));
const StoreLitePhotographersPage = lazy(() => import('./pages/StoreLiteBrowsePages').then((module) => ({ default: module.StoreLitePhotographersPage })));
const StoreLiteWorkPage = lazy(() => import('./pages/StoreLiteBrowsePages').then((module) => ({ default: module.StoreLiteWorkPage })));
const StoreLitePhotographerPage = lazy(() => import('./pages/StoreLiteBrowsePages').then((module) => ({ default: module.StoreLitePhotographerPage })));
const StoreLiteBookingFormPage = lazy(() => import('./pages/StoreLiteBookingPages').then((module) => ({ default: module.StoreLiteBookingFormPage })));
const StoreLiteBookingsPage = lazy(() => import('./pages/StoreLiteBookingPages').then((module) => ({ default: module.StoreLiteBookingsPage })));
const StoreLiteBookingDetailPage = lazy(() => import('./pages/StoreLiteBookingPages').then((module) => ({ default: module.StoreLiteBookingDetailPage })));
const StoreLiteLoginPage = lazy(() => import('./pages/StoreLiteAccountPages').then((module) => ({ default: module.StoreLiteLoginPage })));
const StoreLiteAccountPage = lazy(() => import('./pages/StoreLiteAccountPages').then((module) => ({ default: module.StoreLiteAccountPage })));
const StoreLiteComplianceCenterPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteComplianceCenterPage })));
const StoreLiteUserRequestsPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteUserRequestsPage })));
const StoreLiteUserRequestDetailPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteUserRequestDetailPage })));
const StoreLiteContentReportPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteContentReportPage })));
const StoreLiteContentReportsPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteContentReportsPage })));
const StoreLiteContentReportDetailPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteContentReportDetailPage })));
const StoreLiteBlockedCompanionsPage = lazy(() => import('./pages/StoreLiteCompliancePages').then((module) => ({ default: module.StoreLiteBlockedCompanionsPage })));

export function StoreLiteApp() {
  return (
    <Suspense fallback={<StoreLiteLoading label="页面加载中" />}>
      <Routes>
        <Route element={<StoreLiteShell />}>
          <Route index element={<StoreLiteDiscoverPage />} />
          <Route path="photographers" element={<StoreLitePhotographersPage />} />
          <Route path="works/:postId" element={<StoreLiteWorkPage />} />
          <Route path="photographers/:photographerId" element={<StoreLitePhotographerPage />} />
          <Route
            path="photographers/:photographerId/request"
            element={
              <RequireStoreLiteSession>
                <StoreLiteBookingFormPage />
              </RequireStoreLiteSession>
            }
          />
          <Route
            path="bookings"
            element={
              <RequireStoreLiteSession>
                <StoreLiteBookingsPage />
              </RequireStoreLiteSession>
            }
          />
          <Route
            path="bookings/:bookingRequestId"
            element={
              <RequireStoreLiteSession>
                <StoreLiteBookingDetailPage />
              </RequireStoreLiteSession>
            }
          />
          <Route path="compliance" element={<RequireStoreLiteSession><StoreLiteComplianceCenterPage /></RequireStoreLiteSession>} />
          <Route path="compliance/requests" element={<RequireStoreLiteSession><StoreLiteUserRequestsPage /></RequireStoreLiteSession>} />
          <Route path="compliance/requests/:userRequestId" element={<RequireStoreLiteSession><StoreLiteUserRequestDetailPage /></RequireStoreLiteSession>} />
          <Route path="compliance/reports" element={<RequireStoreLiteSession><StoreLiteContentReportsPage /></RequireStoreLiteSession>} />
          <Route path="compliance/reports/:contentReportId" element={<RequireStoreLiteSession><StoreLiteContentReportDetailPage /></RequireStoreLiteSession>} />
          <Route path="compliance/blocked" element={<RequireStoreLiteSession><StoreLiteBlockedCompanionsPage /></RequireStoreLiteSession>} />
          <Route path="safety/report/:targetType/:targetId" element={<RequireStoreLiteSession><StoreLiteContentReportPage /></RequireStoreLiteSession>} />
          <Route path="me" element={<StoreLiteAccountPage />} />
        </Route>
        <Route path="login" element={<StoreLiteLoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function RequireStoreLiteSession({ children }: { children: React.ReactNode }) {
  const { session, loading } = useStoreLiteAuth();
  const location = useLocation();
  if (loading) return <StoreLiteLoading label="正在确认登录状态" />;
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

function StoreLiteShell() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-[#f6f5f1] pb-24 text-zinc-950 shadow-2xl shadow-black/5">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid h-[calc(4.25rem+env(safe-area-inset-bottom))] max-w-md grid-cols-4 border-t border-zinc-200/80 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <StoreLiteTab to="/" end icon={Images} label="作品" />
        <StoreLiteTab to="/photographers" icon={Aperture} label="摄影师" />
        <StoreLiteTab to="/bookings" icon={CalendarDays} label="预约" />
        <StoreLiteTab to="/me" icon={UserRound} label="我的" />
      </nav>
    </main>
  );
}

function StoreLiteTab({ to, end, icon: Icon, label }: { to: string; end?: boolean; icon: typeof Images; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 text-[11px] font-black transition ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`grid h-8 w-10 place-items-center rounded-full ${isActive ? 'bg-zinc-950 text-white' : ''}`}>
            <Icon size={18} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}
