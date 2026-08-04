import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
export const dynamic = "force-dynamic";
async function syncLedger(sql: ReturnType<typeof db>) {
  const rows =
    await sql`select principal_per_period::float as principal,fee_per_period::float as fee,paid_periods as paid,total_periods as total,first_payment_date::text as first_date,current_period_in_account_balance as current_in_account from installments`;
  const now = new Date();
  const balance = rows.reduce((sum, row) => {
    const first = new Date(String(row.first_date) + "T00:00:00"),
      automatic =
        first > now
          ? 0
          : Math.max(
              0,
              (now.getFullYear() - first.getFullYear()) * 12 +
                now.getMonth() -
                first.getMonth() +
                1,
            ),
      remaining = Math.max(
        0,
        Number(row.total) - Math.max(Number(row.paid), automatic) - (row.current_in_account ? 1 : 0),
      );
    return sum + remaining * (Number(row.principal) + Number(row.fee));
  }, 0);
  await sql`insert into monthly_balances(account_id,month,balance) select a.id,s.current_month,${Math.round(balance * 100) / 100} from accounts a cross join settings s where a.name='消费分期' order by a.id limit 1 on conflict(account_id,month) do update set balance=excluded.balance,updated_at=now()`;
}
export async function GET() {
  try {
    const sql = db();
    const installments =
      await sql`select id,platform,item,total_principal::float as "totalPrincipal",principal_per_period::float as "principalPerPeriod",fee_per_period::float as "feePerPeriod",paid_periods as "paidPeriods",total_periods as "totalPeriods",first_payment_date::text as "firstPaymentDate",current_period_in_account_balance as "currentPeriodInAccountBalance" from installments order by id`;
    const mortgage =
      (
        await sql`select total_loan::float as "totalLoan",annual_rate::float as "annualRate",years::float,scheduled_payment::float as "scheduledPayment",loan_balance::float as "loanBalance",offset_balance::float as "offset",monthly_income::float as "income",extra_payment::float as "extraPayment",total_monthly_payment::float as "totalMonthlyPayment",annual_payment_growth::float as "annualPaymentGrowth" from mortgage_settings where id=1`
      )[0] || null;
    return NextResponse.json({ installments, mortgage });
  } catch {
    return NextResponse.json({ error: "load failed" }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const b = await request.json(),
      sql = db();
    if (b.import) {
      await sql.begin(async (tx) => {
        await tx`delete from installments`;
        for (const x of b.installments)
          await tx`insert into installments(platform,item,total_principal,principal_per_period,fee_per_period,paid_periods,total_periods,first_payment_date,current_period_in_account_balance) values(${x.platform},${x.item || null},${x.totalPrincipal},${x.principalPerPeriod},${x.feePerPeriod},${x.paidPeriods},${x.totalPeriods},${x.firstPaymentDate},${x.currentPeriodInAccountBalance === true})`;
        const m = b.mortgage;
        await tx`insert into mortgage_settings values(1,${m.totalLoan},${m.annualRate},${m.years},${m.scheduledPayment},${m.loanBalance},${m.offset},${m.income},${m.extraPayment},${m.totalMonthlyPayment},${m.annualPaymentGrowth}) on conflict(id) do update set total_loan=excluded.total_loan,annual_rate=excluded.annual_rate,years=excluded.years,scheduled_payment=excluded.scheduled_payment,loan_balance=excluded.loan_balance,offset_balance=excluded.offset_balance,monthly_income=excluded.monthly_income,extra_payment=excluded.extra_payment,total_monthly_payment=excluded.total_monthly_payment,annual_payment_growth=excluded.annual_payment_growth`;
      });
    } else
      await sql`insert into installments(platform,item,total_principal,principal_per_period,fee_per_period,paid_periods,total_periods,first_payment_date,current_period_in_account_balance) values(${b.platform},${b.item || null},${b.totalPrincipal},${b.principalPerPeriod},${b.feePerPeriod || 0},${b.paidPeriods || 0},${b.totalPeriods},${b.firstPaymentDate},${b.currentPeriodInAccountBalance === true})`;
    await syncLedger(sql);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  try {
    const b = await request.json(),
      sql = db();
    if (b.mortgage) {
      const m = b.mortgage;
      await sql`update mortgage_settings set total_loan=${m.totalLoan},annual_rate=${m.annualRate},years=${m.years},scheduled_payment=${m.scheduledPayment},loan_balance=${m.loanBalance},offset_balance=${m.offset},monthly_income=${m.income},extra_payment=${m.extraPayment},total_monthly_payment=${m.totalMonthlyPayment},annual_payment_growth=${m.annualPaymentGrowth} where id=1`;
    } else if (b.installment) {
      const x = b.installment;
      await sql`update installments set platform=${x.platform},item=${x.item || null},total_principal=${x.totalPrincipal},principal_per_period=${x.principalPerPeriod},fee_per_period=${x.feePerPeriod},paid_periods=${x.paidPeriods},total_periods=${x.totalPeriods},first_payment_date=${x.firstPaymentDate},current_period_in_account_balance=${x.currentPeriodInAccountBalance === true} where id=${x.id}`;
      await syncLedger(sql);
    } else {
      await sql`update installments set paid_periods=${b.paidPeriods} where id=${b.id}`;
      await syncLedger(sql);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id")),
      sql = db();
    await sql`delete from installments where id=${id}`;
    await syncLedger(sql);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
