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
  assert.equal(formatMarketRate(3250.5, 2), "3.250,50");
  assert.equal(formatMarketRate(null, 4), "-");
  assert.equal(formatMarketRateDate("2026-10-01"), "01.10.2026");
});

test("resmi gram altın verisi yoksa kart güvenli fallback gösterir", () => {
  const cards = buildMarketIndicatorCards({
    usd_try: 49.0348,
    eur_try: 55.3963,
    gram_gold_try: null,
  });

  assert.deepEqual(cards.map((card) => card.label), ["USD / TRY", "EUR / TRY", "Gram Altın / TRY"]);
  assert.equal(cards[2].value, null);
});

test("Dashboard göstergeleri loading ve hata durumlarını bağımsız ele alır", async () => {
  const component = await readFile(
    new URL("./src/components/Dashboard/MarketIndicators.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(component.includes('client.get<MarketRatesResponse>("/market-rates"'));
  assert.ok(!component.includes("tcmb.gov.tr"));
  assert.ok(component.includes("<Skeleton"));
  assert.ok(component.includes('severity="warning"'));
  assert.ok(component.includes("bütçe hesaplamalarına ve raporlara dahil edilmez"));
  assert.ok(!component.includes("normalizedKpi"));
  assert.ok(!component.includes("XLSX"));
});

test("Piyasa Göstergeleri Dashboard'a ayrı bileşen olarak bağlanır", async () => {
  const dashboard = await readFile(
    new URL("./src/components/Dashboard/DashboardView.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(dashboard.includes('import MarketIndicators from "./MarketIndicators";'));
  assert.equal((dashboard.match(/<MarketIndicators \/>/g) ?? []).length, 1);
  assert.ok(dashboard.includes('<DashboardSectionBoundary title="Piyasa Göstergeleri">'));
});
