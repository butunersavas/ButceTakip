import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("./src/utils/dashboardSavings.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { calculateDashboardSavings } = await import(moduleUrl);

test("Toplam Tasarruf pazarlıklı ve optimizasyon tasarrufunu bir kez toplar", () => {
  const result = calculateDashboardSavings(
    {
      negotiated_saving_total: 592957.2,
      other_saving_total: 519773.99,
      total_saving_total: 592957.2
    },
    {
      total_negotiated_saving: 1,
      total_other_saving: 2
    }
  );

  assert.equal(result.negotiatedSavingTotal, 592957.2);
  assert.equal(result.otherSavingTotal, 519773.99);
  assert.equal(result.combinedSavingTotal, 1112731.19);
});

test("özet alanları yoksa normalize KPI değerlerini kullanır", () => {
  assert.deepEqual(
    calculateDashboardSavings(undefined, {
      total_negotiated_saving: 120,
      total_other_saving: 30
    }),
    {
      negotiatedSavingTotal: 120,
      otherSavingTotal: 30,
      combinedSavingTotal: 150
    }
  );
});
