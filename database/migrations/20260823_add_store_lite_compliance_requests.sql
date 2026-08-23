begin;

-- Store Lite compliance intake is independent from payments, orders, messages,
-- media uploads, and merchants. Existing reports retain their order context.
do $$ begin
  create type report_context as enum ('order', 'store_lite_content');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_request_type as enum ('support', 'data_access', 'data_copy', 'account_deletion');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_request_status as enum ('submitted', 'processing', 'completed', 'declined', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_request_actor_type as enum ('user', 'admin', 'system');
exception when duplicate_object then null;
end $$;

alter table reports
  add column if not exists report_context report_context not null default 'order',
  add column if not exists client_request_id varchar(160),
  add column if not exists request_fingerprint varchar(128);

do $$ begin
  alter table reports
    add constraint ck_reports_request_idempotency_pair
    check (
      (client_request_id is null and request_fingerprint is null)
      or
      (
        client_request_id is not null
        and btrim(client_request_id) <> ''
        and request_fingerprint is not null
        and btrim(request_fingerprint) <> ''
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table reports
    add constraint ck_reports_store_lite_content_shape
    check (
      report_context <> 'store_lite_content'
      or
      (
        target_type in ('post', 'companion')
        and target_id is not null
        and reported_user_id is not null
        and reported_user_id <> reporter_id
        and order_id is null
        and conversation_id is null
        and category in ('content_violation', 'safety', 'fraud', 'privacy_or_rights', 'other')
        and (description is null or char_length(btrim(description)) between 1 and 2000)
        and evidence_files = '[]'::jsonb
        and client_request_id is not null
        and request_fingerprint is not null
      )
    );
exception when duplicate_object then null;
end $$;

create unique index if not exists uq_reports_store_lite_reporter_client
on reports(reporter_id, client_request_id)
where report_context = 'store_lite_content';

create index if not exists idx_reports_store_lite_reporter_created
on reports(reporter_id, report_context, created_at desc, id desc);

create index if not exists idx_reports_store_lite_operator_queue
on reports(report_context, status, created_at, id);

-- Store Lite blocks photographers, not arbitrary users. The write gateway
-- resolves the companion and rejects attempts to block the user's own profile.
create table if not exists user_companion_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  companion_id uuid not null references companions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint uq_user_companion_blocks_user_companion unique (user_id, companion_id)
);

create index if not exists idx_user_companion_blocks_user_created
on user_companion_blocks(user_id, created_at desc, id desc);

create table if not exists user_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  request_type user_request_type not null,
  support_category varchar(80),
  booking_request_id uuid,
  description varchar(2000),
  client_request_id varchar(160) not null,
  request_fingerprint varchar(128) not null,
  status user_request_status not null default 'submitted',
  processing_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_requests_id_user unique (id, user_id),
  constraint uq_user_requests_user_client unique (user_id, client_request_id),
  constraint fk_user_requests_booking_owner
    foreign key (booking_request_id, user_id)
    references booking_requests(id, user_id),
  constraint ck_user_requests_client_request_id
    check (btrim(client_request_id) <> ''),
  constraint ck_user_requests_request_fingerprint
    check (btrim(request_fingerprint) <> ''),
  constraint ck_user_requests_description
    check (description is null or btrim(description) <> ''),
  constraint ck_user_requests_type_scope
    check (
      (
        request_type = 'support'
        and support_category in ('booking', 'safety', 'account', 'privacy', 'other')
      )
      or
      (
        request_type <> 'support'
        and support_category is null
        and booking_request_id is null
      )
    ),
  constraint ck_user_requests_status_outcome
    check (
      (
        status = 'submitted'
        and processing_at is null
        and completed_at is null
        and declined_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'processing'
        and processing_at is not null
        and completed_at is null
        and declined_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'completed'
        and processing_at is not null
        and completed_at is not null
        and declined_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'declined'
        and completed_at is null
        and declined_at is not null
        and cancelled_at is null
      )
      or
      (
        status = 'cancelled'
        and completed_at is null
        and declined_at is null
        and cancelled_at is not null
      )
    )
);

create index if not exists idx_user_requests_user_created
on user_requests(user_id, created_at desc, id desc);

create index if not exists idx_user_requests_user_type_status_created
on user_requests(user_id, request_type, status, created_at desc, id desc);

create index if not exists idx_user_requests_operator_queue
on user_requests(status, created_at, id);

create unique index if not exists uq_user_requests_active_account_deletion
on user_requests(user_id)
where request_type = 'account_deletion'
  and status in ('submitted', 'processing');

-- The gateway updates user_requests, appends this log, and mirrors every admin
-- action to admin_action_logs in one transaction. SQL can constrain actor and
-- transition shape; the gateway remains authoritative for forbidding an admin
-- from completing an account_deletion request (only the future system executor may).
create table if not exists user_request_status_logs (
  id uuid primary key default gen_random_uuid(),
  user_request_id uuid not null references user_requests(id) on delete cascade,
  from_status user_request_status,
  to_status user_request_status not null,
  actor_type user_request_actor_type not null,
  actor_user_id uuid references users(id),
  actor_admin_id uuid references admin_users(id),
  reason_code varchar(80),
  public_message varchar(1000),
  created_at timestamptz not null default now(),
  constraint fk_user_request_status_user_owner
    foreign key (user_request_id, actor_user_id)
    references user_requests(id, user_id),
  constraint ck_user_request_status_actor
    check (
      (actor_type = 'user' and actor_user_id is not null and actor_admin_id is null)
      or
      (actor_type = 'admin' and actor_user_id is null and actor_admin_id is not null)
      or
      (actor_type = 'system' and actor_user_id is null and actor_admin_id is null)
    ),
  constraint ck_user_request_status_transition
    check (
      (
        from_status is null
        and to_status = 'submitted'
        and actor_type = 'user'
      )
      or
      (
        from_status = 'submitted'
        and to_status = 'processing'
        and actor_type = 'admin'
      )
      or
      (
        from_status in ('submitted', 'processing')
        and to_status = 'declined'
        and actor_type = 'admin'
      )
      or
      (
        from_status in ('submitted', 'processing')
        and to_status = 'cancelled'
        and actor_type = 'user'
      )
      or
      (
        from_status = 'processing'
        and to_status = 'completed'
        and actor_type in ('admin', 'system')
      )
    ),
  constraint ck_user_request_status_reason
    check (
      to_status <> 'declined'
      or
      (
        reason_code is not null
        and btrim(reason_code) <> ''
        and public_message is not null
        and btrim(public_message) <> ''
      )
    )
);

create index if not exists idx_user_request_status_logs_request
on user_request_status_logs(user_request_id, created_at, id);

create index if not exists idx_user_request_status_logs_admin
on user_request_status_logs(actor_admin_id, created_at desc)
where actor_admin_id is not null;

commit;
