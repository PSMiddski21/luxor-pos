-- Luxor POS schema (Postgres / Supabase)
-- Replaces the Dailylog / Customer log / Stock / Prices / Rota / Timesheets tabs
-- from the original Google Sheet with a relational model.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table customers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  email           text,
  minutes_balance integer not null default 0 check (minutes_balance >= 0),
  notes           text,
  created_at      timestamptz not null default now()
);

create table staff (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text not null check (role in ('owner', 'manager', 'staff')),
  pay_rate_pence integer, -- hourly rate, pence, to avoid float rounding
  pin_hash      text,     -- for clock-in PIN pad auth
  active        boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Catalogue & stock
-- ---------------------------------------------------------------------------

create table beds (
  id     uuid primary key default gen_random_uuid(),
  label  text not null,
  status text not null default 'available'
         check (status in ('available', 'in_use', 'maintenance'))
);

create table products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  category     text not null check (category in ('tanning_minutes', 'retail')),
  price_pence  integer not null check (price_pence >= 0),
  minutes      integer,           -- set when category = 'tanning_minutes' (e.g. 10, 15, 100, 200)
  track_stock  boolean not null default false,
  active       boolean not null default true
);

create table stock_items (
  product_id        uuid primary key references products(id) on delete cascade,
  quantity_on_hand  integer not null default 0,
  reorder_level     integer not null default 0,
  supplier          text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Point of sale
-- ---------------------------------------------------------------------------

create table transactions (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  customer_id  uuid references customers(id),   -- null = walk-in, no account
  bed_id       uuid references beds(id),        -- null = retail-only sale
  staff_id     uuid references staff(id),
  cash_pence   integer not null default 0 check (cash_pence >= 0),
  card_pence   integer not null default 0 check (card_pence >= 0), -- card / bank transfer
  total_pence  integer not null check (total_pence >= 0),
  notes        text
);

create table transaction_lines (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    uuid not null references transactions(id) on delete cascade,
  product_id        uuid not null references products(id),
  quantity          integer not null default 1 check (quantity > 0),
  unit_price_pence  integer not null check (unit_price_pence >= 0),
  minutes_applied   integer -- minutes credited to the customer's balance by this line
);

create index on transactions (occurred_at);
create index on transactions (customer_id);
create index on transaction_lines (transaction_id);

-- ---------------------------------------------------------------------------
-- Rota & timesheets
-- ---------------------------------------------------------------------------

create table shifts (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id),
  shift_date     date not null,
  planned_start  time not null,
  planned_end    time not null
);

create table timesheets (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff(id),
  shift_id   uuid references shifts(id),
  clock_in   timestamptz not null,
  clock_out  timestamptz
);

create index on shifts (staff_id, shift_date);
create index on timesheets (staff_id, clock_in);

-- ---------------------------------------------------------------------------
-- sell_product: atomic checkout of one line.
--
-- This is the fix for the riskiest part of the old sheet, where a customer's
-- remaining tanning minutes lived as free text in a "Comments" cell and
-- retail stock was reconciled by hand against a separate tab. Here, a single
-- transaction either fully applies (balance debited/credited, stock
-- decremented, line recorded) or fully rolls back.
-- ---------------------------------------------------------------------------

create or replace function sell_product(
  p_transaction_id uuid,
  p_product_id     uuid,
  p_quantity       integer,
  p_customer_id    uuid default null
) returns void as $$
declare
  v_product products%rowtype;
begin
  select * into v_product from products where id = p_product_id;

  insert into transaction_lines (transaction_id, product_id, quantity, unit_price_pence, minutes_applied)
  values (
    p_transaction_id,
    p_product_id,
    p_quantity,
    v_product.price_pence,
    case when v_product.category = 'tanning_minutes' then v_product.minutes * p_quantity else null end
  );

  if v_product.category = 'tanning_minutes' and p_customer_id is not null then
    update customers
    set minutes_balance = minutes_balance + (v_product.minutes * p_quantity)
    where id = p_customer_id;
  end if;

  if v_product.track_stock then
    update stock_items
    set quantity_on_hand = quantity_on_hand - p_quantity,
        updated_at = now()
    where product_id = p_product_id;
  end if;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- use_minutes: log a bed session against a customer's *existing* prepaid
-- balance (no payment taken — they already paid when they bought the pack).
-- This is distinct from sell_product, which is what credits the balance in
-- the first place. Keeping the two separate mirrors how staff actually work
-- the till: "sell a pack" vs. "log today's session".
-- ---------------------------------------------------------------------------

create or replace function use_minutes(
  p_customer_id uuid,
  p_bed_id      uuid,
  p_minutes     integer
) returns void as $$
begin
  update customers
  set minutes_balance = minutes_balance - p_minutes
  where id = p_customer_id
    and minutes_balance >= p_minutes;

  if not found then
    raise exception 'Customer % does not have % minutes available', p_customer_id, p_minutes;
  end if;
end;
$$ language plpgsql;
