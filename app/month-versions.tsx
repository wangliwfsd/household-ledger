"use client";
import { useMemo, useState } from "react";

type Account = {
  id: number;
  name: string;
  current: number;
  currency: "AUD" | "CNY";
};
type Snapshot = {
  month: string;
  rate: number | null;
  balances: Array<{ accountId: number; balance: number; note: string | null }>;
};
type Version = {
  id: number;
  reason: string;
  createdAt: string;
  snapshot: Snapshot;
};

const reasonLabel: Record<string, string> = {
  before_history_edit: "历史修改前",
  before_restore: "恢复版本前",
  manual: "手动快照",
};
const amount = (value: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);

export function MonthVersions({
  month,
  accounts,
  currentRate,
  currentNote,
  onRestored,
}: {
  month: string;
  accounts: Account[];
  currentRate: number;
  currentNote: string;
  onRestored: () => Promise<void>;
}) {
  const [versions, setVersions] = useState<Version[]>([]),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Version | null>(null),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await fetch(`/api/month-snapshots?month=${month}`);
    if (response.ok) setVersions((await response.json()).versions);
  };
  const changes = useMemo(() => {
    if (!selected) return [];
    const old = new Map(
      selected.snapshot.balances.map((row) => [
        Number(row.accountId),
        Number(row.balance),
      ]),
    );
    return accounts
      .map((account) => ({
        account,
        before: old.get(account.id) ?? 0,
        after: account.current,
      }))
      .filter((row) => Math.abs(row.before - row.after) > 0.005);
  }, [selected, accounts]);
  const previousNote =
    selected?.snapshot.balances.find((row) => row.note)?.note ?? "";
  const previousRate = selected?.snapshot.rate ?? currentRate;
  const restore = async () => {
    if (
      !selected ||
      !confirm(
        `确定恢复到 ${new Date(selected.createdAt).toLocaleString("zh-CN")} 保存的版本吗？恢复前会自动备份当前数据。`,
      )
    )
      return;
    setBusy(true);
    const response = await fetch("/api/month-snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore", id: selected.id }),
    });
    if (response.ok) {
      await onRestored();
      await load();
      setSelected(null);
    } else alert("恢复失败，请稍后重试。");
    setBusy(false);
  };
  return (
    <>
      <button
        className="soft-btn"
        onClick={() => {
          setOpen(true);
          setSelected(null);
          load();
        }}
      >
        版本记录（{versions.length}）
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal version-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="version-title">
              <div>
                <h3>{month} 版本记录</h3>
                <p>历史修改和恢复前会自动保存完整月度快照</p>
              </div>
              <button aria-label="关闭" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {!versions.length ? (
              <div className="empty-version">这个月份还没有历史版本</div>
            ) : (
              <div className="version-layout">
                <div className="version-list">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      className={selected?.id === version.id ? "active" : ""}
                      onClick={() => setSelected(version)}
                    >
                      <b>{reasonLabel[version.reason] || version.reason}</b>
                      <span>
                        {new Date(version.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="version-diff">
                  {selected ? (
                    <>
                      <div className="rate-diff">
                        <span>汇率</span>
                        <b>{previousRate}</b>
                        <i>→</i>
                        <b>{currentRate}</b>
                      </div>
                      {previousNote !== currentNote && (
                        <div className="note-diff">
                          <span>备注</span>
                          <b>{previousNote || "（空）"}</b>
                          <i>→</i>
                          <b>{currentNote || "（空）"}</b>
                        </div>
                      )}
                      {changes.length ? (
                        <div className="diff-rows">
                          {changes.map(({ account, before, after }) => (
                            <div key={account.id}>
                              <span>{account.name}</span>
                              <b>{amount(before)}</b>
                              <i>→</i>
                              <b>
                                {amount(after)} {account.currency}
                              </b>
                            </div>
                          ))}
                        </div>
                      ) : previousNote === currentNote ? (
                        <p className="empty-version">
                          此版本与当前余额、汇率和备注一致
                        </p>
                      ) : null}
                      <button
                        className="restore-btn"
                        disabled={busy}
                        onClick={restore}
                      >
                        {busy ? "恢复中…" : "恢复这个版本"}
                      </button>
                    </>
                  ) : (
                    <p className="empty-version">选择左侧版本查看差异</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
