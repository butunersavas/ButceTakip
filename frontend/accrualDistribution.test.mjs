import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./src/utils/accrualDistribution.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { buildAccrualDistribution } = await import(moduleUrl);

test("aylık tutarı bölmeden 2027 Mart-Aralık ve 2028 Ocak-Şubat üretir", () => {
  const result = buildAccrualDistribution(30000, 2027, 3, 12);
  assert.equal(result.rows.length, 12);
  assert.deepEqual(result.rows[0], { year: 2027, month: 3, cents: 3000000 });
  assert.deepEqual(result.rows[9], { year: 2027, month: 12, cents: 3000000 });
  assert.deepEqual(result.rows[10], { year: 2028, month: 1, cents: 3000000 });
  assert.deepEqual(result.rows[11], { year: 2028, month: 2, cents: 3000000 });
  assert.equal(result.rows.reduce((sum, row) => sum + row.cents, 0), 36000000);
});

test("aylık cent tutarını her ay aynen korur", () => {
  const result = buildAccrualDistribution(12565, 2027, 3, 12);
  assert.equal(result.rows[0].cents, 1256500);
  assert.equal(result.rows[10].cents, 1256500);
  assert.equal(result.rows[11].cents, 1256500);
  assert.equal(result.rows.reduce((sum, row) => sum + row.cents, 0), 15078000);
});

test("Tahakkuk UI seçili yıl allocation toplamını normal plandan ayrı tutar", async () => {
  const dashboard = await readFile(new URL("./src/components/Dashboard/DashboardView.tsx", import.meta.url), "utf8");
  const plans = await readFile(new URL("./src/components/Plans/PlansView.tsx", import.meta.url), "utf8");
  const expenses = await readFile(new URL("./src/components/Expenses/ExpensesView.tsx", import.meta.url), "utf8");
  assert.ok(dashboard.includes('title: "Tahakkuk"'));
  assert.ok(dashboard.includes('subtitle: "Seçilen yılın normal planı"'));
  assert.ok(!dashboard.includes('title: "Devreden Tahakkuk"'));
  assert.ok(plans.includes('label: "Toplam Bütçe"'));
  assert.ok(plans.includes('label: "Tahakkuk"'));
  assert.ok(plans.includes("include_source_year: true"));
  assert.ok(!plans.includes('label: "Efektif Toplam Bütçe"'));
  assert.ok(expenses.includes("Tahakkuklu / Dönemsel Harcama"));
  assert.ok(expenses.includes("Önceki Yıl Tahakkuku"));
});

test("Dashboard genel Excel tahakkuk sayfasını içerir ve mükerrer kullanılmayacak sayfasını içermez", async () => {
  const dashboard = await readFile(new URL("./src/components/Dashboard/DashboardView.tsx", import.meta.url), "utf8");
  assert.ok(dashboard.includes('"Tahakkuk Detayı"'));
  assert.ok(!dashboard.includes('"Sarkan Tahakkuk Detayı"'));
  assert.ok(!dashboard.includes('"Kullanılmayacak Bütçe Detayı"'));
  assert.ok(dashboard.includes('["Tutar", "Kullanılan", "Kalan"]'));
  assert.ok(dashboard.includes('"İptal Detayı"'));
});

test("Plan tahakkuk etiketi aylık allocation tutarını ve yıllık özeti kullanır", async () => {
  const plans = await readFile(new URL("./src/components/Plans/PlansView.tsx", import.meta.url), "utf8");
  assert.ok(plans.includes('label="Tahakkuk var"'));
  assert.ok(plans.includes("Bu aya düşen tahakkuk:"));
  assert.ok(plans.includes('"Yıllık Planlanan Bütçe"'));
  assert.ok(plans.includes('"Güncel Toplam Bütçe"'));
  assert.ok(!plans.includes('"Mevcut Plan Tutarı"'));
});
