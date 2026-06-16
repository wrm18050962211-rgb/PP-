import { useEffect, useMemo, useRef, useState } from 'react';
import { listSeedOrders } from '../services/orderService';
import {
  getDefaultApplication,
  getDefaultWorkDraft,
  saveCompanionApplicationDraft,
  submitCompanionApplicationReview,
} from '../services/companionService';
import { fetchAuthSession } from '../services/authService';
import { isApiEnabled } from '../services/apiClient';
import { readDomainJson, writeDomainJson } from '../services/scopedStorage';
import { createLedgerOrder, listLedgerOrdersForSession, updateLedgerOrderFunding, updateLedgerOrderStatus } from '../services/virtualOrderLedger';
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

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const initial = loadInitialData();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [orders, setOrders] = useState<AppOrder[]>(initial.orders);
  const [application, setApplication] = useState<CompanionApplication>(initial.application);
  const [bookingSettings, setBookingSettings] = useState<CompanionBookingSettings>(initial.bookingSettings);
  const [workDraft, setWorkDraft] = useState<PublishedWorkDraft>(initial.workDraft);
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
        if (!mounted || serverOrders.length === 0) return;
        setOrders(serverOrders);
        persistSnapshot(serverOrders, initialDataRef.current, nextSession.role);
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
        if (serverOrders.length === 0) return;
        setOrders(serverOrders);
        persistSnapshot(serverOrders, initialDataRef.current, nextSession.role);
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
      if (!mounted || serverOrders.length === 0) return;
      setOrders(serverOrders);
      persistSnapshot(serverOrders, initialDataRef.current, session.role);
    });

    return () => {
      mounted = false;
    };
  }, [session?.role]);

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
      createOrder: (orderInput, initialStatus) => {
        const order = createLedgerOrder(orderInput, session, initialStatus);
        const nextOrders = [order, ...orders];
        setOrders(nextOrders);
        persist({ orders: nextOrders });
        return order;
      },
      updateOrderStatus: (orderId, status) => {
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
  }, [application, bookingSettings, orders, session, workDraft]);

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

async function refreshOrders(_role: UserRole) {
  return [];
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
