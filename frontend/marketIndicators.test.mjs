import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const utilitySource = await readFile(new URL("./src/utils/marketRates.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(utilitySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { buildMarketIndicatorCards, formatMarketRate, formatMarketRateDate } = await import(moduleUrl);

test("kurlar Türkçe sayı biçiminde ve sabit hassasiyetle gösterilir", () => {
  assert.equal(formatMarketRate(49.0348, 4), "49,0348");
  assert.equal(formatMarketRate(null, 4), "-");
  assert.equal(formatMarketRateDate("2026-10-01"), "01.10.2026");
});

test("backend uyumluluğu için market rate utility sözleşmesi korunur", () => {
  const cards = buildMarketIndicatorCards({
    usd_try: 49.0348,
    eur_try: 55.3963,
    gram_gold_try: null,
  });

  assert.equal(cards[0].value, 49.0348);
  assert.equal(cards[1].value, 55.3963);
});

test("sidebar göstergesi yalnız USD ve EUR gösterir", async () => {
  const component = await readFile(
    new URL("./src/components/Dashboard/MarketIndicators.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(component.includes('client.get<MarketRatesResponse>("/market-rates"'));
  assert.ok(component.includes('"USD / TL"'));
  assert.ok(component.includes('"EUR / TL"'));
  assert.ok(!component.includes("Gram Altın"));
  assert.ok(!component.includes("gram_gold_try"));
  assert.ok(!component.includes("tcmb.gov.tr"));
  assert.ok(component.includes("<Skeleton"));
  assert.ok(!component.includes("normalizedKpi"));
  assert.ok(!component.includes("XLSX"));
});

test("Piyasa göstergesi ortak sidebar'da yer alır ve Dashboard panelinden kaldırılmıştır", async () => {
  const appLayout = await readFile(
    new URL("./src/components/layout/AppLayout.tsx", import.meta.url),
    "utf8",
  );
  const dashboard = await readFile(
    new URL("./src/components/Dashboard/DashboardView.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(appLayout.includes('import MarketIndicators from "../Dashboard/MarketIndicators";'));
  assert.equal((appLayout.match(/<MarketIndicators \/>/g) ?? []).length, 1);
  assert.ok(!dashboard.includes('import MarketIndicators from "./MarketIndicators";'));
  assert.ok(!dashboard.includes('<DashboardSectionBoundary title="Piyasa Göstergeleri">'));
});
