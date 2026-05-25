export type ApiResponse<T> =
  | {
      success: true;
      data: T;
      error: null;
    }
  | {
      success: false;
      data: null;
      error: ApiError;
    };

export type ApiError = {
  code: string;
  message: string;
};

export type UserStatus = 'active' | 'restricted' | 'banned' | 'deleted';

export type CompanionStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'needs_change' | 'suspended' | 'banned';

export type AuditStatus = 'pending' | 'approved' | 'rejected' | 'needs_change' | 'cancelled';

export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'removed';

export type OrderStatus =
  | 'pending_payment'
  | 'paid_pending_confirm'
  | 'confirmed'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'refunding'
  | 'refunded'
  | 'disputed';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'closed';

export type RefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'rejected';

export type MessageRiskStatus = 'clean' | 'blocked' | 'flagged' | 'replaced';

export type ReportStatus = 'pending' | 'investigating' | 'resolved' | 'rejected';

export type SettlementStatus = 'pending' | 'frozen' | 'settled' | 'cancelled';

export type ReviewStatus = '草稿' | '待审核' | '已通过' | '需修改';

export type Money = {
  amountCents: number;
  amountText: string;
};

export type User = {
  id: string;
  phone?: string;
  nickname: string;
  avatarUrl?: string;
  gender: 'female' | 'male' | 'unknown' | string;
  city?: string;
  status: UserStatus;
  isCompanion: boolean;
};

export type PostImage = {
  id: string;
  url: string;
  width?: number;
  height?: number;
  sortOrder: number;
};

export type AvailabilitySlot = {
  id: string;
  label: string;
  dateLabel: string;
  timeLabel: string;
  startAt: string;
  endAt: string;
  status: 'available' | 'locked' | 'booked' | 'unavailable';
};

export type ActivityPricing = {
  id: string;
  name: string;
  durationMinutes: number;
  durationLabel: string;
  priceCents: number;
  priceText: string;
};

export type CompanionExtra = {
  id: string;
  name: string;
  unit: 'per_photo' | 'per_order' | 'per_hour' | string;
  unitLabel: string;
  priceCents: number;
  priceText: string;
};

export type BookingDurationMinutes = 60 | 90 | 120 | 240;

export type RepeatWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BookingTimeRange = {
  id: string;
  startTime: string;
  endTime: string;
};

export type ActivityPriceSetting = {
  id: string;
  name: string;
  enabled: boolean;
  durationMinutes: BookingDurationMinutes;
  basePriceCents: number;
};

export type CompanionBookingSettings = {
  companionId: string;
  availableDates: string[];
  timeRanges: BookingTimeRange[];
  repeatEnabled: boolean;
  repeatWeekdays: RepeatWeekday[];
  temporaryAccepting: boolean;
  activities: ActivityPriceSetting[];
  retouchPriceCents: number;
  rushPriceCents: number;
  shortVideoPriceCents: number;
  updatedAt: string;
};

export type Companion = {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  photo: string;
  bio: string;
  gender: string;
  baseCity: string;
  status: CompanionStatus;
  serviceEnabled: boolean;
  ratingAvg: number;
  ratingCount: number;
  tags: string[];
  safetyBadges: string[];
  areas: string[];
  slots: AvailabilitySlot[];
  activities: ActivityPricing[];
  extras: CompanionExtra[];
};

export type FeedPost = {
  id: string;
  location: string;
  timeLabel: string;
  caption: string;
  styleTags: string[];
  activity: string;
  images: PostImage[];
  companion: Companion;
};

export type FeedPostCard = FeedPost;

export type OrderStep = {
  label: string;
  completed: boolean;
};

export type AppOrder = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  statusText: string;
  title: string;
  time: string;
  place: string;
  amountCents: number;
  amountText: string;
  companion: string;
  companionId: string;
  postId: string;
  activityId?: string;
  activityName?: string;
  slotId?: string;
  startAt?: string;
  endAt?: string;
  dateLabel?: string;
  timeLabel?: string;
  durationMinutes?: number;
  durationLabel?: string;
  addOns?: OrderAddOnInput[];
  createdAt: string;
  steps: string[];
  currentStep: number;
};

export type OrderAddOnInput = {
  extraId: string;
  name: string;
  unitLabel: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type CreateOrderInput = {
  title: string;
  time: string;
  place: string;
  amountCents: number;
  companion: string;
  companionId: string;
  postId: string;
  activityId: string;
  activityName: string;
  slotId: string;
  startAt: string;
  endAt: string;
  dateLabel: string;
  timeLabel: string;
  durationMinutes: number;
  durationLabel: string;
  addOns: OrderAddOnInput[];
};

export type Message = {
  id: string;
  from: 'user' | 'companion' | 'admin' | 'system';
  text: string;
  sentAt: string;
  riskStatus: MessageRiskStatus;
};

export type Conversation = {
  id: string;
  orderId: string;
  orderNo: string;
  status: 'active' | 'restricted' | 'closed';
  safetyNotice: string;
  messages: Message[];
};

export type CompanionApplication = {
  nickname: string;
  gender: string;
  ageRange: string;
  phone: string;
  phoneVerified: boolean;
  realName: string;
  idType: 'id_card' | 'passport' | 'other';
  idNumber: string;
  idFrontImage: string;
  idBackImage: string;
  faceCheckStatus: 'not_started' | 'processing' | 'passed';
  city: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  avatarImage: string;
  lifePhotos: string[];
  introVideo: string;
  introVideoText: string;
  strengths: string;
  equipment: string;
  portfolioSamples: string[];
  showIntroVideo: boolean;
  rulesConfirmed: boolean;
  bio: string;
  price: string;
  extra: string;
  areas: string[];
  streets: string[];
  attractions: string[];
  metroStations: string[];
  serviceRadiusKm: number;
  services: string[];
  rejectedServices: string[];
  tags: string[];
  styleTags: string[];
  interactionTags: string[];
  submitted: boolean;
  reviewStatus: ReviewStatus;
  updatedAt: string;
};

export type PublishedWorkDraft = {
  location: string;
  timeLabel: string;
  caption: string;
  tags: string[];
  submitted: boolean;
  reviewStatus: ReviewStatus;
  updatedAt: string;
};

export type CompanionDashboard = {
  weeklyEstimatedCents: number;
  pendingCents: number;
  availableCents: number;
  orderStats: string[];
};

export type AdminDashboardData = {
  metrics: Array<{ label: string; value: string }>;
  moduleCards: Array<{ title: string; desc: string }>;
};
