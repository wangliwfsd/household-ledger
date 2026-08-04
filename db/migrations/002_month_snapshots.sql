create table if not exists month_snapshots(
  id bigserial primary key,
  month char(7) not null,
  reason text not null default 'before_history_edit',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists month_snapshots_month_created_idx
  on month_snapshots(month, created_at desc);
