import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ships ordered, immutable database migrations", async () => {
  const files = (await readdir(new URL("db/migrations/", root))).filter(name => name.endsWith(".sql")).sort();
  assert.deepEqual(files, ["001_initial.sql", "002_month_snapshots.sql", "003_installment_balance_link.sql"]);
  const migration = await read("scripts/migrate.mjs");
  assert.match(migration, /schema_migrations/);
  assert.match(migration, /checksum/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("runs migrations before the production server", async () => {
  const dockerfile = await read("Dockerfile");
  assert.match(dockerfile, /COPY --from=build \/app\/db\/migrations/);
  assert.match(dockerfile, /node scripts\/migrate\.mjs && node server\.js/);
});

test("protects history edits with reversible snapshots", async () => {
  const [ledger, snapshots, dashboard, versions] = await Promise.all([
    read("app/api/ledger/route.ts"),
    read("app/api/month-snapshots/route.ts"),
    read("app/ledger-dashboard.tsx"),
    read("app/month-versions.tsx"),
  ]);
  assert.match(ledger, /before_history_edit/);
  assert.match(snapshots, /before_restore/);
  assert.match(snapshots, /snapshot not found/);
  assert.match(versions, /版本记录/);
  assert.match(dashboard, /数据无误，仍然保存/);
});

test("validation is advisory and covers major data risks", async () => {
  const validation = await read("app/api/ledger/validate/route.ts");
  for (const code of ["rate_change", "negative_balance", "large_account_change", "large_net_change", "unchanged_without_note"])
    assert.match(validation, new RegExp(code));
  assert.doesNotMatch(validation, /insert into|update monthly|delete from/i);
});

test("ships the second-stage historical analytics suite", async () => {
  const [api, charts, dashboard] = await Promise.all([
    read("app/api/analytics/route.ts"),
    read("app/analysis-enhancements.tsx"),
    read("app/ledger-dashboard.tsx"),
  ]);
  assert.match(api, /monthly_exchange_rates/);
  assert.match(api, /categories/);
  assert.match(charts, /资产、负债与净资产趋势/);
  assert.match(charts, /资产负债分类堆叠趋势/);
  assert.match(charts, /账户余额趋势/);
  assert.match(charts, /onSelectMonth/);
  assert.match(dashboard, /setTab\("entry"\)/);
});

test("deduplicates only the current installment period", async () => {
  const [migration, api, manager] = await Promise.all([
    read("db/migrations/003_installment_balance_link.sql"),
    read("app/api/installments/route.ts"),
    read("app/installment-manager.tsx"),
  ]);
  assert.match(migration, /current_period_in_account_balance/);
  assert.doesNotMatch(migration, /where platform in/i);
  assert.match(api, /current_in_account \? 1 : 0/);
  assert.match(manager, /后续期数仍会全部计入/);
});
