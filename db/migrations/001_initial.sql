create table if not exists settings(
  id integer primary key,
  current_month char(7) not null,
  aud_cny_rate numeric(12,6) not null,
  updated_at timestamptz default now()
);

create table if not exists accounts(
  id serial primary key,
  name text not null,
  kind text not null check(kind in ('资产','负债')),
  category text not null,
  currency char(3) not null check(currency in ('AUD','CNY')),
  active boolean not null default true,
  opened_month char(7),
  closed_month char(7),
  sort_order integer not null
);

create table if not exists monthly_balances(
  id bigserial primary key,
  account_id integer not null references accounts(id),
  month char(7) not null,
  balance numeric(18,2) not null,
  note text,
  updated_at timestamptz default now(),
  unique(account_id,month)
);

create table if not exists monthly_exchange_rates(
  month char(7) primary key,
  aud_cny_rate numeric(12,6) not null,
  updated_at timestamptz default now()
);

create table if not exists installments(
  id serial primary key,
  platform text not null,
  item text,
  total_principal numeric(18,2) not null,
  principal_per_period numeric(18,2) not null,
  fee_per_period numeric(18,2) not null default 0,
  paid_periods integer not null,
  total_periods integer not null,
  first_payment_date date not null,
  created_at timestamptz default now()
);

create table if not exists mortgage_settings(
  id integer primary key,
  total_loan numeric(18,2),
  annual_rate numeric(12,8),
  years numeric(8,3),
  scheduled_payment numeric(18,2),
  loan_balance numeric(18,2),
  offset_balance numeric(18,2),
  monthly_income numeric(18,2),
  extra_payment numeric(18,2),
  total_monthly_payment numeric(18,2),
  annual_payment_growth numeric(12,8)
);

insert into settings values(1,to_char(current_date,'YYYY-MM'),1,now()) on conflict(id) do nothing;
