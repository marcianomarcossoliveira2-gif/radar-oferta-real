create table if not exists public.radar_push_config (
 id integer primary key check (id=1), public_key text not null, private_key text not null, dispatch_token text not null,
 dispatch_locked_until timestamptz not null default '1970-01-01'
);
create table if not exists public.radar_push_subscriptions (
 endpoint_hash text primary key, token_hash text not null, subscription jsonb not null,
 query text not null default '' check(length(query)<=100),
 max_price numeric check(max_price>0), created_at timestamptz not null default now(),
 last_checked_at timestamptz not null default '1970-01-01', last_sent_at timestamptz,
 enabled boolean not null default true
);
create table if not exists public.radar_push_deliveries (
 endpoint_hash text not null references public.radar_push_subscriptions(endpoint_hash) on delete cascade,
 offer_key text not null, created_at timestamptz not null default now(),
 primary key(endpoint_hash,offer_key)
);
alter table public.radar_push_config enable row level security;
alter table public.radar_push_subscriptions enable row level security;
alter table public.radar_push_deliveries enable row level security;
revoke all on public.radar_push_config, public.radar_push_subscriptions, public.radar_push_deliveries from public,anon,authenticated;
grant all on public.radar_push_config, public.radar_push_subscriptions, public.radar_push_deliveries to service_role;
create index if not exists radar_push_pending on public.radar_push_subscriptions(last_checked_at) where enabled;

