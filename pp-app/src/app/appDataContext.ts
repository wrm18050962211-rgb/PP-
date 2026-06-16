import { createContext } from 'react';
import {
  AppOrder,
  CompanionApplication,
  CompanionBookingSettings,
  CreateOrderInput,
  OrderStatus,
  PublishedWorkDraft,
} from '../types/domain';
import type { AuthSession } from '../types/api';

export type AppData = {
  session: AuthSession | null;
  orders: AppOrder[];
  application: CompanionApplication;
  bookingSettings: CompanionBookingSettings;
  workDraft: PublishedWorkDraft;
  createOrder: (order: CreateOrderInput, initialStatus?: OrderStatus) => AppOrder;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  updateOrderFunding: (orderId: string, patch: Partial<AppOrder>) => void;
  saveApplication: (application: Partial<CompanionApplication>) => void;
  submitApplication: () => void;
  reviewApplication: (status: CompanionApplication['reviewStatus']) => void;
  saveBookingSettings: (settings: CompanionBookingSettings) => void;
  saveWorkDraft: (draft: Partial<PublishedWorkDraft>) => void;
  submitWork: () => void;
  reviewWork: (status: PublishedWorkDraft['reviewStatus']) => void;
};

export const AppDataContext = createContext<AppData | null>(null);
