import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ConsumerShell } from '../layouts/ConsumerShell';
import { RoleShell } from '../layouts/RoleShell';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { CompanionOnboarding } from '../features/companion/CompanionOnboarding';
import { CompanionBookingSettingsPage } from '../features/companion/CompanionBookingSettingsPage';
import { CompanionIncomePage } from '../features/companion/CompanionIncomePage';
import { CompanionOrdersPage } from '../features/companion/CompanionOrdersPage';
import { CompanionProfileEdit } from '../features/companion/CompanionProfileEdit';
import { CreatorFinderPage } from '../features/companion/CreatorFinderPage';
import { PublishPost } from '../features/companion/PublishPost';
import { CompanionStudio } from '../features/companion/CompanionStudio';
import { ServiceRangeSettings } from '../features/companion/ServiceRangeSettings';
import { CheckoutPage } from '../features/user/CheckoutPage';
import { CompanionFinderPage } from '../features/user/CompanionFinderPage';
import { CreatorProfilePage } from '../features/user/CreatorProfilePage';
import { HomeFeed } from '../features/user/HomeFeed';
import { MessagesPage } from '../features/user/MessagesPage';
import { MinePage } from '../features/user/MinePage';
import { OrdersPage } from '../features/user/OrdersPage';
import { PhotographerProfilePage } from '../features/user/PhotographerProfilePage';
import { PostDetail } from '../features/user/PostDetail';
import { UserCollectionPage } from '../features/user/UserCollectionPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/consumer" replace />} />

      <Route path="/consumer" element={<ConsumerShell />}>
        <Route index element={<HomeFeed />} />
        <Route path="companions" element={<CompanionFinderPage />} />
        <Route path="same-style" element={<Navigate to="/consumer" replace />} />
        <Route path="post/:postId" element={<PostDetail />} />
        <Route path="creator/:creatorId" element={<CreatorProfilePage />} />
        <Route path="photographer/:photographerId" element={<PhotographerProfilePage />} />
        <Route path="checkout/:postId" element={<CheckoutPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="likes" element={<UserCollectionPage mode="likes" />} />
        <Route path="favorites" element={<UserCollectionPage mode="favorites" />} />
        <Route path="following" element={<UserCollectionPage mode="following" />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:orderId" element={<MessagesPage />} />
        <Route path="mine" element={<MinePage />} />
      </Route>

      <Route path="/companion" element={<RoleShell />}>
        <Route index element={<HomeFeed />} />
        <Route path="creators" element={<CreatorFinderPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:orderId" element={<MessagesPage />} />
        <Route path="mine" element={<CompanionStudio />} />
        <Route path="onboarding" element={<CompanionOnboarding />} />
        <Route path="booking-settings" element={<CompanionBookingSettingsPage />} />
        <Route path="profile" element={<CompanionProfileEdit />} />
        <Route path="service-range" element={<ServiceRangeSettings />} />
        <Route path="publish" element={<PublishPost />} />
        <Route path="orders" element={<CompanionOrdersPage />} />
        <Route path="income" element={<CompanionIncomePage />} />
      </Route>

      <Route path="/admin" element={<AdminDashboard />} />

      <Route path="/post/:postId" element={<LegacyConsumerRedirect target="post" />} />
      <Route path="/checkout/:postId" element={<LegacyConsumerRedirect target="checkout" />} />
      <Route path="/orders" element={<Navigate to="/consumer/orders" replace />} />
      <Route path="/messages" element={<Navigate to="/consumer/messages" replace />} />
      <Route path="/mine" element={<Navigate to="/consumer/mine" replace />} />
      <Route path="*" element={<Navigate to="/consumer" replace />} />
    </Routes>
  );
}

function LegacyConsumerRedirect({ target }: { target: 'post' | 'checkout' }) {
  const { postId } = useParams();
  return <Navigate to={`/consumer/${target}/${postId ?? ''}`} replace />;
}
