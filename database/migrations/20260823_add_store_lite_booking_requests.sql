begin;

-- Store Lite booking requests are deliberately independent from orders,
-- payments, messages, media, and merchant/composite-order tables.
do $$ begin
  create type booking_request_status as enum ('submitted', 'confirmed', 'declined', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type booking_request_actor_type as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists booking_requests (
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

create index if not exists idx_booking_requests_user_created
on booking_requests(user_id, created_at desc, id desc);

create index if not exists idx_booking_requests_user_status_created
on booking_requests(user_id, status, created_at desc, id desc);

create index if not exists idx_booking_requests_operator_queue
on booking_requests(status, created_at, id);

create index if not exists idx_booking_requests_companion_time
on booking_requests(companion_id, status, requested_start_at, id);

-- The write gateway must update booking_requests, append this status log, and
-- mirror every admin decision/cancellation to admin_action_logs in one transaction.
create table if not exists booking_request_status_logs (
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

create index if not exists idx_booking_request_status_logs_request
on booking_request_status_logs(booking_request_id, created_at, id);

create index if not exists idx_booking_request_status_logs_admin
on booking_request_status_logs(actor_admin_id, created_at desc)
where actor_admin_id is not null;

commit;
