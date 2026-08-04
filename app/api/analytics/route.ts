import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const categories = ["流动资产", "投资资产", "自用资产", "短期负债", "长期负债"];

export async function GET() {
  try {
    const sql = db();
    const settings = (await sql`select current_month,aud_cny_rate::float as rate from settings where id=1`)[0];
    const currentMonth = String(settings?.current_month);
    const defaultRate = Number(settings?.rate || 1);
    const rows = await sql`
      with months as (
        select distinct month from monthly_balances
        union select ${currentMonth}::char(7)
      )
      select m.month,a.id,a.name,a.kind,a.category,a.currency,
        coalesce(b.balance,0)::float as balance,
        coalesce(xr.aud_cny_rate,${defaultRate})::float as rate
      from months m cross join accounts a
      left join monthly_exchange_rates xr on xr.month=m.month
      left join lateral (
        select balance from monthly_balances mb
        where mb.account_id=a.id and mb.month<=m.month
        order by mb.month desc limit 1
      ) b on true
      where (a.opened_month is null or a.opened_month<=m.month)
        and (a.closed_month is null or a.closed_month>=m.month)
      order by m.month,a.sort_order,a.id`;

    const monthMap = new Map<string,{month:string;assets:number;liabilities:number;net:number;categories:Record<string,number>}>();
    const accountMap = new Map<number,{id:number;name:string;kind:string;category:string;currency:string;points:Array<{month:string;value:number;nativeValue:number}>}>();
    for (const row of rows) {
      const month = String(row.month);
      if (!monthMap.has(month)) monthMap.set(month,{month,assets:0,liabilities:0,net:0,categories:Object.fromEntries(categories.map(category=>[category,0]))});
      const monthPoint = monthMap.get(month)!;
      const nativeValue = Number(row.balance);
      const value = row.currency === "CNY" ? nativeValue / Number(row.rate) : nativeValue;
      if (row.kind === "资产") monthPoint.assets += value; else monthPoint.liabilities += value;
      monthPoint.net = monthPoint.assets - monthPoint.liabilities;
      if (categories.includes(String(row.category))) monthPoint.categories[String(row.category)] += value;
      const id = Number(row.id);
      if (!accountMap.has(id)) accountMap.set(id,{id,name:String(row.name),kind:String(row.kind),category:String(row.category),currency:String(row.currency),points:[]});
      accountMap.get(id)!.points.push({month,value,nativeValue});
    }
    return NextResponse.json({months:[...monthMap.values()],accounts:[...accountMap.values()]});
  } catch { return NextResponse.json({error:"analytics unavailable"},{status:503}); }
}
