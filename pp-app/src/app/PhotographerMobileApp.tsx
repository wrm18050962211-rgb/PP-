import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  AccountSettingsPage,
  EntryRedirect,
  GuestOnly,
  LoginPage,
  RegisterPage,
  RequireRegistrationDraft,
  RequireRole,
} from '../features/auth/AuthPages';
import { RoleShell } from '../layouts/RoleShell';

const CompanionOnboarding = lazy(() => import('../features/companion/CompanionOnboarding').then((module) => ({ default: module.CompanionOnboarding })));
const CompanionBookingSettingsPage = lazy(() => import('../features/companion/CompanionBookingSettingsPage').then((module) => ({ default: module.CompanionBookingSettingsPage })));
const CompanionIncomePage = lazy(() => import('../features/companion/CompanionIncomePage').then((module) => ({ default: module.CompanionIncomePage })));
const CompanionConsultationsPage = lazy(() => import('../features/companion/CompanionConsultationsPage').then((module) => ({ default: module.CompanionConsultationsPage })));
const CompanionOrdersPage = lazy(() => import('../features/companion/CompanionOrdersPage').then((module) => ({ default: module.CompanionOrdersPage })));
const CompanionPackageSettings = lazy(() => import('../features/companion/CompanionPackageSettings').then((module) => ({ default: module.CompanionPackageSettings })));
const CompanionProfileEdit = lazy(() => import('../features/companion/CompanionProfileEdit').then((module) => ({ default: module.CompanionProfileEdit })));
const PublishPost = lazy(() => import('../features/companion/PublishPost').then((module) => ({ default: module.PublishPost })));
const CompanionStudio = lazy(() => import('../features/companion/CompanionStudio').then((module) => ({ default: module.CompanionStudio })));
const ServiceRangeSettings = lazy(() => import('../features/companion/ServiceRangeSettings').then((module) => ({ default: module.ServiceRangeSettings })));
const CreatorProfilePage = lazy(() => import('../features/user/CreatorProfilePage').then((module) => ({ default: module.CreatorProfilePage })));
const HomeFeed = lazy(() => import('../features/user/HomeFeed').then((module) => ({ default: module.HomeFeed })));
const MessagesPage = lazy(() => import('../features/user/MessagesPage').then((module) => ({ default: module.MessagesPage })));
const PhotographerProfilePage = lazy(() => import('../features/user/PhotographerProfilePage').then((module) => ({ default: module.PhotographerProfilePage })));
const PostDetail = lazy(() => import('../features/user/PostDetail').then((module) => ({ default: module.PostDetail })));
const UserCollectionPage = lazy(() => import('../features/user/UserCollectionPage').then((module) => ({ default: module.UserCollectionPage })));

export default function PhotographerMobileApp() {
  return (
    <Suspense fallback={<PhotographerRouteFallback />}>
      <Routes>
        <Route path="/" element={<EntryRedirect />} />
        <Route path="/auth/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/auth/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route
          path="/companion/onboarding"
          element={<RequireRegistrationDraft role="companion"><CompanionOnboarding /></RequireRegistrationDraft>}
        />
        <Route
          path="/companion"
          element={<RequireRole role="companion" fallback="/auth/login"><RoleShell /></RequireRole>}
        >
          <Route index element={<HomeFeed />} />
          <Route path="creators" element={<Navigate to="/companion/consultations" replace />} />
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
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>

        <Route path="/settings" element={<Navigate to="/companion/settings" replace />} />
        <Route path="/post/:postId" element={<Navigate to="/companion" replace />} />
        <Route path="/orders" element={<Navigate to="/companion/orders" replace />} />
        <Route path="/messages" element={<Navigate to="/companion/messages" replace />} />
        <Route path="/mine" element={<Navigate to="/companion/mine" replace />} />
        <Route path="*" element={<EntryRedirect />} />
      </Routes>
    </Suspense>
  );
}

function PhotographerRouteFallback() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-[#f7f7f5] px-4 pt-[calc(env(safe-area-inset-top)+1rem)]" aria-busy="true" aria-label="页面加载中">
      <div className="h-24 animate-pulse rounded-2xl bg-zinc-200" />
      <div className="mt-4 h-52 animate-pulse rounded-2xl bg-zinc-200" />
      <div className="mt-4 h-40 animate-pulse rounded-2xl bg-zinc-200" />
    </main>
  );
}
