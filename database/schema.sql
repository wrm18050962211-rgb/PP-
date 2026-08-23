-- PP陪拍平台 MVP database schema
-- Target: PostgreSQL 16+
-- Optional later upgrade: PostGIS for geo search and service radius matching.

create extension if not exists pgcrypto;

-- =========================
-- Enum types
-- =========================

create type user_status as enum (
  'active',
  'restricted',
  'banned',
  'deleted'
);

create type companion_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'needs_change',
  'suspended',
  'banned'
);

create type audit_status as enum (
  'pending',
  'approved',
  'rejected',
  'needs_change',
  'cancelled'
);

create type post_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'removed'
);

create type order_status as enum (
  'pending_payment',
  'paid_pending_confirm',
  'confirmed',
  'in_service',
  'completed',
  'cancelled',
  'refunding',
  'refunded',
  'disputed'
);

create type payment_status as enum (
  'pending',
  'paid',
  'failed',
  'closed'
);

create type refund_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'rejected'
);

create type message_risk_status as enum (
  'clean',
  'blocked',
  'flagged',
  'replaced'
);

create type report_status as enum (
  'pending',
  'investigating',
  'resolved',
  'rejected'
);

create type settlement_status as enum (
  'pending',
  'frozen',
  'settled',
  'cancelled'
);

create type merchant_status as enum (
  'draft',
  'pending_review',
  'active',
  'suspended',
  'closed'
);

create type merchant_link_status as enum (
  'pending',
  'confirmed',
  'rejected',
  'ended'
);

create type order_item_service_type as enum (
  'photography',
  'makeup',
  'clothing',
  'makeup_clothing',
  'venue',
  'other'
);

create type order_item_provider_type as enum (
  'companion',
  'merchant'
);

create type order_item_acceptance_status as enum (
  'not_requested',
  'pending',
  'accepted',
  'declined',
  'expired',
  'cancelled'
);

create type order_item_fulfillment_status as enum (
  'not_started',
  'in_service',
  'completed',
  'cancelled',
  'disputed'
);

create type order_item_refund_status as enum (
  'not_requested',
  'pending',
  'processing',
  'partially_refunded',
  'refunded',
  'rejected',
  'cancelled'
);

create type order_item_settlement_status as enum (
  'not_ready',
  'pending',
  'frozen',
  'settled',
  'cancelled'
);

create type order_item_source as enum (
  'legacy_backfill',
  'composite'
);

create type booking_request_status as enum (
  'submitted',
  'confirmed',
  'declined',
  'cancelled'
);

create type booking_request_actor_type as enum (
  'user',
  'admin'
);

-- =========================
-- Users
-- =========================

create table users (
  id uuid primary key default gen_random_uuid(),
  phone varchar(32) unique,
  email varchar(255),
  nickname varchar(80) not null,
  avatar_url text,
  gender varchar(20) not null default 'unknown',
  birthday date,
  city varchar(80),
  last_lat numeric(10,7),
  last_lng numeric(10,7),
  last_location_updated_at timestamptz,
  status user_status not null default 'active',
  is_companion boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_city on users(city);
create index idx_users_status on users(status);

create table user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  bio text,
  preferred_companion_gender varchar(20),
  safety_preferences jsonb not null default '{}',
  style_preferences text[] not null default '{}',
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider varchar(40) not null,
  provider_user_id varchar(160) not null,
  union_id varchar(160),
  phone varchar(32),
  metadata jsonb not null default '{}',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);

create index idx_user_auth_identities_user
on user_auth_identities(user_id);

create index idx_user_auth_identities_phone
on user_auth_identities(phone);

create table phone_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  phone varchar(32) not null,
  purpose varchar(40) not null,
  code_hash varchar(128) not null,
  requested_ip inet,
  delivery_status varchar(20) not null default 'pending',
  provider varchar(40) not null,
  provider_request_id varchar(160),
  failure_code varchar(80),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  sent_at timestamptz,
  consumed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_status in ('pending', 'sent', 'failed')),
  check (attempts >= 0 and attempts <= max_attempts),
  check (max_attempts > 0)
);

create index idx_phone_verification_phone_purpose
on phone_verification_challenges(phone, purpose, created_at desc);

create index idx_phone_verification_ip_created
on phone_verification_challenges(requested_ip, created_at desc)
where requested_ip is not null;

-- =========================
-- Companions
-- =========================

create table companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  display_name varchar(80) not null,
  base_city varchar(80) not null,
  gender varchar(20) not null default 'unknown',
  age_range varchar(40),
  bio text,
  real_photo_url text,
  intro_video_url text,
  show_intro_video boolean not null default true,
  status companion_status not null default 'draft',
  service_enabled boolean not null default false,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  completed_order_count integer not null default 0,
  cancellation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_companions_city_status on companions(base_city, status);
create index idx_companions_service_enabled on companions(service_enabled);

create table companion_kyc (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null unique references companions(id) on delete cascade,
  real_name varchar(80),
  id_doc_type varchar(40),
  id_doc_number_hash varchar(255),
  id_doc_front_file text,
  id_doc_back_file text,
  face_verify_status varchar(40) not null default 'pending',
  face_verify_provider varchar(80),
  face_verify_ref varchar(255),
  emergency_contact_name varchar(80),
  emergency_contact_phone varchar(32),
  rule_confirmed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table companion_tags (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  tag_type varchar(40) not null,
  tag_name varchar(80) not null,
  created_at timestamptz not null default now(),
  unique(companion_id, tag_type, tag_name)
);

create index idx_companion_tags_name on companion_tags(tag_name);

-- =========================
-- Service settings
-- =========================

create table service_areas (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  city varchar(80) not null,
  area_name varchar(120) not null,
  area_type varchar(40) not null default 'business_area',
  lat numeric(10,7),
  lng numeric(10,7),
  radius_meters integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(companion_id, city, area_name)
);

create index idx_service_areas_city_area on service_areas(city, area_name);
create index idx_service_areas_companion on service_areas(companion_id);

create table companion_service_scenes (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  scene_name varchar(80) not null,
  accept_type varchar(20) not null default 'accept',
  note text,
  created_at timestamptz not null default now(),
  unique(companion_id, scene_name, accept_type)
);

create table activity_pricings (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  activity_name varchar(80) not null,
  duration_minutes integer not null,
  price_cents integer not null check (price_cents >= 0),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(companion_id, activity_name, duration_minutes),
  constraint uq_activity_pricing_identity unique(companion_id, id)
);

create index idx_activity_pricings_companion_enabled
on activity_pricings(companion_id, enabled);

create table companion_extras (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  name varchar(80) not null,
  unit varchar(40) not null default 'per_order',
  price_cents integer not null check (price_cents >= 0),
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- Merchant service supply
-- =========================

create table merchants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references users(id) on delete set null,
  name varchar(120) not null,
  legal_name varchar(160),
  status merchant_status not null default 'draft',
  city varchar(80) not null,
  address text,
  timezone varchar(80) not null default 'Asia/Shanghai',
  business_hours jsonb not null default '{}'::jsonb,
  contact_phone varchar(32) not null,
  contact_phone_visibility varchar(40) not null default 'confirmed_order_only',
  service_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (btrim(contact_phone) <> ''),
  check (contact_phone_visibility = 'confirmed_order_only')
);

create index idx_merchants_city_status
on merchants(city, status, service_enabled);

create index idx_merchants_owner
on merchants(owner_user_id)
where owner_user_id is not null;

create table merchant_offerings (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  offering_code varchar(80) not null,
  version integer not null default 1,
  service_type order_item_service_type not null,
  name varchar(120) not null,
  description text,
  duration_minutes integer not null,
  fixed_price_cents integer not null,
  currency varchar(3) not null default 'CNY',
  inclusions jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(merchant_id, offering_code, version),
  check (btrim(offering_code) <> ''),
  check (btrim(name) <> ''),
  check (version > 0),
  check (duration_minutes > 0),
  check (fixed_price_cents >= 0),
  check (service_type <> 'photography'),
  check (retired_at is null or published_at is not null)
);

create index idx_merchant_offerings_merchant_enabled
on merchant_offerings(merchant_id, enabled, service_type);

create unique index uq_merchant_offering_identity
on merchant_offerings(id, merchant_id, version, service_type);

create table photographer_merchant_links (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  status merchant_link_status not null default 'pending',
  relationship_label varchar(80),
  photographer_confirmed_at timestamptz,
  merchant_confirmed_at timestamptz,
  is_primary boolean not null default false,
  rejected_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(companion_id, merchant_id),
  check (
    status <> 'confirmed'
    or (photographer_confirmed_at is not null and merchant_confirmed_at is not null)
  ),
  check (
    not is_primary
    or (
      status = 'confirmed'
      and photographer_confirmed_at is not null
      and merchant_confirmed_at is not null
    )
  )
);

create unique index uq_photographer_primary_merchant
on photographer_merchant_links(companion_id)
where is_primary = true and status = 'confirmed';

create index idx_photographer_merchant_links_merchant
on photographer_merchant_links(merchant_id, status);

create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status varchar(40) not null default 'available',
  temp_accept_enabled boolean not null default false,
  locked_order_id uuid,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index idx_availability_companion_time
on availability_slots(companion_id, start_at, end_at);

create index idx_availability_status_time
on availability_slots(status, start_at);

-- =========================
-- Feed posts
-- =========================

create table posts (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  city varchar(80) not null,
  location_name varchar(160) not null,
  location_type varchar(60),
  lat numeric(10,7),
  lng numeric(10,7),
  time_label varchar(120) not null,
  caption text,
  activity_name varchar(80),
  status post_status not null default 'draft',
  is_feed_visible boolean not null default false,
  is_featured boolean not null default false,
  quality_score numeric(5,2) not null default 0,
  view_count integer not null default 0,
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index idx_posts_feed_city
on posts(status, is_feed_visible, city, published_at desc);

create index idx_posts_companion on posts(companion_id);

create table post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  file_url text not null,
  file_key text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  audit_status audit_status not null default 'pending',
  risk_flags jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_post_images_post_sort on post_images(post_id, sort_order);

create table post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  tag_name varchar(80) not null,
  unique(post_id, tag_name)
);

create index idx_post_tags_name on post_tags(tag_name);

-- =========================
-- Orders
-- =========================

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no varchar(40) not null unique,
  user_id uuid not null references users(id),
  companion_id uuid not null references companions(id),
  post_id uuid references posts(id),
  activity_pricing_id uuid references activity_pricings(id),
  availability_slot_id uuid references availability_slots(id),
  city varchar(80) not null,
  place_name varchar(160) not null,
  place_address text,
  place_lat numeric(10,7),
  place_lng numeric(10,7),
  activity_name varchar(80) not null,
  duration_minutes integer not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  base_amount_cents integer not null default 0,
  extra_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  platform_fee_cents integer not null default 0,
  companion_income_cents integer not null default 0,
  status order_status not null default 'pending_payment',
  user_note text,
  companion_note text,
  cancel_reason text,
  cancelled_by uuid,
  paid_at timestamptz,
  confirmed_at timestamptz,
  service_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index idx_orders_user_status on orders(user_id, status, created_at desc);
create index idx_orders_companion_status on orders(companion_id, status, start_at desc);
create index idx_orders_order_no on orders(order_no);
create index idx_orders_start_at on orders(start_at);

create unique index uq_orders_id_companion
on orders(id, companion_id);

alter table availability_slots
add constraint fk_availability_locked_order
foreign key (locked_order_id) references orders(id);

create table order_extras (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  extra_id uuid references companion_extras(id),
  name varchar(80) not null,
  quantity integer not null default 1,
  unit_price_cents integer not null,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

create table order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  operator_type varchar(40) not null,
  operator_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_order_status_logs_order
on order_status_logs(order_id, created_at);

-- =========================
-- Payment and refund
-- =========================

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  payment_no varchar(64) not null unique,
  channel varchar(40) not null,
  amount_cents integer not null check (amount_cents >= 0),
  status payment_status not null default 'pending',
  third_party_trade_no varchar(128),
  third_party_buyer_id varchar(128),
  raw_callback jsonb not null default '{}',
  paid_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payments_order on payments(order_id);
create index idx_payments_status on payments(status);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  payment_id uuid references payments(id),
  refund_no varchar(64) not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  reason text,
  status refund_status not null default 'pending',
  requested_by uuid references users(id),
  processed_by uuid,
  third_party_refund_no varchar(128),
  raw_callback jsonb not null default '{}',
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_refunds_order on refunds(order_id);
create index idx_refunds_status on refunds(status);

create table provider_callback_events (
  id uuid primary key default gen_random_uuid(),
  provider varchar(40) not null,
  event_type varchar(80) not null,
  provider_event_id varchar(160),
  object_type varchar(40),
  object_id uuid,
  payment_id uuid references payments(id),
  refund_id uuid references refunds(id),
  order_id uuid references orders(id),
  status varchar(40) not null default 'received',
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  last_error text,
  request_headers jsonb not null default '{}',
  raw_body text,
  raw_payload jsonb not null default '{}',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, event_type, provider_event_id)
);

create index idx_provider_callback_events_status
on provider_callback_events(status, next_retry_at, created_at);

create index idx_provider_callback_events_payment
on provider_callback_events(payment_id, created_at);

create index idx_provider_callback_events_refund
on provider_callback_events(refund_id, created_at);

-- =========================
-- Order-bound messages and risk control
-- =========================

create table conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  user_id uuid not null references users(id),
  companion_id uuid not null references companions(id),
  status varchar(40) not null default 'active',
  restricted_reason text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_conversations_user on conversations(user_id, last_message_at desc);
create index idx_conversations_companion on conversations(companion_id, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references users(id),
  sender_role varchar(40) not null,
  message_type varchar(40) not null default 'text',
  content text,
  original_content text,
  risk_status message_risk_status not null default 'clean',
  blocked_reason text,
  read_at timestamptz,
  sent_at timestamptz not null default now()
);

create index idx_messages_conversation_time
on messages(conversation_id, sent_at);

create index idx_messages_sender
on messages(sender_id, sent_at desc);

create table risk_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword varchar(120) not null,
  normalized_keyword varchar(120),
  risk_type varchar(60) not null,
  risk_level varchar(20) not null default 'medium',
  action varchar(40) not null default 'block',
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(keyword, risk_type)
);

create index idx_risk_keywords_enabled on risk_keywords(enabled);

create table message_risk_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  order_id uuid references orders(id),
  user_id uuid references users(id),
  matched_keywords text[] not null default '{}',
  risk_type varchar(60) not null,
  risk_level varchar(20) not null,
  action_taken varchar(40) not null,
  review_status varchar(40) not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_message_risk_events_review
on message_risk_events(review_status, created_at desc);

create index idx_message_risk_events_user
on message_risk_events(user_id, created_at desc);

-- =========================
-- Audit
-- =========================

create table audit_cases (
  id uuid primary key default gen_random_uuid(),
  target_type varchar(40) not null,
  target_id uuid not null,
  status audit_status not null default 'pending',
  risk_level varchar(20) not null default 'low',
  submitted_by uuid references users(id),
  assigned_admin_id uuid,
  reason text,
  snapshot jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_audit_cases_queue
on audit_cases(status, target_type, submitted_at);

create index idx_audit_cases_target
on audit_cases(target_type, target_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  audit_case_id uuid not null references audit_cases(id) on delete cascade,
  action varchar(40) not null,
  operator_id uuid,
  operator_type varchar(40) not null default 'admin',
  comment text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_audit_logs_case
on audit_logs(audit_case_id, created_at);

-- =========================
-- Reports, ratings, favorites
-- =========================

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id),
  reported_user_id uuid references users(id),
  order_id uuid references orders(id),
  conversation_id uuid references conversations(id),
  target_type varchar(40) not null,
  target_id uuid,
  category varchar(80) not null,
  description text,
  evidence_files jsonb not null default '[]',
  status report_status not null default 'pending',
  handled_by uuid,
  handled_at timestamptz,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_reports_status on reports(status, created_at desc);
create index idx_reports_order on reports(order_id);
create index idx_reports_reported_user on reports(reported_user_id, created_at desc);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  user_id uuid not null references users(id),
  companion_id uuid not null references companions(id),
  score integer not null check (score between 1 and 5),
  content text,
  tags text[] not null default '{}',
  is_anonymous boolean not null default false,
  status varchar(40) not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ratings_companion on ratings(companion_id, created_at desc);

create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  target_type varchar(40) not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, target_type, target_id)
);

create index idx_favorites_user on favorites(user_id, created_at desc);
create index idx_favorites_target on favorites(target_type, target_id);

-- =========================
-- Settlement and wallet
-- =========================

create table companion_wallets (
  companion_id uuid primary key references companions(id) on delete cascade,
  pending_cents integer not null default 0,
  available_cents integer not null default 0,
  frozen_cents integer not null default 0,
  withdrawn_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pending_cents >= 0),
  check (available_cents >= 0),
  check (frozen_cents >= 0),
  check (withdrawn_cents >= 0)
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  companion_id uuid not null references companions(id),
  gross_amount_cents integer not null,
  platform_fee_cents integer not null,
  net_amount_cents integer not null,
  status settlement_status not null default 'pending',
  settle_after timestamptz not null,
  settled_at timestamptz,
  frozen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_settlements_companion_status
on settlements(companion_id, status, settle_after);

create index idx_settlements_due on settlements(status, settle_after);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id),
  order_id uuid references orders(id),
  settlement_id uuid references settlements(id),
  entry_type varchar(60) not null,
  direction varchar(20) not null,
  amount_cents integer not null check (amount_cents > 0),
  balance_type varchar(40) not null,
  balance_after_cents integer not null,
  status varchar(40) not null default 'posted',
  description text,
  created_at timestamptz not null default now()
);

create index idx_ledger_companion_time
on ledger_entries(companion_id, created_at desc);

create index idx_ledger_order on ledger_entries(order_id);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id),
  withdrawal_no varchar(64) not null unique,
  amount_cents integer not null check (amount_cents > 0),
  channel varchar(40) not null,
  account_snapshot jsonb not null default '{}',
  status varchar(40) not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  paid_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_withdrawals_companion
on withdrawals(companion_id, created_at desc);

create index idx_withdrawals_status
on withdrawals(status, created_at);

-- =========================
-- Admin and config
-- =========================

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  username varchar(80) not null unique,
  password_hash varchar(255) not null,
  name varchar(80) not null,
  role varchar(40) not null,
  status varchar(40) not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_admin_users_role on admin_users(role);

-- =========================
-- Store Lite booking requests
-- =========================

create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  companion_id uuid not null references companions(id),
  client_request_id varchar(160) not null,
  request_fingerprint varchar(128) not null,
  requested_start_at timestamptz not null,
  requested_end_at timestamptz not null,
  timezone varchar(80) not null default 'Asia/Shanghai',
  city varchar(80) not null,
  address_text varchar(500) not null,
  requirements varchar(2000) not null,
  status booking_request_status not null default 'submitted',
  confirmed_start_at timestamptz,
  confirmed_end_at timestamptz,
  confirmed_city varchar(80),
  confirmed_address_text varchar(500),
  arrival_instructions varchar(1000),
  support_channel_key varchar(80),
  confirmed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_booking_requests_id_user unique (id, user_id),
  constraint uq_booking_requests_user_client unique (user_id, client_request_id),
  constraint ck_booking_requests_client_request_id
    check (btrim(client_request_id) <> ''),
  constraint ck_booking_requests_request_fingerprint
    check (btrim(request_fingerprint) <> ''),
  constraint ck_booking_requests_requested_time
    check (requested_end_at > requested_start_at),
  constraint ck_booking_requests_required_text
    check (
      btrim(timezone) <> ''
      and btrim(city) <> ''
      and btrim(address_text) <> ''
      and btrim(requirements) <> ''
    ),
  constraint ck_booking_requests_support_channel_key
    check (
      support_channel_key is null
      or support_channel_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    ),
  constraint ck_booking_requests_confirmation_snapshot
    check (
      (
        confirmed_at is null
        and confirmed_start_at is null
        and confirmed_end_at is null
        and confirmed_city is null
        and confirmed_address_text is null
        and arrival_instructions is null
        and support_channel_key is null
      )
      or
      (
        confirmed_at is not null
        and confirmed_start_at is not null
        and confirmed_end_at is not null
        and confirmed_end_at > confirmed_start_at
        and confirmed_city is not null
        and btrim(confirmed_city) <> ''
        and confirmed_address_text is not null
        and btrim(confirmed_address_text) <> ''
        and arrival_instructions is not null
        and btrim(arrival_instructions) <> ''
        and support_channel_key is not null
      )
    ),
  constraint ck_booking_requests_status_outcome
    check (
      (
        status = 'submitted'
        and confirmed_at is null
        and declined_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'confirmed'
        and confirmed_at is not null
        and declined_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'declined'
        and confirmed_at is null
        and declined_at is not null
        and cancelled_at is null
      )
      or
      (
        status = 'cancelled'
        and declined_at is null
        and cancelled_at is not null
      )
    )
);

create index idx_booking_requests_user_created
on booking_requests(user_id, created_at desc, id desc);

create index idx_booking_requests_user_status_created
on booking_requests(user_id, status, created_at desc, id desc);

create index idx_booking_requests_operator_queue
on booking_requests(status, created_at, id);

create index idx_booking_requests_companion_time
on booking_requests(companion_id, status, requested_start_at, id);

-- The write gateway must update booking_requests, append this status log, and
-- mirror every admin decision/cancellation to admin_action_logs in one transaction.
create table booking_request_status_logs (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references booking_requests(id) on delete cascade,
  from_status booking_request_status,
  to_status booking_request_status not null,
  actor_type booking_request_actor_type not null,
  actor_user_id uuid references users(id),
  actor_admin_id uuid references admin_users(id),
  reason_code varchar(80),
  reason varchar(1000),
  created_at timestamptz not null default now(),
  constraint fk_booking_request_status_user_owner
    foreign key (booking_request_id, actor_user_id)
    references booking_requests(id, user_id),
  constraint ck_booking_request_status_actor
    check (
      (actor_type = 'user' and actor_user_id is not null and actor_admin_id is null)
      or
      (actor_type = 'admin' and actor_user_id is null and actor_admin_id is not null)
    ),
  constraint ck_booking_request_status_transition
    check (
      (
        from_status is null
        and to_status = 'submitted'
        and actor_type = 'user'
      )
      or
      (
        from_status = 'submitted'
        and to_status in ('confirmed', 'declined')
        and actor_type = 'admin'
      )
      or
      (
        from_status in ('submitted', 'confirmed')
        and to_status = 'cancelled'
        and actor_type in ('user', 'admin')
      )
    ),
  constraint ck_booking_request_status_reason
    check (
      (
        to_status <> 'declined'
        and not (to_status = 'cancelled' and actor_type = 'admin')
      )
      or
      (
        reason_code is not null
        and btrim(reason_code) <> ''
        and reason is not null
        and btrim(reason) <> ''
      )
    )
);

create index idx_booking_request_status_logs_request
on booking_request_status_logs(booking_request_id, created_at, id);

create index idx_booking_request_status_logs_admin
on booking_request_status_logs(actor_admin_id, created_at desc)
where actor_admin_id is not null;

create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash varchar(128) not null unique,
  session_scope varchar(40) not null default 'user',
  user_id uuid references users(id) on delete cascade,
  admin_id uuid references admin_users(id) on delete cascade,
  companion_id uuid references companions(id) on delete set null,
  role varchar(40) not null,
  provider varchar(40),
  device_id varchar(120),
  ip varchar(64),
  user_agent text,
  metadata jsonb not null default '{}',
  login_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or admin_id is not null)
);

create index idx_user_sessions_user
on user_sessions(user_id, expires_at desc);

create index idx_user_sessions_admin
on user_sessions(admin_id, expires_at desc);

create index idx_user_sessions_active
on user_sessions(session_scope, role, expires_at)
where revoked_at is null;

create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope varchar(80) not null,
  request_key varchar(160) not null,
  actor_type varchar(40) not null,
  actor_key varchar(160) not null,
  request_hash text,
  status varchar(40) not null default 'processing',
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope, request_key, actor_type, actor_key)
);

create index idx_idempotency_keys_actor
on idempotency_keys(actor_type, actor_key, created_at desc);

create index idx_idempotency_keys_processing
on idempotency_keys(status, locked_until)
where status = 'processing';

create table admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admin_users(id),
  action varchar(80) not null,
  target_type varchar(40),
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip varchar(64),
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_admin_action_logs_admin
on admin_action_logs(admin_id, created_at desc);

create index idx_admin_action_logs_target
on admin_action_logs(target_type, target_id);

create table security_events (
  id uuid primary key default gen_random_uuid(),
  event_type varchar(80) not null,
  actor_id uuid,
  actor_role varchar(40) not null default 'anonymous',
  target_type varchar(60),
  target_id uuid,
  target_key text,
  required_role varchar(80),
  actual_role varchar(40),
  action varchar(80),
  reason text,
  metadata jsonb not null default '{}',
  ip varchar(64),
  user_agent text,
  created_at timestamptz not null default now()
);

-- Internal service-item ledger. The legacy orders table remains the aggregate
-- and production write path until ENABLE_COMPOSITE_ORDER_DOMAIN is enabled.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_no integer not null,
  service_type order_item_service_type not null,
  provider_type order_item_provider_type not null,
  provider_companion_id uuid references companions(id),
  provider_merchant_id uuid references merchants(id),
  activity_pricing_id uuid references activity_pricings(id),
  merchant_offering_id uuid references merchant_offerings(id),
  offering_version integer,
  service_name_snapshot varchar(120) not null,
  service_description_snapshot text,
  duration_minutes integer not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone varchar(80) not null default 'Asia/Shanghai',
  base_amount_cents integer not null default 0,
  extra_amount_cents integer not null default 0,
  discount_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  platform_subsidy_cents integer not null default 0,
  user_payable_cents integer not null default 0,
  platform_fee_cents integer not null default 0,
  provider_income_cents integer not null default 0,
  currency varchar(3) not null default 'CNY',
  pricing_snapshot jsonb not null default '{}'::jsonb,
  acceptance_status order_item_acceptance_status not null default 'not_requested',
  acceptance_deadline_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  fulfillment_status order_item_fulfillment_status not null default 'not_started',
  service_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  refund_status order_item_refund_status not null default 'not_requested',
  refunded_amount_cents integer not null default 0,
  settlement_status order_item_settlement_status not null default 'not_ready',
  source order_item_source not null default 'composite',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, item_no),
  constraint fk_order_items_order_companion
    foreign key (order_id, provider_companion_id)
    references orders(id, companion_id),
  constraint fk_order_items_activity_pricing_identity
    foreign key (provider_companion_id, activity_pricing_id)
    references activity_pricings(companion_id, id),
  constraint fk_order_items_merchant_offering_identity
    foreign key (merchant_offering_id, provider_merchant_id, offering_version, service_type)
    references merchant_offerings(id, merchant_id, version, service_type),
  check (item_no > 0),
  check (duration_minutes > 0),
  check (end_at > start_at),
  check (base_amount_cents >= 0),
  check (extra_amount_cents >= 0),
  check (discount_amount_cents >= 0),
  check (discount_amount_cents <= base_amount_cents + extra_amount_cents),
  check (total_amount_cents = base_amount_cents + extra_amount_cents - discount_amount_cents),
  constraint ck_order_items_platform_subsidy_bounds
    check (platform_subsidy_cents >= 0 and platform_subsidy_cents <= total_amount_cents),
  constraint ck_order_items_user_payable_formula
    check (user_payable_cents = total_amount_cents - platform_subsidy_cents),
  check (platform_fee_cents >= 0),
  check (provider_income_cents >= 0),
  check (platform_fee_cents + provider_income_cents <= total_amount_cents),
  constraint ck_order_items_refund_payable_bounds
    check (refunded_amount_cents >= 0 and refunded_amount_cents <= user_payable_cents),
  constraint ck_order_items_provider_shape check (
    (
      provider_type = 'companion'
      and provider_companion_id is not null
      and provider_merchant_id is null
      and merchant_offering_id is null
      and offering_version is null
    )
    or
    (provider_type = 'merchant' and provider_merchant_id is not null and provider_companion_id is null)
  ),
  check (
    (service_type = 'photography' and provider_type = 'companion')
    or
    (service_type <> 'photography' and provider_type = 'merchant')
  ),
  check (
    provider_type <> 'merchant'
    or (merchant_offering_id is not null and offering_version is not null and offering_version > 0)
  ),
  check (acceptance_status <> 'accepted' or accepted_at is not null),
  check (acceptance_status <> 'declined' or declined_at is not null)
);

create index idx_order_items_order
on order_items(order_id, item_no);

create index idx_order_items_provider_companion
on order_items(provider_companion_id, acceptance_status, start_at)
where provider_companion_id is not null;

create index idx_order_items_provider_merchant
on order_items(provider_merchant_id, acceptance_status, start_at)
where provider_merchant_id is not null;

create index idx_order_items_acceptance_deadline
on order_items(acceptance_status, acceptance_deadline_at)
where acceptance_status = 'pending' and acceptance_deadline_at is not null;

create or replace function backfill_missing_photography_order_items()
returns bigint
language plpgsql
as $$
declare
  inserted_count bigint;
begin
  insert into order_items (
    order_id, item_no, service_type, provider_type, provider_companion_id,
    activity_pricing_id, service_name_snapshot, duration_minutes, start_at, end_at,
    base_amount_cents, extra_amount_cents, discount_amount_cents, total_amount_cents,
    platform_subsidy_cents, user_payable_cents, platform_fee_cents, provider_income_cents,
    pricing_snapshot, acceptance_status, accepted_at, fulfillment_status,
    service_started_at, completed_at, cancelled_at, refund_status,
    refunded_amount_cents, settlement_status, source, created_at, updated_at
  )
  select
    o.id,
    coalesce((
      select max(existing_item.item_no) + 1
      from order_items existing_item
      where existing_item.order_id = o.id
    ), 1),
    'photography'::order_item_service_type,
    'companion'::order_item_provider_type,
    o.companion_id,
    o.activity_pricing_id,
    o.activity_name,
    greatest(o.duration_minutes, 1),
    o.start_at,
    o.end_at,
    greatest(o.total_amount_cents, 0) - least(greatest(o.extra_amount_cents, 0), greatest(o.total_amount_cents, 0)),
    least(greatest(o.extra_amount_cents, 0), greatest(o.total_amount_cents, 0)),
    0,
    greatest(o.total_amount_cents, 0),
    0,
    greatest(o.total_amount_cents, 0),
    least(greatest(o.platform_fee_cents, 0), greatest(o.total_amount_cents, 0)),
    least(
      greatest(o.companion_income_cents, 0),
      greatest(o.total_amount_cents, 0) - least(greatest(o.platform_fee_cents, 0), greatest(o.total_amount_cents, 0))
    ),
    jsonb_build_object(
      'source', 'legacy_order',
      'originalBaseAmountCents', o.base_amount_cents,
      'originalExtraAmountCents', o.extra_amount_cents,
      'originalTotalAmountCents', o.total_amount_cents,
      'originalDurationMinutes', o.duration_minutes,
      'activityPricingId', o.activity_pricing_id
    ),
    (
      case
        when o.confirmed_at is not null or o.status in ('confirmed', 'in_service', 'completed', 'disputed') then 'accepted'
        when o.status = 'paid_pending_confirm' then 'pending'
        when o.status in ('cancelled', 'refunding', 'refunded') then 'cancelled'
        else 'not_requested'
      end
    )::order_item_acceptance_status,
    case
      when o.confirmed_at is not null or o.status in ('confirmed', 'in_service', 'completed', 'disputed')
        then coalesce(o.confirmed_at, o.updated_at, o.created_at)
      else null
    end,
    (
      case
        when o.status = 'completed' then 'completed'
        when o.status = 'in_service' then 'in_service'
        when o.status = 'disputed' then 'disputed'
        when o.status in ('cancelled', 'refunding', 'refunded') then 'cancelled'
        else 'not_started'
      end
    )::order_item_fulfillment_status,
    o.service_started_at,
    o.completed_at,
    o.cancelled_at,
    (
      case
        when o.status = 'refunding' then 'processing'
        when o.status = 'refunded' then 'refunded'
        else 'not_requested'
      end
    )::order_item_refund_status,
    case when o.status = 'refunded' then greatest(o.total_amount_cents, 0) else 0 end,
    (
      case
        when exists (select 1 from settlements s where s.order_id = o.id and s.status = 'settled') then 'settled'
        when exists (select 1 from settlements s where s.order_id = o.id and s.status = 'frozen') then 'frozen'
        when exists (select 1 from settlements s where s.order_id = o.id and s.status = 'pending') then 'pending'
        when o.status in ('cancelled', 'refunding', 'refunded') then 'cancelled'
        else 'not_ready'
      end
    )::order_item_settlement_status,
    'legacy_backfill'::order_item_source,
    o.created_at,
    o.updated_at
  from orders o
  where not exists (
    select 1
    from order_items oi
    where oi.order_id = o.id
      and oi.service_type = 'photography'
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function assert_order_item_amount_conservation(
  target_order_id uuid,
  require_service_items boolean
)
returns void
language plpgsql
as $$
declare
  parent_total_cents integer;
  item_count bigint;
  item_total_cents bigint;
begin
  select total_amount_cents
  into parent_total_cents
  from orders
  where id = target_order_id;

  if not found then
    return;
  end if;

  select count(*), coalesce(sum(user_payable_cents), 0)
  into item_count, item_total_cents
  from order_items
  where order_id = target_order_id;

  if item_count = 0 then
    if require_service_items then
      raise exception
        using errcode = '23514',
              message = format('order %s cannot remove its final service item', target_order_id);
    end if;
    return;
  end if;

  if item_total_cents <> parent_total_cents then
    raise exception
      using errcode = '23514',
            message = format(
              'order item payable total %s does not match order %s total %s',
              item_total_cents,
              target_order_id,
              parent_total_cents
            );
  end if;
end;
$$;

create or replace function enforce_order_item_amount_conservation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    perform assert_order_item_amount_conservation(old.order_id, true);
    if new.order_id is distinct from old.order_id then
      perform assert_order_item_amount_conservation(new.order_id, true);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform assert_order_item_amount_conservation(old.order_id, true);
    return old;
  end if;

  perform assert_order_item_amount_conservation(new.order_id, true);
  return new;
end;
$$;

create constraint trigger trg_order_items_amount_conservation
after insert or update or delete on order_items
deferrable initially deferred
for each row
execute function enforce_order_item_amount_conservation();

create or replace function enforce_order_amount_conservation()
returns trigger
language plpgsql
as $$
begin
  perform assert_order_item_amount_conservation(new.id, false);
  return new;
end;
$$;

create constraint trigger trg_orders_amount_conservation
after update of total_amount_cents on orders
deferrable initially deferred
for each row
execute function enforce_order_amount_conservation();

create index idx_security_events_actor
on security_events(actor_id, created_at desc);

create index idx_security_events_target
on security_events(target_type, target_id);

create index idx_security_events_type_time
on security_events(event_type, created_at desc);

create table system_configs (
  key varchar(120) primary key,
  value jsonb not null,
  description text,
  updated_by uuid references admin_users(id),
  updated_at timestamptz not null default now()
);

insert into system_configs(key, value, description) values
('platform_fee_rate', '0.08', '平台抽成比例'),
('settlement_delay_days', '3', '订单完成后几天可结算'),
('auto_complete_hours', '24', '服务结束后自动完成小时数'),
('order_payment_timeout_minutes', '15', '订单待支付超时时间'),
('message_violation_limit', '3', '消息违规限制阈值');

insert into risk_keywords(keyword, normalized_keyword, risk_type, risk_level, action) values
('微信', '微信', 'contact', 'high', 'block'),
('VX', 'vx', 'contact', 'high', 'block'),
('V信', 'v信', 'contact', 'high', 'block'),
('加我', '加我', 'contact', 'high', 'block'),
('私下付', '私下付', 'private_payment', 'high', 'block'),
('线下付', '线下付', 'private_payment', 'high', 'block'),
('转账', '转账', 'private_payment', 'high', 'block'),
('银行卡', '银行卡', 'private_payment', 'medium', 'flag'),
('支付宝', '支付宝', 'private_payment', 'medium', 'flag'),
('WhatsApp', 'whatsapp', 'contact', 'medium', 'flag'),
('Telegram', 'telegram', 'contact', 'medium', 'flag'),
('ins', 'ins', 'contact', 'medium', 'flag');
