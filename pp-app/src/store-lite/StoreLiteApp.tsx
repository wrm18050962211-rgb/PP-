import { lazy, Suspense } from 'react';
import { Aperture, CalendarDays, Home, UserRound } from 'lucide-react';
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
  const { pathname } = useLocation();
  const showBottomNav = ['/', '/photographers', '/bookings', '/me'].includes(pathname);
  const darkPage = pathname === '/'
    || pathname === '/photographers'
    || pathname.startsWith('/works/')
    || /^\/photographers\/[^/]+$/.test(pathname);

  return (
    <div className={darkPage ? 'min-h-dvh bg-[#050505]' : 'min-h-dvh bg-[#f7f7f5]'}>
      <main className={`mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(0,0,0,0.28)] ${darkPage ? 'bg-[#050505] text-white' : 'bg-[#f7f7f5] text-zinc-950'} ${showBottomNav ? 'pb-24' : ''}`}>
        <Outlet />
      </main>
      {showBottomNav ? (
        <nav className="pointer-events-none fixed inset-x-0 bottom-3 z-40 mx-auto flex max-w-md justify-center px-4 pb-[env(safe-area-inset-bottom)]" aria-label="主要导航">
          <div className="pointer-events-auto grid h-14 w-[304px] max-w-full grid-cols-4 items-center rounded-full border border-white/10 bg-black/[0.84] px-3 shadow-[0_18px_50px_rgba(0,0,0,0.46)] backdrop-blur-2xl">
            <StoreLiteTab to="/" end icon={Home} label="发现" />
            <StoreLiteTab to="/photographers" icon={Aperture} label="找摄影师" />
            <StoreLiteTab to="/bookings" icon={CalendarDays} label="预约" />
            <StoreLiteTab to="/me" icon={UserRound} label="我的" />
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function StoreLiteTab({ to, end, icon: Icon, label }: { to: string; end?: boolean; icon: typeof Home; label: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `mx-auto flex h-11 w-12 items-center justify-center rounded-full transition ${isActive ? 'bg-white/[0.15] text-white' : 'text-white/[0.52]'}`
      }
      aria-label={label}
      title={label}
    >
      {({ isActive }) => (
        <Icon size={22} strokeWidth={isActive ? 2.6 : 2.2} />
      )}
    </NavLink>
  );
}
