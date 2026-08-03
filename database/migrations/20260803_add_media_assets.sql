begin;

create type media_asset_status as enum (
  'pending_upload',
  'uploaded',
  'rejected',
  'expired',
  'deleted'
);

create type media_asset_visibility as enum (
  'public',
  'private'
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  provider varchar(40) not null,
  bucket varchar(160) not null,
  region varchar(80) not null,
  object_key text not null unique,
  public_url text,
  purpose varchar(40) not null,
  visibility media_asset_visibility not null default 'public',
  content_type varchar(120) not null,
  file_extension varchar(16) not null,
  declared_size_bytes bigint not null,
  size_bytes bigint,
  max_size_bytes bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  status media_asset_status not null default 'pending_upload',
  audit_status audit_status not null default 'pending',
  provider_etag varchar(160),
  failure_code varchar(80),
  expires_at timestamptz not null,
  uploaded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (declared_size_bytes > 0),
  check (max_size_bytes > 0),
  check (declared_size_bytes <= max_size_bytes),
  check (size_bytes is null or (size_bytes > 0 and size_bytes <= max_size_bytes)),
  check (width is null or width > 0),
  check (height is null or height > 0),
  check (duration_ms is null or duration_ms > 0)
);

create index idx_media_assets_owner_status
on media_assets(owner_user_id, status, created_at desc);

create index idx_media_assets_pending_expiry
on media_assets(expires_at)
where status = 'pending_upload';

create table media_asset_events (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  from_status media_asset_status,
  to_status media_asset_status not null,
  reason_code varchar(80),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_media_asset_events_asset_created
on media_asset_events(media_asset_id, created_at asc);

commit;
