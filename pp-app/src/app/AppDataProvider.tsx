import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchOrders, listSeedOrders, submitOrder, updateRemoteOrderStatus } from '../services/orderService';
import {
  getDefaultApplication,
  getDefaultWorkDraft,
  saveCompanionApplicationDraft,
  submitCompanionApplicationReview,
} from '../services/companionService';
import { completeRoleRegistration, fetchAuthSession } from '../services/authService';
import { isApiEnabled, isProductionAppEnv } from '../services/apiClient';
import { readDomainJson, writeDomainJson } from '../services/scopedStorage';
import { createLedgerOrder, listLedgerOrdersForSession, updateLedgerOrderFunding, updateLedgerOrderStatus, upsertLedgerOrder } from '../services/virtualOrderLedger';
import { defaultBookingSettings } from '../data/bookingSettings';
import { saveCompanionBookingSettings } from '../services/companionBookingSettingsService';
import type { AppOrder, CompanionApplication, CompanionBookingSettings, PublishedWorkDraft } from '../types/domain';
import type { AuthSession, UserRole } from '../types/api';
import { getOrderSteps, orderStatusText } from '../utils/status';
import { AppDataContext, type AppData } from './appDataContext';

const storageKey = 'app-data-v1';
const defaultApplication = getDefaultApplication();
const defaultWorkDraft = getDefaultWorkDraft();
const defaultOrders = listSeedOrders();
const orderCreateFailedMessage = '订单创建失败，请检查网络后重试。';
const orderCreateLocalFallbackMessage = '订单没有同步到服务端，已先保存在本机。请稍后重新确认。';
const orderStatusFailedMessage = '订单状态更新失败，请检查网络后重试。';
const orderStatusLocalFallbackMessage = '订单状态没有同步到服务端，已先保存在本机。';
const orderStatusRestoredMessage = '订单状态没有同步成功，已恢复为服务端最新状态。';
const orderRefreshFailedMessage = '订单同步失败，请检查网络后重试。';

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const initial = loadInitialData();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [orders, setOrders] = useState<AppOrder[]>(initial.orders);
  const [application, setApplication] = useState<CompanionApplication>(initial.application);
  const [bookingSettings, setBookingSettings] = useState<CompanionBookingSettings>(initial.bookingSettings);
  const [workDraft, setWorkDraft] = useState<PublishedWorkDraft>(initial.workDraft);
  const [orderActionError, setOrderActionError] = useState('');
  const initialDataRef = useRef({ application, bookingSettings, workDraft });

  useEffect(() => {
    let mounted = true;
    fetchAuthSession().then((nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      const scopedInitial = loadInitialData(nextSession.role, nextSession);
      setOrders(scopedInitial.orders);
      setApplication(scopedInitial.application);
      setBookingSettings(scopedInitial.bookingSettings);
      setWorkDraft(scopedInitial.workDraft);
      return refreshOrders(nextSession.role).then((serverOrders) => {
        if (!mounted) return;
        setOrderActionError('');
        if (serverOrders.length === 0) return;
        setOrders(serverOrders);
        persistSnapshot(serverOrders, initialDataRef.current, nextSession.role);
      }).catch(() => {
        if (mounted) setOrderActionError(orderRefreshFailedMessage);
      });
    });

    function handleSessionChanged(event: Event) {
      const nextSession = (event as CustomEvent<AuthSession>).detail;
      setSession(nextSession);
      const scopedInitial = loadInitialData(nextSession.role, nextSession);
      setOrders(scopedInitial.orders);
      setApplication(scopedInitial.application);
      setBookingSettings(scopedInitial.bookingSettings);
      setWorkDraft(scopedInitial.workDraft);
      void refreshOrders(nextSession.role).then((serverOrders) => {
        setOrderActionError('');
        if (serverOrders.length === 0) return;
        setOrders(serverOrders);
        persistSnapshot(serverOrders, initialDataRef.current, nextSession.role);
      }).catch(() => {
        setOrderActionError(orderRefreshFailedMessage);
      });
    }

    window.addEventListener('pp-auth-session-changed', handleSessionChanged);

    return () => {
      mounted = false;
      window.removeEventListener('pp-auth-session-changed', handleSessionChanged);
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    let mounted = true;
    refreshOrders(session.role).then((serverOrders) => {
      if (!mounted) return;
      setOrderActionError('');
      if (serverOrders.length === 0) return;
      setOrders(serverOrders);
      persistSnapshot(serverOrders, initialDataRef.current, session.role);
    }).catch(() => {
      if (mounted) setOrderActionError(orderRefreshFailedMessage);
    });

    return () => {
      mounted = false;
    };
  }, [session]);

  const value = useMemo<AppData>(() => {
    function persist(next: Partial<Pick<AppData, 'orders' | 'application' | 'bookingSettings' | 'workDraft'>>) {
      writeDomainJson(storageKey, {
        orders: next.orders ?? orders,
        application: next.application ?? application,
        bookingSettings: next.bookingSettings ?? bookingSettings,
        workDraft: next.workDraft ?? workDraft,
      }, session?.role);
    }

    return {
      session,
      orders,
      application,
      bookingSettings,
      workDraft,
      orderActionError,
      clearOrderActionError: () => setOrderActionError(''),
      createOrder: async (orderInput, initialStatus) => {
        setOrderActionError('');
        if (isApiEnabled()) {
          try {
            const serverOrder = await submitOrder(orderInput);
            if (serverOrder.id.startsWith('local-')) throw new Error('Order API returned local fallback');
            upsertLedgerOrder(serverOrder);
            setOrders((currentOrders) => {
              const reconciledOrders = mergeUpdatedOrder(currentOrders, serverOrder);
              persistSnapshot(reconciledOrders, { application, bookingSettings, workDraft }, session?.role);
              return reconciledOrders;
            });
            return serverOrder;
          } catch {
            if (isProductionAppEnv) {
              setOrderActionError(orderCreateFailedMessage);
              throw new Error('Create order API failed.');
            }
            setOrderActionError(orderCreateLocalFallbackMessage);
          }
        }

        const order = createLedgerOrder(orderInput, session, initialStatus);
        const nextOrders = [order, ...orders];
        setOrders(nextOrders);
        persist({ orders: nextOrders });
        return order;
      },
      updateOrderStatus: (orderId, status) => {
        const previousOrders = orders;
        setOrderActionError('');
        const ledgerOrder = updateLedgerOrderStatus(orderId, status);
        const steps = getOrderSteps(status);
        const nextOrders = orders.map((order) =>
          order.id === orderId
            ? ledgerOrder ?? {
                ...order,
                status,
                statusText: orderStatusText[status],
                ...steps,
              }
            : order,
        );
        setOrders(nextOrders);
        persist({ orders: nextOrders });
        if (isApiEnabled()) {
          void updateRemoteOrderStatus(orderId, status).then(async (serverOrder) => {
            if (!serverOrder) {
              const serverOrders = session ? await refreshOrders(session.role) : [];
              if (!serverOrders.length) {
                if (isProductionAppEnv) {
                  setOrders(previousOrders);
                  persist({ orders: previousOrders });
                  setOrderActionError(orderStatusFailedMessage);
                } else {
                  setOrderActionError(orderStatusLocalFallbackMessage);
                }
                return;
              }
              setOrderActionError(orderStatusRestoredMessage);
              setOrders(serverOrders);
              persistSnapshot(serverOrders, { application, bookingSettings, workDraft }, session?.role);
              return;
            }

            setOrderActionError('');
            upsertLedgerOrder(serverOrder);
            setOrders((currentOrders) => {
              const reconciledOrders = mergeUpdatedOrder(currentOrders, serverOrder);
              persistSnapshot(reconciledOrders, { application, bookingSettings, workDraft }, session?.role);
              return reconciledOrders;
            });
          }).catch(async () => {
            const serverOrders = session ? await refreshOrders(session.role).catch(() => []) : [];
            if (serverOrders.length) {
              setOrders(serverOrders);
              persistSnapshot(serverOrders, { application, bookingSettings, workDraft }, session?.role);
              setOrderActionError(orderStatusRestoredMessage);
              return;
            }
            if (isProductionAppEnv) {
              setOrders(previousOrders);
              persist({ orders: previousOrders });
              setOrderActionError(orderStatusFailedMessage);
              return;
            }
            setOrderActionError(orderStatusLocalFallbackMessage);
          });
        }
      },
      updateOrderFunding: (orderId, patch) => {
        const ledgerOrder = updateLedgerOrderFunding(orderId, patch);
        const nextOrders = orders.map((order) => (order.id === orderId ? ledgerOrder ?? { ...order, ...patch } : order));
        setOrders(nextOrders);
        persist({ orders: nextOrders });
      },
      saveApplication: (partial) => {
        const nextApplication = { ...application, ...partial, submitted: false, reviewStatus: '草稿' as const, updatedAt: new Date().toISOString() };
        setApplication(nextApplication);
        persist({ application: nextApplication });
        if (isApiEnabled()) void saveCompanionApplicationDraft(nextApplication);
      },
      submitApplication: () => {
        const nextApplication = { ...application, submitted: true, reviewStatus: '待审核' as const, updatedAt: new Date().toISOString() };
        setApplication(nextApplication);
        persist({ application: nextApplication });
        if (isApiEnabled()) {
          void submitCompanionApplicationReview(nextApplication).then((serverApplication) => {
            setApplication(serverApplication);
            persist({ application: serverApplication });
          });
        }
      },
      reviewApplication: (status) => {
        const nextApplication = { ...application, submitted: true, reviewStatus: status, updatedAt: new Date().toISOString() };
        setApplication(nextApplication);
        persist({ application: nextApplication });
        if (status === '已通过') {
          completeRoleRegistration('companion', {
            photographerName: nextApplication.nickname || 'Demo Photographer',
            photographerAvatarUrl: nextApplication.avatarImage,
          });
        }
      },
      saveBookingSettings: (settings) => {
        const companionId = session?.role === 'companion' ? session.companionId ?? settings.companionId : settings.companionId;
        const nextSettings = { ...settings, companionId, updatedAt: new Date().toISOString() };
        setBookingSettings(nextSettings);
        persist({ bookingSettings: nextSettings });
        if (session?.role === 'companion') saveCompanionBookingSettings(nextSettings, companionId);
      },
      saveWorkDraft: (partial) => {
        const nextDraft = { ...workDraft, ...partial, submitted: false, reviewStatus: '草稿' as const, updatedAt: new Date().toISOString() };
        setWorkDraft(nextDraft);
        persist({ workDraft: nextDraft });
      },
      submitWork: () => {
        const nextDraft = { ...workDraft, submitted: true, reviewStatus: '待审核' as const, updatedAt: new Date().toISOString() };
        setWorkDraft(nextDraft);
        persist({ workDraft: nextDraft });
      },
      reviewWork: (status) => {
        const nextDraft = { ...workDraft, submitted: true, reviewStatus: status, updatedAt: new Date().toISOString() };
        setWorkDraft(nextDraft);
        persist({ workDraft: nextDraft });
      },
    };
  }, [application, bookingSettings, orderActionError, orders, session, workDraft]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function loadInitialData(role?: UserRole, session?: AuthSession | null) {
  try {
    const parsed = readDomainJson<{
      orders?: AppOrder[];
      application?: Partial<CompanionApplication>;
      bookingSettings?: Partial<CompanionBookingSettings>;
      workDraft?: Partial<PublishedWorkDraft>;
    } | null>(storageKey, null, role);

    if (!parsed) {
      return { orders: session ? listLedgerOrdersForSession(session) : defaultOrders, application: defaultApplication, bookingSettings: defaultBookingSettings, workDraft: defaultWorkDraft };
    }

    return {
      orders: session ? listLedgerOrdersForSession(session) : parsed.orders?.length ? mergeSeedOrders(parsed.orders) : defaultOrders,
      application: { ...defaultApplication, ...parsed.application },
      bookingSettings: mergeBookingSettings(parsed.bookingSettings),
      workDraft: mergeWorkDraft(parsed.workDraft),
    };
  } catch {
    return { orders: defaultOrders, application: defaultApplication, bookingSettings: defaultBookingSettings, workDraft: defaultWorkDraft };
  }
}

async function refreshOrders(role: UserRole = 'consumer') {
  if (!isApiEnabled()) return [];
  if (role === 'admin') return [];
  const orderRole = role === 'companion' ? 'companion' : 'user';
  return fetchOrders(orderRole);
}

function persistSnapshot(
  orders: AppOrder[],
  rest: Pick<AppData, 'application' | 'bookingSettings' | 'workDraft'>,
  role?: UserRole,
) {
  writeDomainJson(storageKey, {
    orders,
    application: rest.application,
    bookingSettings: rest.bookingSettings,
    workDraft: rest.workDraft,
  }, role);
}

function mergeSeedOrders(storedOrders: AppOrder[]) {
  const seedIds = new Set(defaultOrders.map((order) => order.id));
  const localOrders = storedOrders.filter((order) => !seedIds.has(order.id));
  return [...localOrders, ...defaultOrders];
}

function mergeUpdatedOrder(orders: AppOrder[], updatedOrder: AppOrder) {
  const exists = orders.some((order) => order.id === updatedOrder.id);
  if (!exists) return [updatedOrder, ...orders];
  return orders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order));
}

function mergeBookingSettings(storedSettings?: Partial<CompanionBookingSettings>) {
  return {
    ...defaultBookingSettings,
    ...storedSettings,
    activities: storedSettings?.activities?.length ? storedSettings.activities : defaultBookingSettings.activities,
    timeRanges: storedSettings?.timeRanges?.length ? storedSettings.timeRanges : defaultBookingSettings.timeRanges,
    weeklyTimeRanges: storedSettings?.weeklyTimeRanges ?? defaultBookingSettings.weeklyTimeRanges,
    availableDates: storedSettings?.availableDates?.length ? storedSettings.availableDates : defaultBookingSettings.availableDates,
    repeatWeekdays: storedSettings?.repeatWeekdays?.length ? storedSettings.repeatWeekdays : defaultBookingSettings.repeatWeekdays,
  };
}

function mergeWorkDraft(storedDraft?: Partial<PublishedWorkDraft>) {
  const images = storedDraft?.images?.length ? storedDraft.images : defaultWorkDraft.images;

  return {
    ...defaultWorkDraft,
    ...storedDraft,
    images,
    coverImageId: storedDraft?.coverImageId && images.some((image) => image.id === storedDraft.coverImageId) ? storedDraft.coverImageId : images[0]?.id ?? '',
    tags: storedDraft?.tags?.length ? storedDraft.tags : defaultWorkDraft.tags,
    activity: storedDraft?.activity ?? defaultWorkDraft.activity,
  };
}
