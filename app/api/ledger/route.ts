import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const sql=db();
    const settings=await sql`select current_month, aud_cny_rate from settings where id=1`;
    const currentMonth=String(settings[0]?.current_month || "2026-08");
    const requestedMonth=new URL(request.url).searchParams.get("month");
    const month=requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentMonth;
    const defaultRate=Number(settings[0]?.aud_cny_rate||4.82);
    const monthRates=await sql`select aud_cny_rate::float as rate from monthly_exchange_rates where month=${month}`;
    const rate=Number(monthRates[0]?.rate||defaultRate);
    const accounts=await sql`
      select a.id,a.name,a.kind,a.category,a.currency,a.active,
             coalesce(prev.balance,0)::float as previous,
             coalesce(cur.balance,prev.balance,0)::float as current
      from accounts a
      left join monthly_balances cur on cur.account_id=a.id and cur.month=${month}
      left join lateral (select balance from monthly_balances b where b.account_id=a.id and b.month<${month} order by b.month desc limit 1) prev on true
      where (a.opened_month is null or a.opened_month<=${month})
        and (a.closed_month is null or a.closed_month>=${month})
      order by a.sort_order`;
    if(month===currentMonth){
      const installments=await sql`select principal_per_period::float as principal,fee_per_period::float as fee,paid_periods as paid,total_periods as total,first_payment_date::text as first_date,current_period_in_account_balance as current_in_account from installments`;
      const now=new Date();
      const installmentBalance=installments.reduce((sum,row)=>{
        const first=new Date(String(row.first_date)+"T00:00:00");
        const automatic=first>now?0:Math.max(0,(now.getFullYear()-first.getFullYear())*12+now.getMonth()-first.getMonth()+1);
        const remaining=Math.max(0,Number(row.total)-Math.max(Number(row.paid),automatic)-(row.current_in_account?1:0));
        return sum+remaining*(Number(row.principal)+Number(row.fee));
      },0);
      const linked=accounts.find(a=>a.name==="消费分期");
      if(linked) linked.current=Math.round(installmentBalance*100)/100;
    }
    const monthNote=await sql`select note from monthly_balances where month=${month} and note is not null and note<>'' order by updated_at desc limit 1`;
    const history=await sql`
      with months as (select distinct month from monthly_balances union select ${currentMonth}::char(7))
      select m.month,
        coalesce(sum((case when a.kind='资产' then 1 else -1 end) * (case when a.currency='CNY' then b.balance/coalesce(xr.aud_cny_rate,${defaultRate}) else b.balance end)),0)::float as net,
        coalesce(sum(case when a.kind='资产' then (case when a.currency='CNY' then b.balance/coalesce(xr.aud_cny_rate,${defaultRate}) else b.balance end) else 0 end),0)::float as assets,
        coalesce(sum(case when a.kind='负债' then (case when a.currency='CNY' then b.balance/coalesce(xr.aud_cny_rate,${defaultRate}) else b.balance end) else 0 end),0)::float as liabilities
      from months m cross join accounts a
      left join monthly_exchange_rates xr on xr.month=m.month
      left join lateral (select balance from monthly_balances mb where mb.account_id=a.id and mb.month<=m.month order by mb.month desc limit 1) b on true
      where (a.opened_month is null or a.opened_month<=m.month) and (a.closed_month is null or a.closed_month>=m.month)
      group by m.month order by m.month`;
    return NextResponse.json({month,currentMonth,rate,note:String(monthNote[0]?.note||""),accounts,history});
  } catch { return NextResponse.json({error:"database unavailable"},{status:503}); }
}

export async function PUT(request:Request) {
  try {
    const body=await request.json(); const sql=db();
    if(body.preserveCurrentMonth){
      const defaultRate=Number((await sql`select aud_cny_rate from settings where id=1`)[0]?.aud_cny_rate||body.rate);
      const storedRate=Number((await sql`select aud_cny_rate from monthly_exchange_rates where month=${body.month}`)[0]?.aud_cny_rate||defaultRate);
      const storedNote=String((await sql`select note from monthly_balances where month=${body.month} and note is not null and note<>'' order by updated_at desc limit 1`)[0]?.note||"");
      const storedBalances=await sql`select a.id,coalesce(cur.balance,prev.balance,0)::float as balance from accounts a left join monthly_balances cur on cur.account_id=a.id and cur.month=${body.month} left join lateral (select balance from monthly_balances b where b.account_id=a.id and b.month<${body.month} order by b.month desc limit 1) prev on true where (a.opened_month is null or a.opened_month<=${body.month}) and (a.closed_month is null or a.closed_month>=${body.month})`;
      const balanceById=new Map(storedBalances.map(row=>[Number(row.id),Number(row.balance)]));
      const unchanged=Math.abs(storedRate-Number(body.rate))<0.000001&&storedNote===String(body.note||"")&&body.accounts.every((account:{id:number;current:number})=>Math.abs((balanceById.get(Number(account.id))??0)-Number(account.current))<0.005);
      if(unchanged)return NextResponse.json({ok:true,noChange:true});
    }
    await sql.begin(async tx=>{
      if(body.preserveCurrentMonth){
        const note=String((await tx`select note from monthly_balances where month=${body.month} and note is not null and note<>'' order by updated_at desc limit 1`)[0]?.note||"");
        const balances=await tx`select a.id as "accountId",coalesce(cur.balance,prev.balance,0)::float as balance,${note}::text as note from accounts a left join monthly_balances cur on cur.account_id=a.id and cur.month=${body.month} left join lateral (select balance from monthly_balances b where b.account_id=a.id and b.month<${body.month} order by b.month desc limit 1) prev on true where (a.opened_month is null or a.opened_month<=${body.month}) and (a.closed_month is null or a.closed_month>=${body.month}) order by a.id`;
        const defaultRate=Number((await tx`select aud_cny_rate from settings where id=1`)[0]?.aud_cny_rate||body.rate);
        const rate=Number((await tx`select aud_cny_rate from monthly_exchange_rates where month=${body.month}`)[0]?.aud_cny_rate||defaultRate);
        await tx`insert into month_snapshots(month,reason,snapshot) values(${body.month},'before_history_edit',${tx.json({month:body.month,rate,balances})})`;
      }
      await tx`insert into monthly_exchange_rates(month,aud_cny_rate,updated_at) values(${body.month},${body.rate},now()) on conflict(month) do update set aud_cny_rate=excluded.aud_cny_rate,updated_at=now()`;
      if(!body.preserveCurrentMonth) await tx`update settings set current_month=${body.month},aud_cny_rate=${body.rate},updated_at=now() where id=1`;
      for(const a of body.accounts){
        await tx`insert into monthly_balances(account_id,month,balance,note) values(${a.id},${body.month},${a.current},${body.note||null}) on conflict(account_id,month) do update set balance=excluded.balance,note=excluded.note,updated_at=now()`;
        if(!body.preserveCurrentMonth) await tx`update accounts set active=${a.active},closed_month=${a.active?null:body.month} where id=${a.id}`;
      }
    });
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:"save failed"},{status:500}); }
}
