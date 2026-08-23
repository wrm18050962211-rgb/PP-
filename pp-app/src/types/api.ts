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
  requestId?: string;
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
export type CancellationActor = 'creator' | 'photographer' | 'admin';

export type CompositeOrderFeatureState = {
  domainEnabled: boolean;
  compositePaymentsEnabled: false;
};

export type MerchantStatus = 'draft' | 'pending_review' | 'active' | 'suspended' | 'closed';
export type MerchantLinkStatus = 'pending' | 'confirmed' | 'rejected' | 'ended';
export type OrderItemServiceType = 'photography' | 'makeup' | 'clothing' | 'makeup_clothing' | 'venue' | 'other';
export type OrderItemProviderType = 'photographer' | 'merchant';
export type OrderItemAcceptanceStatus = 'not_requested' | 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type OrderItemFulfillmentStatus = 'not_started' | 'in_service' | 'completed' | 'cancelled' | 'disputed';
export type OrderItemRefundStatus =
  | 'not_requested'
  | 'pending'
  | 'processing'
  | 'partially_refunded'
  | 'refunded'
  | 'rejected'
  | 'cancelled';
export type OrderItemSettlementStatus = 'not_ready' | 'pending' | 'frozen' | 'settled' | 'cancelled';
export type OrderItemSource = 'legacy_backfill' | 'composite';

/** Store Lite 预约申请状态。该领域不代表订单、付款或资金托管状态。 */
export type BookingRequestStatus = 'submitted' | 'confirmed' | 'declined' | 'cancelled';

export type BookingRequestActorType = 'user' | 'admin';

export type BookingRequestPhotographer = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type BookingRequestRequestedSchedule = {
  startAt: string;
  endAt: string;
  timezone: string;
  city: string;
  addressText: string;
};

/**
 * 仅运营确认后存在的履约快照。supportChannel 是平台配置键，
 * 不是电话号码或可直接跳转的外部联系方式。
 */
export type BookingRequestConfirmation = {
  startAt: string;
  endAt: string;
  city: string;
  addressText: string;
  arrivalInstructions: string;
  supportChannel: string;
  confirmedAt: string;
};

/** 消费者可见的状态轨迹；不包含操作人 ID、内部备注或原始审计字段。 */
export type BookingRequestPublicStatusLog = {
  id: string;
  fromStatus: BookingRequestStatus | null;
  toStatus: BookingRequestStatus;
  message: string;
  createdAt: string;
};

export type BookingRequestConsumerSummary = {
  id: string;
  status: BookingRequestStatus;
  photographer: BookingRequestPhotographer;
  requestedSchedule: BookingRequestRequestedSchedule;
  confirmation: BookingRequestConfirmation | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingRequestConsumerDetail = BookingRequestConsumerSummary & {
  requirements: string;
  statusLogs: BookingRequestPublicStatusLog[];
};

export type BookingRequestConsumerListPage = {
  items: BookingRequestConsumerSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type BookingRequestAdminStatusLog = BookingRequestPublicStatusLog & {
  actorType: BookingRequestActorType;
  reasonCode: string | null;
};

export type BookingRequestAdminSummary = BookingRequestConsumerSummary & {
  consumer: {
    id: string;
    name: string;
    phoneMasked: string | null;
  };
  companionPhoneMasked: string | null;
  requirementsPreview: string;
};

export type BookingRequestAdminDetail = Omit<BookingRequestConsumerDetail, 'statusLogs'> & {
  consumer: {
    id: string;
    name: string;
    phone: string | null;
  };
  companionPhone: string | null;
  statusLogs: BookingRequestAdminStatusLog[];
};

export type BookingRequestAdminListPage = {
  items: BookingRequestAdminSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type BookingRequestListQuery = {
  status?: BookingRequestStatus;
  limit?: number;
  cursor?: string;
};

export type CreateBookingRequestInput = {
  companionId: string;
  clientRequestId: string;
  requestedStartAt: string;
  requestedEndAt: string;
  timezone?: string;
  city: string;
  addressText: string;
  requirements: string;
};

export type ConfirmBookingRequestInput = {
  confirmedStartAt: string;
  confirmedEndAt: string;
  confirmedCity: string;
  confirmedAddressText: string;
  arrivalInstructions: string;
  supportChannelKey: string;
  publicMessage?: string;
  internalNote?: string;
};

export type DeclineBookingRequestInput = {
  reasonCode: string;
  publicMessage: string;
  internalNote?: string;
};

/** 消费者取消输入；预约 ID 与消费者身份分别来自路径和 session。 */
export type CancelBookingRequestInput = {
  reasonCode?: string;
  reason?: string;
};

/** 运营代表供给侧取消输入；内部备注只写审计日志，不进入响应 DTO。 */
export type AdminCancelBookingRequestInput = {
  reasonCode: string;
  publicMessage: string;
  internalNote?: string;
};

// Public/read-model merchant data intentionally excludes the phone number.
// A confirmed-order contact response must use MerchantOrderContact instead.
export type MerchantSummary = {
  id: string;
  name: string;
  status: MerchantStatus;
  city: string;
  address?: string;
  timezone: string;
  businessHours: Record<string, unknown>;
  hasContactPhone: boolean;
  contactPhoneVisibility: 'confirmed_order_only';
  serviceEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type MerchantOrderContact = {
  merchantId: string;
  merchantName: string;
  contactPhone: string;
  releasePolicy: 'confirmed_order_only';
  releasedAt: string;
};

export type MerchantOffering = {
  id: string;
  merchantId: string;
  offeringCode: string;
  version: number;
  serviceType: Exclude<OrderItemServiceType, 'photography'>;
  name: string;
  description: string;
  durationMinutes: number;
  fixedPriceCents: number;
  fixedPriceText: string;
  currency: 'CNY' | string;
  inclusions: string[];
  enabled: boolean;
  publishedAt?: string;
  retiredAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type PhotographerMerchantLink = {
  id: string;
  photographerId: string;
  photographerName: string;
  merchantId: string;
  merchantName: string;
  status: MerchantLinkStatus;
  relationshipLabel: string;
  photographerConfirmedAt?: string;
  merchantConfirmedAt?: string;
  isPrimary: boolean;
  rejectedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type OrderServiceItem = {
  id: string;
  orderId: string;
  itemNo: number;
  serviceType: OrderItemServiceType;
  provider: {
    type: OrderItemProviderType;
    id: string;
    name: string;
  };
  activityPricingId?: string;
  merchantOfferingId?: string;
  offeringVersion?: number;
  serviceName: string;
  serviceDescription?: string;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  timezone: string;
  pricing: {
    baseAmountCents: number;
    extraAmountCents: number;
    discountAmountCents: number;
    totalAmountCents: number;
    totalAmountText: string;
    platformSubsidyCents: number;
    platformSubsidyText: string;
    userPayableCents: number;
    userPayableText: string;
    currency: 'CNY' | string;
  };
  acceptance: {
    status: OrderItemAcceptanceStatus;
    deadlineAt?: string;
    acceptedAt?: string;
    declinedAt?: string;
    declineReason?: string;
  };
  fulfillment: {
    status: OrderItemFulfillmentStatus;
    serviceStartedAt?: string;
    completedAt?: string;
    cancelledAt?: string;
  };
  refund: {
    status: OrderItemRefundStatus;
    refundedAmountCents: number;
    refundedAmountText: string;
  };
  source: OrderItemSource;
  createdAt: string;
  updatedAt?: string;
};

export type ReviewStatus = '草稿' | '待审核' | '已通过' | '需修改';

export type Money = {
  amountCents: number;
  amountText: string;
};

export type MiniProgramPayParams = {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA' | 'MD5' | string;
  paySign: string;
};

export type PaymentRequest = {
  paymentId: string;
  paymentNo?: string;
  channel: string;
  provider: 'wechat_pay' | 'mock_wechat' | string;
  mode: 'mock' | 'production' | string;
  status: PaymentStatus;
  amountCents: number;
  amountText?: string;
  expiresAt?: string;
  miniProgramPayParams: MiniProgramPayParams;
  payPayload?: {
    provider?: string;
    mode?: string;
    miniProgramPayParams?: MiniProgramPayParams;
    mockSuccessPath?: string;
    migrationTarget?: string;
  };
};

export type User = {
  id: string;
  openId?: string;
  phone?: string;
  nickname: string;
  avatarUrl?: string;
  gender: 'female' | 'male' | 'unknown' | string;
  city?: string;
  lastLat?: number;
  lastLng?: number;
  lastLocationUpdatedAt?: string;
  status: UserStatus;
  isCompanion: boolean;
  roles?: UserRole[];
};

export type UserRole = 'consumer' | 'companion' | 'admin';

export type AuthSession = {
  token: string;
  provider: 'mock_wechat' | 'wechat' | 'phone' | 'local_admin';
  role: UserRole;
  roles: UserRole[];
  user: User;
  companionId?: string | null;
  adminScope?: string[];
  loginAt: string;
};

export type PostImage = {
  id: string;
  url: string;
  mediaKind?: 'image' | 'live' | 'video' | string;
  videoUrl?: string;
  posterUrl?: string;
  width?: number;
  height?: number;
  sortOrder: number;
  provider?: 'local' | 'tencent_cos' | string;
  objectKey?: string;
  contentType?: string;
  sizeBytes?: number;
};

export type MediaUploadPurpose = 'post-image' | 'avatar' | 'portfolio' | 'identity' | 'video';

export type MediaUploadPolicy = {
  provider: 'tencent_cos' | string;
  mode: 'mock' | 'production' | string;
  bucket: string;
  region: string;
  purpose: MediaUploadPurpose;
  objectKey: string;
  contentType: string;
  uploadMethod?: 'POST';
  uploadUrl: string;
  publicUrl: string;
  expiresAt: string;
  formFields?: Record<string, string>;
  credentials?: Record<string, unknown>;
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

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type ServiceArea = {
  id: string;
  city: string;
  areaName: string;
  areaType: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  enabled: boolean;
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
  weeklyTimeRanges?: Partial<Record<RepeatWeekday, BookingTimeRange[]>>;
  scheduleApplyMode?: 'weekly' | 'single_week';
  weekOverrides?: Record<string, Partial<Record<RepeatWeekday, BookingTimeRange[]>>>;
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
  isVirtual?: boolean;
  avatar: string;
  photo: string;
  bio: string;
  gender: string;
  baseCity: string;
  status: CompanionStatus;
  serviceEnabled: boolean;
  ratingAvg: number;
  ratingCount: number;
  followerCount?: number;
  postCount?: number;
  location?: GeoPoint;
  tags: string[];
  safetyBadges: string[];
  areas: string[];
  serviceAreas?: ServiceArea[];
  slots: AvailabilitySlot[];
  activities: ActivityPricing[];
  extras: CompanionExtra[];
};

export type FeedPost = {
  id: string;
  title?: string;
  location: string;
  timeLabel: string;
  caption: string;
  styleTags: string[];
  activity: string;
  city?: string;
  locationName?: string;
  lat?: number;
  lng?: number;
  venueType?: string;
  shootTime?: string;
  activityCategory?: string;
  durationMinutes?: number;
  budgetCents?: number;
  images: PostImage[];
  companion: Companion;
  likeCount?: number;
  favoriteCount?: number;
  creator?: {
    id: string;
    name: string;
    avatar?: string;
    phone?: string;
    source: 'order' | 'creator_upload' | string;
  };
};

export type MatchingCompanionItem = {
  companion: Companion;
  nearestServiceArea: ServiceArea;
  distanceMeters: number;
  distanceText: string;
  matchScore: number;
};

export type FeedPostCard = FeedPost;

export type OrderStep = {
  label: string;
  completed: boolean;
};

export type OrderImageQuantityMode = '4' | '9' | 'custom' | 'unlimited';

/**
 * WIN-DATA-2A compatibility snapshot for orders created before the structured
 * place domain is available. Missing address or coordinates stay null; clients
 * must not infer them from the display name.
 */
export type LegacyOrderLocationSnapshot = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

/** Public order status history. Internal operator identity and raw reasons are excluded. */
export type OrderStatusLogPublic = {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  statusText: string;
  message?: string;
  createdAt: string;
};

export type OrderPublicPricing = {
  baseAmountCents: number;
  extraAmountCents: number;
  totalAmountCents: number;
  totalAmountText: string;
  currency: 'CNY' | string;
};

export type OrderAddOnPublic = {
  id: string;
  extraId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  unitPriceText: string;
  amountCents: number;
  amountText: string;
  createdAt?: string;
};

/**
 * Public list item shared by consumer and companion order views.
 * `place` is retained as the legacy display alias for `locationSnapshot.name`.
 */
export type OrderSummary = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  statusText: string;
  title: string;
  time: string;
  place: string;
  locationSnapshot: LegacyOrderLocationSnapshot;
  amountCents: number;
  amountText: string;
  companion: string;
  companionId: string;
  companionAvatarUrl?: string;
  creatorId?: string;
  creatorName?: string;
  creatorAvatarUrl?: string;
  postId?: string;
  activityId?: string;
  activityName?: string;
  slotId?: string;
  startAt: string;
  endAt: string;
  dateLabel: string;
  timeLabel: string;
  durationMinutes: number;
  durationLabel: string;
  paymentExpiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  steps: string[];
  currentStep: number;
  serviceItems?: OrderServiceItem[];
};

/** Public order detail. Provider settlement and internal pricing fields are intentionally absent. */
export type OrderDetail = OrderSummary & {
  pricing: OrderPublicPricing;
  addOns: OrderAddOnPublic[];
  userNote?: string;
  companionNote?: string;
  cancellationReason?: string;
  paidAt?: string;
  confirmedAt?: string;
  serviceStartedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  statusLogs: OrderStatusLogPublic[];
};

export type OrderListPage = {
  items: OrderSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** Legacy in-app state model. New public order APIs use OrderSummary/OrderDetail. */
export type AppOrder = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  statusText: string;
  title: string;
  time: string;
  place: string;
  placeAddress?: string;
  placeLat?: number;
  placeLng?: number;
  amountCents: number;
  amountText: string;
  companion: string;
  companionId: string;
  creatorId?: string;
  creatorPhone?: string;
  creatorName?: string;
  companionPhone?: string;
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
  imageQuantityMode?: OrderImageQuantityMode;
  customImageQuantity?: number;
  addOns?: OrderAddOnInput[];
  consultationId?: string;
  quoteId?: string;
  depositCents?: number;
  balanceCents?: number;
  depositStatus?: 'unpaid' | 'paid' | 'refunded' | 'forfeited';
  balanceStatus?: 'unpaid' | 'paid' | 'refunded';
  fundsStatus?: 'none' | 'deposit_escrowed' | 'full_escrowed' | 'frozen' | 'settled' | 'refunded';
  settlementStatus?: SettlementStatus;
  cancellationActor?: CancellationActor;
  cancellationPhase?: 'pending_payment' | 'paid_pending_confirm' | 'confirmed_before_balance' | 'full_escrowed' | 'completed' | 'other';
  cancellationReason?: string;
  cancellationPenaltyCents?: number;
  refundToCreatorCents?: number;
  compensationToCounterpartyCents?: number;
  platformFeeCents?: number;
  cancellationSummary?: string;
  cancelledAt?: string;
  paymentExpiresAt?: string;
  createdAt: string;
  steps: string[];
  currentStep: number;
  serviceItems?: OrderServiceItem[];
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
  idempotencyKey?: string;
  clientRequestId?: string;
  title: string;
  time: string;
  place: string;
  placeAddress?: string;
  placeLat?: number;
  placeLng?: number;
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
  imageQuantityMode?: OrderImageQuantityMode;
  customImageQuantity?: number;
  addOns: OrderAddOnInput[];
  consultationId?: string;
  quoteId?: string;
  depositCents?: number;
  balanceCents?: number;
  depositStatus?: 'unpaid' | 'paid' | 'refunded' | 'forfeited';
  balanceStatus?: 'unpaid' | 'paid' | 'refunded';
  fundsStatus?: 'none' | 'deposit_escrowed' | 'full_escrowed' | 'frozen' | 'settled' | 'refunded';
  settlementStatus?: SettlementStatus;
};

export type Message = {
  id: string;
  from: 'user' | 'companion' | 'admin' | 'system';
  kind?: 'text' | 'image' | 'voice';
  text: string;
  sentAt: string;
  riskStatus: MessageRiskStatus;
  imageUrl?: string;
  imageName?: string;
  voiceDurationSeconds?: number;
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
  serverPostId?: string;
  images: PostImage[];
  coverImageId: string;
  location: string;
  timeLabel: string;
  caption: string;
  tags: string[];
  activity: string;
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

export type AdminRiskLevel = 'low' | 'medium' | 'high';

export type AdminCaseStatus = 'pending' | 'released' | 'violation' | 'restricted' | 'resolved';

export type AdminActionType =
  | 'release_message'
  | 'confirm_violation'
  | 'warn_user'
  | 'warn_companion'
  | 'restrict_chat'
  | 'freeze_order'
  | 'suspend_companion'
  | 'resolve_report';

export type AdminActionLog = {
  id: string;
  type: AdminActionType;
  label: string;
  note: string;
  createdAt: string;
};

export type AdminRiskMessageCase = {
  id: string;
  type: 'message_risk';
  status: AdminCaseStatus;
  riskLevel: AdminRiskLevel;
  riskLabel: string;
  conversationId: string;
  orderId: string;
  orderNo: string;
  orderTitle: string;
  orderStatusText: string;
  orderAmountText: string;
  userName: string;
  companionName: string;
  blockedMessage: Message;
  hitWords: Array<{ keyword: string; label: string; level: AdminRiskLevel }>;
  contextMessages: Message[];
  createdAt: string;
  actionLogs: AdminActionLog[];
};

export type AdminReportCase = {
  id: string;
  type: 'report_dispute';
  status: ReportStatus;
  riskLevel: AdminRiskLevel;
  riskLabel: string;
  reporterRole: 'user' | 'companion';
  reporterName: string;
  targetName: string;
  reason: string;
  description: string;
  orderId: string;
  orderNo: string;
  orderTitle: string;
  orderStatusText: string;
  orderAmountText: string;
  createdAt: string;
  actionLogs: AdminActionLog[];
};

export type AdminModerationData = {
  messageCases: AdminRiskMessageCase[];
  reportCases: AdminReportCase[];
};
