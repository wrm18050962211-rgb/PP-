import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ConsumerShell } from '../layouts/ConsumerShell';
import { RoleShell } from '../layouts/RoleShell';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { AccountSettingsPage, EntryRedirect, GuestOnly, LoginPage, RegisterPage, RequireAuth, RequireRegistrationDraft, RequireRole } from '../features/auth/AuthPages';
import { CompanionOnboarding } from '../features/companion/CompanionOnboarding';
import { CompanionBookingSettingsPage } from '../features/companion/CompanionBookingSettingsPage';
import { CompanionIncomePage } from '../features/companion/CompanionIncomePage';
import { CompanionComingSoonPage } from '../features/companion/CompanionComingSoonPage';
import { CompanionConsultationsPage } from '../features/companion/CompanionConsultationsPage';
import { CompanionOrdersPage } from '../features/companion/CompanionOrdersPage';
import { CompanionPackageSettings } from '../features/companion/CompanionPackageSettings';
import { CompanionProfileEdit } from '../features/companion/CompanionProfileEdit';
import { PublishPost } from '../features/companion/PublishPost';
import { CompanionStudio } from '../features/companion/CompanionStudio';
import { ServiceRangeSettings } from '../features/companion/ServiceRangeSettings';
import { CreatorDemoGate } from '../features/demo/CreatorDemoGate';
import { DemoQrPage } from '../features/demo/DemoQrPage';
import { CheckoutPage } from '../features/user/CheckoutPage';
import { CompanionFinderPage } from '../features/user/CompanionFinderPage';
import { CreatorOnboarding } from '../features/user/CreatorOnboarding';
import { CreatorProfileEditPage } from '../features/user/CreatorProfileEditPage';
import { CreatorProfilePage } from '../features/user/CreatorProfilePage';
import { HomeFeed } from '../features/user/HomeFeed';
import { InquiriesPage } from '../features/user/InquiriesPage';
import { MessagesPage } from '../features/user/MessagesPage';
import { MinePage } from '../features/user/MinePage';
import { OrdersPage } from '../features/user/OrdersPage';
import { PhotographerProfilePage } from '../features/user/PhotographerProfilePage';
import { PostDetail } from '../features/user/PostDetail';
import { UserCollectionPage } from '../features/user/UserCollectionPage';
import { getRegisteredAccount } from '../services/authService';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryRedirect />} />
      <Route path="/d" element={<CreatorDemoGate role="consumer" />} />
      <Route path="/d/creator" element={<CreatorDemoGate role="consumer" />} />
      <Route path="/d/photographer" element={<CreatorDemoGate role="companion" />} />
      <Route path="/qr-demo" element={<DemoQrPage />} />
      <Route path="/demo" element={<CreatorDemoGate role="consumer" />} />
      <Route path="/demo/creator" element={<CreatorDemoGate role="consumer" />} />
      <Route path="/demo/photographer" element={<CreatorDemoGate role="companion" />} />

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
