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

-- =========================
-- Users
-- =========================

create table users (
  id uuid primary key default gen_random_uuid(),
  phone varchar(32) not null unique,
  email varchar(255),
  nickname varchar(80) not null,
  avatar_url text,
  gender varchar(20) not null default 'unknown',
  birthday date,
  city varchar(80),
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
  unique(companion_id, activity_name, duration_minutes)
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
