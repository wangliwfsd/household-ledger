import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const validMonth = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}$/.test(value);

async function capture(
  sql: ReturnType<typeof db>,
  month: string,
  reason: string,
) {
  const balances =
    await sql`select account_id as "accountId",balance::float,note from monthly_balances where month=${month} order by account_id`;
  const rate =
    (
      await sql`select aud_cny_rate::float as rate from monthly_exchange_rates where month=${month}`
    )[0]?.rate ?? null;
  const snapshot = { month, rate, balances };
  const rows =
    await sql`insert into month_snapshots(month,reason,snapshot) values(${month},${reason},${sql.json(snapshot)}) returning id,created_at`;
  return rows[0];
}

export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get("month");
    if (!validMonth(month))
      return NextResponse.json({ error: "invalid month" }, { status: 400 });
    const sql = db();
    const versions =
      await sql`select id,month,reason,created_at as "createdAt",snapshot from month_snapshots where month=${month} order by created_at desc,id desc`;
    return NextResponse.json({ versions });
  } catch {
    return NextResponse.json(
      { error: "snapshot load failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sql = db();
    if (body.action === "capture" && validMonth(body.month)) {
      return NextResponse.json({
        snapshot: await capture(
          sql,
          body.month,
          String(body.reason || "manual"),
        ),
      });
    }
    if (body.action !== "restore" || !Number.isInteger(Number(body.id)))
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    const rows =
      await sql`select month,snapshot from month_snapshots where id=${Number(body.id)}`;
    if (!rows.length)
      return NextResponse.json(
        { error: "snapshot not found" },
        { status: 404 },
      );
    const month = String(rows[0].month);
    const snapshot = rows[0].snapshot as {
      rate: number | null;
      balances: Array<{
        accountId: number;
        balance: number;
        note: string | null;
      }>;
    };
    await sql.begin(async (transaction) => {
      const currentBalances =
        await transaction`select account_id as "accountId",balance::float,note from monthly_balances where month=${month} order by account_id`;
      const currentRate =
        (
          await transaction`select aud_cny_rate::float as rate from monthly_exchange_rates where month=${month}`
        )[0]?.rate ?? null;
      await transaction`insert into month_snapshots(month,reason,snapshot) values(${month},'before_restore',${transaction.json({ month, rate: currentRate, balances: currentBalances })})`;
      await transaction`delete from monthly_balances where month=${month}`;
      for (const balance of snapshot.balances)
        await transaction`insert into monthly_balances(account_id,month,balance,note,updated_at) values(${balance.accountId},${month},${balance.balance},${balance.note},now())`;
      if (snapshot.rate === null)
        await transaction`delete from monthly_exchange_rates where month=${month}`;
      else
        await transaction`insert into monthly_exchange_rates(month,aud_cny_rate,updated_at) values(${month},${snapshot.rate},now()) on conflict(month) do update set aud_cny_rate=excluded.aud_cny_rate,updated_at=now()`;
    });
    return NextResponse.json({ ok: true, month });
  } catch {
    return NextResponse.json(
      { error: "snapshot restore failed" },
      { status: 500 },
    );
  }
}
