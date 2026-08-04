alter table installments
  add column if not exists current_period_in_account_balance boolean not null default false;

with remaining as (
  select coalesce(sum(
    greatest(0,total_periods-greatest(
      paid_periods,
      case when first_payment_date>current_date then 0 else least(total_periods,
        extract(year from age(date_trunc('month',current_date),date_trunc('month',first_payment_date)))::int*12+
        extract(month from age(date_trunc('month',current_date),date_trunc('month',first_payment_date)))::int+1
      ) end
    )-case when current_period_in_account_balance then 1 else 0 end)*(principal_per_period+fee_per_period)
  ),0) as balance
  from installments
)
insert into monthly_balances(account_id,month,balance,updated_at)
select a.id,s.current_month,r.balance,now()
from accounts a cross join settings s cross join remaining r
where a.name='消费分期'
order by a.id limit 1
on conflict(account_id,month)
do update set balance=excluded.balance,updated_at=now();
