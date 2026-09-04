import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import {
  AccountSettingsPage,
  EntryRedirect,
  GuestOnly,
  LoginPage,
  RegisterPage,
  RequireRegistrationDraft,
  RequireRole,
} from '../features/auth/AuthPages';
import { ConsumerShell } from '../layouts/ConsumerShell';

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

export default function ConsumerMobileApp() {
  return (
    <Suspense fallback={<ConsumerRouteFallback />}>
      <Routes>
        <Route path="/" element={<EntryRedirect />} />
        <Route path="/auth/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/auth/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route
          path="/consumer/onboarding"
          element={<RequireRegistrationDraft role="consumer"><CreatorOnboarding /></RequireRegistrationDraft>}
        />
        <Route
          path="/consumer"
          element={<RequireRole role="consumer" fallback="/auth/login"><ConsumerShell /></RequireRole>}
        >
          <Route index element={<HomeFeed />} />
          <Route path="companions" element={<CompanionFinderPage />} />
          <Route path="same-style" element={<Navigate to="/consumer" replace />} />
          <Route path="post/:postId" element={<PostDetail />} />
          <Route path="creator/:creatorId" element={<CreatorProfilePage />} />
          <Route path="photographer/:photographerId" element={<PhotographerProfilePage />} />
          <Route path="checkout/:postId" element={<CheckoutPage />} />
          <Route path="profile" element={<CreatorProfileEditPage />} />
          <Route path="inquiries" element={<InquiriesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="likes" element={<UserCollectionPage mode="likes" />} />
          <Route path="favorites" element={<UserCollectionPage mode="favorites" />} />
          <Route path="following" element={<UserCollectionPage mode="following" />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/:orderId" element={<MessagesPage />} />
          <Route path="mine" element={<MinePage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>

        <Route path="/settings" element={<Navigate to="/consumer/settings" replace />} />
        <Route path="/post/:postId" element={<LegacyConsumerRedirect target="post" />} />
        <Route path="/checkout/:postId" element={<LegacyConsumerRedirect target="checkout" />} />
        <Route path="/orders" element={<Navigate to="/consumer/orders" replace />} />
        <Route path="/messages" element={<Navigate to="/consumer/messages" replace />} />
        <Route path="/mine" element={<Navigate to="/consumer/mine" replace />} />
        <Route path="*" element={<EntryRedirect />} />
      </Routes>
    </Suspense>
  );
}

function ConsumerRouteFallback() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-[#050505]" aria-busy="true" aria-label="页面加载中">
      <div className="h-[calc(env(safe-area-inset-top)+4.5rem)] border-b border-white/8 bg-black px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex h-[4.5rem] items-center justify-between gap-4 animate-pulse">
          <div className="h-9 w-24 rounded-full bg-white/10" />
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-full bg-white/10" />
            <div className="h-9 w-9 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/5 animate-pulse">
        <div className="aspect-[0.74] bg-white/8" />
        <div className="aspect-[0.96] bg-white/10" />
        <div className="aspect-[0.96] bg-white/10" />
        <div className="aspect-[0.74] bg-white/8" />
      </div>
      <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto h-16 max-w-sm rounded-full bg-white/10 animate-pulse" />
    </main>
  );
}

function LegacyConsumerRedirect({ target }: { target: 'post' | 'checkout' }) {
  const { postId } = useParams();
  return <Navigate to={`/consumer/${target}/${postId ?? ''}`} replace />;
}
