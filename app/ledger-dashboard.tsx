"use client";
import { useEffect, useState } from "react";
import { InstallmentManager, MortgageCalculator } from "./installment-manager";
import { NetWorthTrend as Trend } from "./net-worth-trend";
import { HomeCategoryContribution } from "./home-category-contribution";
import { MonthVersions } from "./month-versions";
import { AnalysisEnhancements } from "./analysis-enhancements";
type Account = {
  id: number;
  name: string;
  kind: "资产" | "负债";
  category: string;
  currency: "AUD" | "CNY";
  active: boolean;
  previous: number;
  current: number;
};
type Point = {
  month: string;
  net: number;
  assets: number;
  liabilities: number;
};
type Data = {
  month: string;
  currentMonth: string;
  rate: number;
  note: string;
  accounts: Account[];
  history: Point[];
};
type Tab =
  | "home"
  | "history"
  | "analysis"
  | "entry"
  | "installments"
  | "mortgage"
  | "accounts";
type ValidationWarning = { code: string; message: string; accountId?: number };
const money = (n: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(n);
const label = (m: string) => {
  const [y, x] = m.split("-");
  return `${y} 年 ${Number(x)} 月`;
};
export function LedgerDashboard() {
  const [data, setData] = useState<Data | null>(null),
    [balanceInputs, setBalanceInputs] = useState<Record<number, string>>({}),
    [tab, setTab] = useState<Tab>("home"),
    [message, setMessage] = useState("正在读取…"),
    [adding, setAdding] = useState(false),
    [saving, setSaving] = useState(false),
    [editingHistory, setEditingHistory] = useState(false),
    [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>(
      [],
    ),
    [hideClosed, setHideClosed] = useState(true),
    [form, setForm] = useState({
      name: "",
      kind: "资产",
      category: "流动资产",
      currency: "AUD",
    });
  const load = async (month?: string) => {
    const r = await fetch(`/api/ledger${month ? `?month=${month}` : ""}`);
    if (!r.ok) return;
    const next = await r.json();
    setData(next);
    setBalanceInputs(
      Object.fromEntries(next.accounts.map((account: Account) => [account.id, String(account.current)])),
    );
    setEditingHistory(false);
    setMessage(
      month && month !== data?.currentMonth
        ? "历史快照（只读）"
        : "已载入上月余额",
    );
  };
  useEffect(() => {
    fetch("/api/ledger")
      .then((response) => (response.ok ? response.json() : null))
      .then((initial) => {
        if (initial) {
          setData(initial);
          setBalanceInputs(
            Object.fromEntries(initial.accounts.map((account: Account) => [account.id, String(account.current)])),
          );
          setMessage("已载入上月余额");
        }
      });
  }, []);
  if (!data) return <div className="app-loading">正在载入家庭账本…</div>;
  const isCurrent = data.month === data.currentMonth,
    isEditable = isCurrent || editingHistory,
    shown = data.accounts.filter((a) => a.active || !isCurrent),
    aud = (a: Account, n = a.current) =>
      a.currency === "CNY" ? n / data.rate : n;
  const totals = shown.reduce(
    (t, a) => {
      const v = aud(a);
      if (a.kind === "资产") t.assets += v;
      else t.liabilities += v;
      t.net = t.assets - t.liabilities;
      return t;
    },
    { assets: 0, liabilities: 0, net: 0 },
  );
  const contributions = shown
    .map((a) => {
      const raw = aud(a, a.current) - aud(a, a.previous);
      return { ...a, value: a.kind === "负债" ? -raw : raw };
    })
    .filter((a) => Math.abs(a.value) > 0.005)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const categories = [
    "流动资产",
    "投资资产",
    "自用资产",
    "短期负债",
    "长期负债",
  ].map((category) => ({
    category,
    value: contributions
      .filter((a) => a.category === category)
      .reduce((s, a) => s + a.value, 0),
  }));
  const update = (id: number, value: string) => {
    setBalanceInputs((current) => ({ ...current, [id]: value }));
    if (value.trim() === "") return;
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    setData({
      ...data,
      accounts: data.accounts.map((a) =>
        a.id === id ? { ...a, current: number } : a,
      ),
    });
  };
  const persistSave = async () => {
    setSaving(true);
    const r = await fetch("/api/ledger", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data, preserveCurrentMonth: editingHistory }),
    });
    const result = r.ok ? await r.json().catch(() => ({})) : {};
    setMessage(r.ok ? result.noChange ? "没有变化，无需保存" : editingHistory ? "历史月份修改已保存" : "本月余额已保存" : "保存失败");
    if (r.ok) setEditingHistory(false);
    setSaving(false);
  };
  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/ledger/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const warnings = (await response.json()).warnings as ValidationWarning[];
      if (warnings.length) {
        setValidationWarnings(warnings);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    await persistSave();
  };
  const create = async () => {
    const r = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, openedMonth: data.currentMonth }),
    });
    if (r.ok) {
      setAdding(false);
      await load();
    }
  };
  const toggleAccount = async (a: Account) => {
    if (
      a.active &&
      !confirm(
        "关闭后，该账户不会出现在以后月份的录入中，历史记录仍保留。确定关闭吗？",
      )
    )
      return;
    const r = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: a.id,
        active: !a.active,
        closedMonth: data.currentMonth,
      }),
    });
    if (r.ok) await load();
  };
  const title = {
    home: "财务概览",
    history: "历史概览",
    analysis: "本月分析",
    entry: isCurrent ? "本月余额录入" : "历史月明细",
    installments: "分期管理",
    mortgage: "房贷计算",
    accounts: "账户管理",
  }[tab];
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">衡</span>
          <div>
            <strong>家衡</strong>
            <small>家庭资产账本</small>
          </div>
        </div>
        <nav>
          {(
            [
              ["home", "⌂", "首页"],
              ["analysis", "⌁", "本月分析"],
              ["entry", "✎", "本月录入"],
              ["history", "◷", "历史概览"],
              ["installments", "▦", "分期管理"],
              ["mortgage", "⌂", "房贷计算"],
              ["accounts", "◎", "账户管理"],
            ] as [Tab, string, string][]
          ).map(([id, icon, text]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <span>{icon}</span>
              {text}
            </button>
          ))}
        </nav>
        <div className="privacy">
          <span>●</span>
          <div>
            <b>私有部署</b>
            <small>数据保存在你的服务器</small>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">家庭财务 · {data.month}</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <label>
              汇率 <b>1 AUD =</b>
              <input
                disabled={!isCurrent}
                value={data.rate}
                onChange={(e) =>
                  setData({ ...data, rate: Number(e.target.value) || 1 })
                }
              />{" "}
              CNY
            </label>
            <button className="avatar">家</button>
          </div>
        </header>
        {tab === "home" && (
          <>
            <div className="hero-card">
              <p>家庭净资产</p>
              <h2>${money(totals.net)}</h2>
              <span>AUD · 截至 {data.month}</span>
            </div>
            <div className="summary-grid">
              <article>
                <small>总资产</small>
                <strong>${money(totals.assets)}</strong>
                <i className="up">资产</i>
              </article>
              <article>
                <small>总负债</small>
                <strong>${money(totals.liabilities)}</strong>
                <i>负债</i>
              </article>
              <article>
                <small>本月净资产变化</small>
                <strong
                  className={
                    contributions.reduce((s, a) => s + a.value, 0) >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  ${money(contributions.reduce((s, a) => s + a.value, 0))}
                </strong>
                <i>查看本月分析了解来源</i>
              </article>
            </div>
            <Trend points={data.history} />
            <HomeCategoryContribution rows={categories} />
            <button className="wide-link" onClick={() => setTab("analysis")}>
              查看本月详细分析 →
            </button>
          </>
        )}
        {tab === "history" && (
          <>
            <div className="page-toolbar">
              <div>
                <h3>历史月份</h3>
                <p>点击月份直接查看该月账户明细</p>
              </div>
              <span>{data.history.length} 个月记录</span>
            </div>
            <div className="history-grid">
              {[...data.history].reverse().map((p, i) => {
                const prev = [...data.history].find(
                    (x) =>
                      x.month ===
                      data.history[data.history.indexOf(p) - 1]?.month,
                  ),
                  delta = prev ? p.net - prev.net : 0;
                return (
                  <button
                    key={p.month}
                    className={`history-card ${p.month === data.month ? "selected" : ""}`}
                    onClick={async () => {
                      await load(p.month);
                      setTab("entry");
                    }}
                  >
                    <span>
                      {label(p.month)}
                      {i === 0 && <i>最新</i>}
                    </span>
                    <strong>${money(p.net)}</strong>
                    <small>净资产</small>
                    <b className={delta >= 0 ? "positive" : "negative"}>
                      {delta >= 0 ? "+" : ""}${money(delta)}
                    </b>
                  </button>
                );
              })}
            </div>
            <div className="history-detail">
              <div>
                <small>当前选择</small>
                <h3>{label(data.month)}</h3>
              </div>
              <div>
                <small>总资产</small>
                <strong>${money(totals.assets)}</strong>
              </div>
              <div>
                <small>总负债</small>
                <strong>${money(totals.liabilities)}</strong>
              </div>
              <div>
                <small>净资产</small>
                <strong>${money(totals.net)}</strong>
              </div>
              <button className="primary-btn" onClick={() => setTab("entry")}>
                查看账户明细
              </button>
            </div>
          </>
        )}
        {tab === "analysis" && (
          <>
            <div className="analysis-hero">
              <div>
                <small>本月净资产变化</small>
                <strong
                  className={
                    contributions.reduce((s, a) => s + a.value, 0) >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {contributions.reduce((s, a) => s + a.value, 0) >= 0
                    ? "+"
                    : ""}
                  ${money(contributions.reduce((s, a) => s + a.value, 0))}
                </strong>
              </div>
              <p>资产增加、负债减少为正贡献；统一折算为 AUD。</p>
            </div>
            <div className="analysis-columns">
              <div className="contribution-card">
                <div className="panel-title">
                  <div>
                    <h3>账户贡献排行</h3>
                    <p>哪些账户推动了本月变化</p>
                  </div>
                </div>
                {contributions.map((a) => (
                  <div className="contribution-row" key={a.id}>
                    <span className="account-icon">{a.name.slice(0, 1)}</span>
                    <div>
                      <b>{a.name}</b>
                      <small>
                        {a.category} ·{" "}
                        {a.current > a.previous ? "余额增加" : "余额减少"}
                      </small>
                    </div>
                    <i className={a.value >= 0 ? "positive" : "negative"}>
                      {a.value >= 0 ? "+" : "−"}${money(Math.abs(a.value))}
                    </i>
                  </div>
                ))}
              </div>
              <div className="contribution-card">
                <div className="panel-title">
                  <div>
                    <h3>类别贡献</h3>
                    <p>按资产负债类别汇总</p>
                  </div>
                </div>
                {categories.map((c) => (
                  <div className="category-change" key={c.category}>
                    <span>{c.category}</span>
                    <div>
                      <i
                        className={c.value >= 0 ? "bar-pos" : "bar-neg"}
                        style={{
                          width: `${Math.min(100, (Math.abs(c.value) / (Math.max(...categories.map((x) => Math.abs(x.value))) || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <b className={c.value >= 0 ? "positive" : "negative"}>
                      {c.value >= 0 ? "+" : ""}${money(c.value)}
                    </b>
                  </div>
                ))}
              </div>
            </div>
            <AnalysisEnhancements onSelectMonth={async(month)=>{await load(month);setTab("entry");}} />
          </>
        )}
        {tab === "entry" && (
          <>
            <div className="entry-toolbar">
              <div>
                <button
                  className="month-button"
                  onClick={() => {
                    const d = new Date(data.month + "-01");
                    d.setMonth(d.getMonth() - 1);
                    load(d.toISOString().slice(0, 7));
                  }}
                >
                  ‹
                </button>
                <strong>{label(data.month)}</strong>
                <button
                  className="month-button"
                  title={isCurrent ? "开始录入下个月" : "下一个月"}
                  onClick={async () => {
                    const d = new Date(data.month + "-01");
                    d.setMonth(d.getMonth() + 1);
                    const target = d.toISOString().slice(0, 7);
                    if (isCurrent) {
                      const r = await fetch("/api/ledger?month=" + target);
                      if (r.ok) {
                        const next = await r.json();
                        setData({ ...next, currentMonth: target });
                        setBalanceInputs(
                          Object.fromEntries(next.accounts.map((account: Account) => [account.id, String(account.current)])),
                        );
                        setMessage("开始录入 " + label(target));
                      }
                    } else await load(target);
                  }}
                >
                  {isCurrent ? "＋ 录入下月" : "›"}
                </button>
              </div>
              <div className="history-edit-actions">
                <span className="status-dot">● {message}</span>
                {!isCurrent && !editingHistory && (
                  <button
                    className="soft-btn"
                    onClick={() => {
                      if (
                        confirm(
                          "要修改 " +
                            label(data.month) +
                            " 的历史余额吗？修改会影响该月及之后的趋势分析。",
                        )
                      )
                        setEditingHistory(true);
                    }}
                  >
                    修改此月
                  </button>
                )}
                {!isCurrent && (
                  <MonthVersions
                    month={data.month}
                    accounts={data.accounts}
                    currentRate={data.rate}
                    currentNote={data.note}
                    onRestored={async () => {
                      await load(data.month);
                      setMessage("历史版本已恢复");
                    }}
                  />
                )}
              </div>
            </div>
            {["流动资产", "投资资产", "自用资产", "短期负债", "长期负债"].map(
              (category) => {
                const rows = shown.filter((a) => a.category === category);
                return (
                  <section className="account-section" key={category}>
                    <div className="section-title">
                      <h3>{category}</h3>
                      <span>{rows.length} 个账户</span>
                    </div>
                    <div className="account-grid">
                      {rows.map((a) => (
                        <article
                          className={`account-card ${a.kind === "负债" ? "debt" : ""}`}
                          key={a.id}
                        >
                          <div className="account-top">
                            <div className="account-icon">
                              {a.name.slice(0, 1)}
                            </div>
                            <div>
                              <b>{a.name}</b>
                              <small>{a.currency}</small>
                            </div>
                            <span className="change">
                              {a.current !== a.previous ? "有变化" : "沿用"}
                            </span>
                          </div>
                          <label>
                            {a.name === "消费分期"
                              ? "自动同步余额"
                              : isEditable
                                ? isCurrent
                                  ? "本月余额"
                                  : "修改月末余额"
                                : "月末余额"}
                            <div className="amount">
                              <span>{a.currency === "AUD" ? "$" : "¥"}</span>
                              <input
                                readOnly={!isEditable || a.name === "消费分期"}
                                inputMode="decimal"
                                value={balanceInputs[a.id] ?? String(a.current)}
                                onChange={(e) => update(a.id, e.target.value)}
                                onBlur={() =>
                                  setBalanceInputs((current) => ({
                                    ...current,
                                    [a.id]: String(a.current),
                                  }))
                                }
                              />
                            </div>
                          </label>
                          <footer>
                            <span>上月 {money(a.previous)}</span>
                          </footer>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              },
            )}
            <div className="month-note">
              <label>
                {isCurrent ? "本月备注" : "月份备注"}
                <textarea
                  readOnly={!isEditable}
                  placeholder="记录本月的重要收支、家庭事项或余额变化原因…"
                  value={data.note}
                  onChange={(e) => setData({ ...data, note: e.target.value })}
                />
              </label>
            </div>
            {isEditable && (
              <div className="sticky-save">
                <div>
                  <small>本月净资产</small>
                  <strong>${money(totals.net)} AUD</strong>
                </div>
                <button onClick={save} disabled={saving}>
                  {saving ? "保存中…" : "保存本月余额"}
                </button>
              </div>
            )}
          </>
        )}
        {tab === "installments" && <InstallmentManager />}
        {tab === "mortgage" && <MortgageCalculator />}
        {tab === "accounts" && (
          <div className="account-table">
            <div className="table-head">
              <h3>全部账户</h3>
              <div className="action-group">
                <button
                  className="soft-btn"
                  onClick={() => setHideClosed(!hideClosed)}
                >
                  {hideClosed
                    ? "查看已关闭账户（" +
                      data.accounts.filter((a) => !a.active).length +
                      "）"
                    : "隐藏已关闭账户"}
                </button>
                <a className="export-btn" href="/api/export">
                  导出数据
                </a>
                <button onClick={() => setAdding(true)}>＋ 新增账户</button>
              </div>
            </div>
            {data.accounts
              .filter((a) => !hideClosed || a.active)
              .map((a) => (
                <div
                  className={`table-row ${!a.active ? "closed" : ""}`}
                  key={a.id}
                >
                  <div className="account-icon">{a.name.slice(0, 1)}</div>
                  <div>
                    <b>{a.name}</b>
                    <small>
                      {a.category} · {a.currency}
                    </small>
                  </div>
                  <span className={`pill ${a.active ? "on" : ""}`}>
                    {a.active ? "启用" : "已关闭"}
                  </span>
                  <strong>
                    {a.currency === "AUD" ? "$" : "¥"}
                    {money(a.current)}
                  </strong>
                  <button
                    className="close-btn"
                    onClick={() => toggleAccount(a)}
                  >
                    {a.active ? "关闭账户" : "重新启用"}
                  </button>
                </div>
              ))}
          </div>
        )}
        {adding && (
          <div className="modal-backdrop" onClick={() => setAdding(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>新增账户</h3>
              <div className="form-grid">
                <label>
                  名称
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label>
                  类型
                  <select
                    value={form.kind}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        kind: e.target.value,
                        category:
                          e.target.value === "资产" ? "流动资产" : "短期负债",
                      })
                    }
                  >
                    <option>资产</option>
                    <option>负债</option>
                  </select>
                </label>
                <label>
                  分类
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  >
                    {(form.kind === "资产"
                      ? ["流动资产", "投资资产", "自用资产"]
                      : ["短期负债", "长期负债"]
                    ).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  币种
                  <select
                    value={form.currency}
                    onChange={(e) =>
                      setForm({ ...form, currency: e.target.value })
                    }
                  >
                    <option>AUD</option>
                    <option>CNY</option>
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button onClick={() => setAdding(false)}>取消</button>
                <button onClick={create}>创建</button>
              </div>
            </div>
          </div>
        )}
        {validationWarnings.length > 0 && (
          <div
            className="modal-backdrop"
            onClick={() => setValidationWarnings([])}
          >
            <div
              className="modal warning-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>保存前请确认</h3>
              <p className="warning-note">
                这些提示不会阻止录入。确认数据无误后仍然可以保存。
              </p>
              <ul className="warning-list">
                {validationWarnings.map((warning, index) => (
                  <li key={`${warning.code}-${warning.accountId ?? index}`}>
                    ⚠ {warning.message}
                  </li>
                ))}
              </ul>
              <div className="modal-actions">
                <button onClick={() => setValidationWarnings([])}>
                  返回检查
                </button>
                <button
                  className="continue-save"
                  onClick={async () => {
                    setValidationWarnings([]);
                    await persistSave();
                  }}
                >
                  数据无误，仍然保存
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
