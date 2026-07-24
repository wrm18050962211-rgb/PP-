begin;

create table if not exists phone_verification_challenges (
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

create index if not exists idx_phone_verification_phone_purpose
on phone_verification_challenges(phone, purpose, created_at desc);

create index if not exists idx_phone_verification_ip_created
on phone_verification_challenges(requested_ip, created_at desc)
where requested_ip is not null;

commit;
