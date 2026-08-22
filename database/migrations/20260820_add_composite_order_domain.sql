begin;

-- This migration is deliberately additive. Existing order/payment writes keep
-- using orders until ENABLE_COMPOSITE_ORDER_DOMAIN is explicitly enabled.
do $$ begin
  create type merchant_status as enum ('draft', 'pending_review', 'active', 'suspended', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type merchant_link_status as enum ('pending', 'confirmed', 'rejected', 'ended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_service_type as enum ('photography', 'makeup', 'clothing', 'makeup_clothing', 'venue', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_provider_type as enum ('companion', 'merchant');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_acceptance_status as enum ('not_requested', 'pending', 'accepted', 'declined', 'expired', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_fulfillment_status as enum ('not_started', 'in_service', 'completed', 'cancelled', 'disputed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_refund_status as enum ('not_requested', 'pending', 'processing', 'partially_refunded', 'refunded', 'rejected', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_settlement_status as enum ('not_ready', 'pending', 'frozen', 'settled', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_item_source as enum ('legacy_backfill', 'composite');
exception when duplicate_object then null;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'activity_pricings'::regclass
      and conname = 'uq_activity_pricing_identity'
  ) then
    alter table activity_pricings
    add constraint uq_activity_pricing_identity unique (companion_id, id);
  end if;
end $$;

create table if not exists merchants (
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

create index if not exists idx_merchants_city_status
on merchants(city, status, service_enabled);

create index if not exists idx_merchants_owner
on merchants(owner_user_id)
where owner_user_id is not null;

create table if not exists merchant_offerings (
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

create index if not exists idx_merchant_offerings_merchant_enabled
on merchant_offerings(merchant_id, enabled, service_type);

create unique index if not exists uq_merchant_offering_identity
on merchant_offerings(id, merchant_id, version, service_type);

create table if not exists photographer_merchant_links (
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

create unique index if not exists uq_photographer_primary_merchant
on photographer_merchant_links(companion_id)
where is_primary = true and status = 'confirmed';

create index if not exists idx_photographer_merchant_links_merchant
on photographer_merchant_links(merchant_id, status);

create unique index if not exists uq_orders_id_companion
on orders(id, companion_id);

create table if not exists order_items (
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

-- Keep this migration repeatable for a database where an earlier development
-- revision created order_items before the subsidy/payable columns existed.
alter table order_items
add column if not exists platform_subsidy_cents integer not null default 0;

alter table order_items
add column if not exists user_payable_cents integer not null default 0;

update order_items
set user_payable_cents = total_amount_cents - platform_subsidy_cents
where user_payable_cents <> total_amount_cents - platform_subsidy_cents;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'ck_order_items_platform_subsidy_bounds'
  ) then
    alter table order_items
    add constraint ck_order_items_platform_subsidy_bounds
    check (platform_subsidy_cents >= 0 and platform_subsidy_cents <= total_amount_cents);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'ck_order_items_user_payable_formula'
  ) then
    alter table order_items
    add constraint ck_order_items_user_payable_formula
    check (user_payable_cents = total_amount_cents - platform_subsidy_cents);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'ck_order_items_refund_payable_bounds'
  ) then
    alter table order_items
    add constraint ck_order_items_refund_payable_bounds
    check (refunded_amount_cents >= 0 and refunded_amount_cents <= user_payable_cents);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'ck_order_items_provider_shape'
  ) then
    alter table order_items
    add constraint ck_order_items_provider_shape
    check (
      (
        provider_type = 'companion'
        and provider_companion_id is not null
        and provider_merchant_id is null
        and merchant_offering_id is null
        and offering_version is null
      )
      or
      (provider_type = 'merchant' and provider_merchant_id is not null and provider_companion_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'fk_order_items_order_companion'
  ) then
    alter table order_items
    add constraint fk_order_items_order_companion
    foreign key (order_id, provider_companion_id)
    references orders(id, companion_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'fk_order_items_activity_pricing_identity'
  ) then
    alter table order_items
    add constraint fk_order_items_activity_pricing_identity
    foreign key (provider_companion_id, activity_pricing_id)
    references activity_pricings(companion_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'order_items'::regclass
      and conname = 'fk_order_items_merchant_offering_identity'
  ) then
    alter table order_items
    add constraint fk_order_items_merchant_offering_identity
    foreign key (merchant_offering_id, provider_merchant_id, offering_version, service_type)
    references merchant_offerings(id, merchant_id, version, service_type);
  end if;
end $$;

create index if not exists idx_order_items_order
on order_items(order_id, item_no);

create index if not exists idx_order_items_provider_companion
on order_items(provider_companion_id, acceptance_status, start_at)
where provider_companion_id is not null;

create index if not exists idx_order_items_provider_merchant
on order_items(provider_merchant_id, acceptance_status, start_at)
where provider_merchant_id is not null;

create index if not exists idx_order_items_acceptance_deadline
on order_items(acceptance_status, acceptance_deadline_at)
where acceptance_status = 'pending' and acceptance_deadline_at is not null;

-- Idempotent compatibility backfill. The aggregate order remains authoritative;
-- no trigger or current order write is changed while the feature is disabled.
create or replace function backfill_missing_photography_order_items()
returns bigint
language plpgsql
as $$
declare
  inserted_count bigint;
begin
insert into order_items (
  order_id,
  item_no,
  service_type,
  provider_type,
  provider_companion_id,
  activity_pricing_id,
  service_name_snapshot,
  duration_minutes,
  start_at,
  end_at,
  base_amount_cents,
  extra_amount_cents,
  discount_amount_cents,
  total_amount_cents,
  platform_subsidy_cents,
  user_payable_cents,
  platform_fee_cents,
  provider_income_cents,
  pricing_snapshot,
  acceptance_status,
  accepted_at,
  fulfillment_status,
  service_started_at,
  completed_at,
  cancelled_at,
  refund_status,
  refunded_amount_cents,
  settlement_status,
  source,
  created_at,
  updated_at
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
      when o.confirmed_at is not null or o.status in ('confirmed', 'in_service', 'completed', 'disputed')
        then 'accepted'
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

select backfill_missing_photography_order_items();

do $$ begin
  if exists (
    select 1
    from orders o
    join order_items oi on oi.order_id = o.id
    group by o.id, o.total_amount_cents
    having sum(oi.user_payable_cents) <> o.total_amount_cents
  ) then
    raise exception using
      errcode = '23514',
      message = 'order item payable totals do not match their aggregate orders';
  end if;
end $$;

drop function if exists assert_order_item_amount_conservation(uuid);

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

drop trigger if exists trg_order_items_amount_conservation on order_items;
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

drop trigger if exists trg_orders_amount_conservation on orders;
create constraint trigger trg_orders_amount_conservation
after update of total_amount_cents on orders
deferrable initially deferred
for each row
execute function enforce_order_amount_conservation();

commit;
