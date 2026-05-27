import { useEffect, useMemo, useRef, useState } from 'react';
import { createLocalOrder, fetchOrders, listSeedOrders, submitOrder, updateRemoteOrderStatus } from '../services/orderService';
import {
  getDefaultApplication,
  getDefaultWorkDraft,
  saveCompanionApplicationDraft,
  submitCompanionApplicationReview,
} from '../services/companionService';
import { isApiEnabled } from '../services/apiClient';
import { defaultBookingSettings } from '../data/bookingSettings';
import type { AppOrder, CompanionApplication, CompanionBookingSettings, PublishedWorkDraft } from '../types/domain';
import { getOrderSteps, orderStatusText } from '../utils/status';
import { AppDataContext, type AppData } from './appDataContext';

const storageKey = 'pp-app-data-v1';
const defaultApplication = getDefaultApplication();
const defaultWorkDraft = getDefaultWorkDraft();
const defaultOrders = listSeedOrders();

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const initial = loadInitialData();
  const [orders, setOrders] = useState<AppOrder[]>(initial.orders);
  const [application, setApplication] = useState<CompanionApplication>(initial.application);
  const [bookingSettings, setBookingSettings] = useState<CompanionBookingSettings>(initial.bookingSettings);
  const [workDraft, setWorkDraft] = useState<PublishedWorkDraft>(initial.workDraft);
  const initialDataRef = useRef({ application, bookingSettings, workDraft });

  useEffect(() => {
    if (!isApiEnabled()) return;

    let mounted = true;
    fetchOrders().then((serverOrders) => {
      if (!mounted || serverOrders.length === 0) return;
      setOrders(serverOrders);
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          orders: serverOrders,
          ...initialDataRef.current,
        }),
      );
    });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AppData>(() => {
    function persist(next: Partial<Pick<AppData, 'orders' | 'application' | 'bookingSettings' | 'workDraft'>>) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          orders: next.orders ?? orders,
          application: next.application ?? application,
          bookingSettings: next.bookingSettings ?? bookingSettings,
          workDraft: next.workDraft ?? workDraft,
        }),
      );
    }

    return {
      orders,
      application,
      bookingSettings,
      workDraft,
      createOrder: (orderInput) => {
        const order = createLocalOrder(orderInput);
        const nextOrders = [order, ...orders];
        setOrders(nextOrders);
        persist({ orders: nextOrders });
        if (isApiEnabled()) {
          void submitOrder(orderInput).then((serverOrder) => {
            setOrders((currentOrders) => {
              const syncedOrders = currentOrders.map((currentOrder) => (currentOrder.id === order.id ? serverOrder : currentOrder));
              localStorage.setItem(storageKey, JSON.stringify({ orders: syncedOrders, application, bookingSettings, workDraft }));
              return syncedOrders;
            });
          });
        }
        return order;
      },
      updateOrderStatus: (orderId, status) => {
        const steps = getOrderSteps(status);
        const nextOrders = orders.map((order) =>
          order.id === orderId
            ? {
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
          void updateRemoteOrderStatus(orderId, status).then((serverOrder) => {
            if (!serverOrder) return;
            setOrders((currentOrders) => {
              const syncedOrders = currentOrders.map((currentOrder) => (currentOrder.id === serverOrder.id ? serverOrder : currentOrder));
              localStorage.setItem(storageKey, JSON.stringify({ orders: syncedOrders, application, bookingSettings, workDraft }));
              return syncedOrders;
            });
          });
        }
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
        const nextSettings = { ...settings, updatedAt: new Date().toISOString() };
        setBookingSettings(nextSettings);
        persist({ bookingSettings: nextSettings });
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
  }, [application, bookingSettings, orders, workDraft]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function loadInitialData() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { orders: defaultOrders, application: defaultApplication, bookingSettings: defaultBookingSettings, workDraft: defaultWorkDraft };
    }

    const parsed = JSON.parse(raw) as {
      orders?: AppOrder[];
      application?: Partial<CompanionApplication>;
      bookingSettings?: Partial<CompanionBookingSettings>;
      workDraft?: Partial<PublishedWorkDraft>;
    };

    return {
      orders: parsed.orders?.length ? mergeSeedOrders(parsed.orders) : defaultOrders,
      application: { ...defaultApplication, ...parsed.application },
      bookingSettings: mergeBookingSettings(parsed.bookingSettings),
      workDraft: mergeWorkDraft(parsed.workDraft),
    };
  } catch {
    return { orders: defaultOrders, application: defaultApplication, bookingSettings: defaultBookingSettings, workDraft: defaultWorkDraft };
  }
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
