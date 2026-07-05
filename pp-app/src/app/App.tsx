import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ConsumerShell } from '../layouts/ConsumerShell';
import { RoleShell } from '../layouts/RoleShell';
import { AccountSettingsPage, EntryRedirect, GuestOnly, LoginPage, RegisterPage, RequireAuth, RequireRegistrationDraft, RequireRole } from '../features/auth/AuthPages';
import { getRegisteredAccount } from '../services/authService';

const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const CompanionOnboarding = lazy(() => import('../features/companion/CompanionOnboarding').then((module) => ({ default: module.CompanionOnboarding })));
const CompanionBookingSettingsPage = lazy(() => import('../features/companion/CompanionBookingSettingsPage').then((module) => ({ default: module.CompanionBookingSettingsPage })));
const CompanionIncomePage = lazy(() => import('../features/companion/CompanionIncomePage').then((module) => ({ default: module.CompanionIncomePage })));
const CompanionComingSoonPage = lazy(() => import('../features/companion/CompanionComingSoonPage').then((module) => ({ default: module.CompanionComingSoonPage })));
const CompanionConsultationsPage = lazy(() => import('../features/companion/CompanionConsultationsPage').then((module) => ({ default: module.CompanionConsultationsPage })));
const CompanionOrdersPage = lazy(() => import('../features/companion/CompanionOrdersPage').then((module) => ({ default: module.CompanionOrdersPage })));
const CompanionPackageSettings = lazy(() => import('../features/companion/CompanionPackageSettings').then((module) => ({ default: module.CompanionPackageSettings })));
const CompanionProfileEdit = lazy(() => import('../features/companion/CompanionProfileEdit').then((module) => ({ default: module.CompanionProfileEdit })));
const PublishPost = lazy(() => import('../features/companion/PublishPost').then((module) => ({ default: module.PublishPost })));
const CompanionStudio = lazy(() => import('../features/companion/CompanionStudio').then((module) => ({ default: module.CompanionStudio })));
const ServiceRangeSettings = lazy(() => import('../features/companion/ServiceRangeSettings').then((module) => ({ default: module.ServiceRangeSettings })));
const CheckoutPage = lazy(() => import('../features/user/CheckoutPage').then((module) => ({ default: module.CheckoutPage })));
const CompanionFinderPage = lazy(() => import('../features/user/CompanionFinderPage').then((module) => ({ default: module.CompanionFinderPage })));
const CreatorOnboarding = lazy(() => import('../features/user/CreatorOnboarding').then((module) => ({ default: module.CreatorOnboarding })));
const CreatorProfileEditPage = lazy(() => import('../features/user/CreatorProfileEditPage').then((module) => ({ default: module.CreatorProfileEditPage })));
const CreatorProfilePage = lazy(() => import('../features/user/CreatorProfilePage').then((module) => ({ default: module.CreatorProfilePage })));
const HomeFeed = lazy(() => import('../features/user/HomeFeed').then((module) => ({ default: module.HomeFeed })));
const InquiriesPage = lazy(() => import('../features/user/InquiriesPage').then((module) => ({ default: module.InquiriesPage })));
const MessagesPage = lazy(() => import('../features/user/MessagesPage').then((module) => ({ default: module.MessagesPage })));
const MinePage = lazy(() => import('../features/user/MinePage').then((module) => ({ default: module.MinePage })));
const OrdersPage = lazy(() => import('../features/user/OrdersPage').then((module) => ({ default: module.OrdersPage })));
const PhotographerProfilePage = lazy(() => import('../features/user/PhotographerProfilePage').then((module) => ({ default: module.PhotographerProfilePage })));
const PostDetail = lazy(() => import('../features/user/PostDetail').then((module) => ({ default: module.PostDetail })));
const UserCollectionPage = lazy(() => import('../features/user/UserCollectionPage').then((module) => ({ default: module.UserCollectionPage })));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
      <Route path="/" element={<EntryRedirect />} />

      <Route
        path="/auth/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/auth/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />

      <Route
        path="/consumer/onboarding"
        element={
          <RequireRegistrationDraft role="consumer">
            <CreatorOnboarding />
          </RequireRegistrationDraft>
        }
      />
      <Route
        path="/companion/onboarding"
        element={
          <RequireRegistrationDraft role="companion">
            <CompanionOnboarding />
          </RequireRegistrationDraft>
        }
      />

      <Route
        path="/consumer"
        element={
          <RequireAuth>
            <ConsumerShell />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <RequireRole role="consumer" fallback="/companion">
              <HomeFeed />
            </RequireRole>
          }
        />
        <Route
          path="companions"
          element={
            <RequireRole role="consumer" fallback="/companion">
              <CompanionFinderPage />
            </RequireRole>
          }
        />
        <Route path="same-style" element={<Navigate to="/consumer" replace />} />
        <Route path="post/:postId" element={<PostDetail />} />
        <Route path="creator/:creatorId" element={<CreatorProfilePage />} />
        <Route path="photographer/:photographerId" element={<PhotographerProfilePage />} />
        <Route
          path="checkout/:postId"
          element={
            <RequireRole role="consumer" fallback="/companion">
              <CheckoutPage />
            </RequireRole>
          }
        />
        <Route
          path="profile"
          element={
            <RequireRole role="consumer" fallback="/companion/mine">
              <CreatorProfileEditPage />
            </RequireRole>
          }
        />
        <Route
          path="inquiries"
          element={
            <RequireRole role="consumer" fallback="/companion/mine">
              <InquiriesPage />
            </RequireRole>
          }
        />
        <Route
          path="orders"
          element={
            <RequireRole role="consumer" fallback="/companion/orders">
              <OrdersPage />
            </RequireRole>
          }
        />
        <Route
          path="likes"
          element={
            <RequireRole role="consumer" fallback="/companion/mine">
              <UserCollectionPage mode="likes" />
            </RequireRole>
          }
        />
        <Route
          path="favorites"
          element={
            <RequireRole role="consumer" fallback="/companion/mine">
              <UserCollectionPage mode="favorites" />
            </RequireRole>
          }
        />
        <Route
          path="following"
          element={
            <RequireRole role="consumer" fallback="/companion/mine">
              <UserCollectionPage mode="following" />
            </RequireRole>
          }
        />
        <Route
          path="messages"
          element={
            <RequireRole role="consumer" fallback="/companion/messages">
              <MessagesPage />
            </RequireRole>
          }
        />
        <Route
          path="messages/:orderId"
          element={
            <RequireRole role="consumer" fallback="/companion/messages">
              <MessagesPage />
            </RequireRole>
          }
        />
        <Route
          path="mine"
          element={
            <RequireRole role="consumer" fallback="/companion/mine">
              <MinePage />
            </RequireRole>
          }
        />
      </Route>

      <Route
        path="/companion"
        element={
          <RequireAuth>
            <RequireRole role="companion" fallback="/consumer/mine">
              <RoleShell />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<HomeFeed />} />
        <Route path="creators" element={<CompanionComingSoonPage />} />
        <Route path="post/:postId" element={<PostDetail />} />
        <Route path="creator/:creatorId" element={<CreatorProfilePage />} />
        <Route path="photographer/:photographerId" element={<PhotographerProfilePage />} />
        <Route path="likes" element={<UserCollectionPage mode="likes" basePath="/companion" />} />
        <Route path="favorites" element={<UserCollectionPage mode="favorites" basePath="/companion" />} />
        <Route path="following" element={<UserCollectionPage mode="following" basePath="/companion" />} />
        <Route path="consultations" element={<CompanionConsultationsPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:orderId" element={<MessagesPage />} />
        <Route path="mine" element={<CompanionStudio />} />
        <Route path="booking-settings" element={<CompanionBookingSettingsPage />} />
        <Route path="profile" element={<CompanionProfileEdit />} />
        <Route path="packages" element={<CompanionPackageSettings />} />
        <Route path="service-range" element={<ServiceRangeSettings />} />
        <Route path="publish" element={<PublishPost />} />
        <Route path="orders" element={<CompanionOrdersPage />} />
        <Route path="income" element={<CompanionIncomePage />} />
      </Route>

      <Route path="/admin" element={<AdminDashboard />} />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <AccountSettingsPage />
          </RequireAuth>
        }
      />

      <Route path="/post/:postId" element={<LegacyConsumerRedirect target="post" />} />
      <Route path="/checkout/:postId" element={<LegacyConsumerRedirect target="checkout" />} />
      <Route path="/orders" element={<LegacyRoleRedirect target="orders" />} />
      <Route path="/messages" element={<LegacyRoleRedirect target="messages" />} />
      <Route path="/mine" element={<LegacyRoleRedirect target="mine" />} />
        <Route path="*" element={<EntryRedirect />} />
      </Routes>
    </Suspense>
  );
}

function LegacyConsumerRedirect({ target }: { target: 'post' | 'checkout' }) {
  const { postId } = useParams();
  return <Navigate to={`/consumer/${target}/${postId ?? ''}`} replace />;
}

function LegacyRoleRedirect({ target }: { target: 'orders' | 'messages' | 'mine' }) {
  const role = getRegisteredAccount()?.role;
  const basePath = role === 'companion' ? '/companion' : '/consumer';
  return <Navigate to={`${basePath}/${target}`} replace />;
}
