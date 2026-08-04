import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type AccountInput = {
  id: number;
  name: string;
  kind: "资产" | "负债";
  currency: "AUD" | "CNY";
  previous: number;
  current: number;
};
type Warning = { code: string; message: string; accountId?: number };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      month: string;
      rate: number;
      note?: string;
      accounts?: AccountInput[];
    };
    if (!/^\d{4}-\d{2}$/.test(body.month) || !Array.isArray(body.accounts))
      return NextResponse.json({ error: "invalid data" }, { status: 400 });
    const warnings: Warning[] = [];
    const rate = Number(body.rate);
    const sql = db();
    const previousRate = Number(
      (
        await sql`select aud_cny_rate from monthly_exchange_rates where month<${body.month} order by month desc limit 1`
      )[0]?.aud_cny_rate || 0,
    );
    if (previousRate && Math.abs(rate - previousRate) / previousRate > 0.15)
      warnings.push({
        code: "rate_change",
        message: `汇率比上一记录变化 ${Math.round((Math.abs(rate - previousRate) / previousRate) * 100)}%，请确认。`,
      });

    let previousNet = 0,
      currentNet = 0,
      changed = 0;
    for (const account of body.accounts) {
      const current = Number(account.current),
        previous = Number(account.previous);
      const convertedCurrent =
        account.currency === "CNY" ? current / rate : current;
      const convertedPrevious =
        account.currency === "CNY"
          ? previous / (previousRate || rate)
          : previous;
      const sign = account.kind === "资产" ? 1 : -1;
      previousNet += sign * convertedPrevious;
      currentNet += sign * convertedCurrent;
      if (Math.abs(current - previous) > 0.005) changed++;
      if (current < 0)
        warnings.push({
          code: "negative_balance",
          accountId: account.id,
          message: `${account.name} 录入了负数余额，请确认正负方向。`,
        });
      const absoluteChange = Math.abs(convertedCurrent - convertedPrevious);
      const ratio =
        Math.abs(previous) > 0.01
          ? Math.abs(current - previous) / Math.abs(previous)
          : 0;
      if (absoluteChange >= 1000 && ratio >= 0.5)
        warnings.push({
          code: "large_account_change",
          accountId: account.id,
          message: `${account.name} 比上月变化 ${Math.round(ratio * 100)}%（约 ${Math.round(absoluteChange).toLocaleString("zh-CN")} AUD），请确认。`,
        });
      else if (absoluteChange >= 10000)
        warnings.push({
          code: "large_account_amount",
          accountId: account.id,
          message: `${account.name} 比上月变化约 ${Math.round(absoluteChange).toLocaleString("zh-CN")} AUD，请确认。`,
        });
    }
    const netChange = Math.abs(currentNet - previousNet),
      netRatio =
        Math.abs(previousNet) > 1 ? netChange / Math.abs(previousNet) : 0;
    if (netChange >= 10000 && netRatio >= 0.2)
      warnings.push({
        code: "large_net_change",
        message: `本月净资产变化约 ${Math.round(netChange).toLocaleString("zh-CN")} AUD（${Math.round(netRatio * 100)}%），请确认。`,
      });
    if (changed === 0 && !String(body.note || "").trim())
      warnings.push({
        code: "unchanged_without_note",
        message: "所有账户均沿用上月且没有填写备注，请确认这是预期结果。",
      });
    return NextResponse.json({ warnings });
  } catch {
    return NextResponse.json({ error: "validation failed" }, { status: 500 });
  }
}
