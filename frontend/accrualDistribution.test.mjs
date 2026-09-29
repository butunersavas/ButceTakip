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

test("Mart 2027 başlangıcı 2027 Mart-Aralık ve 2028 Ocak-Şubat üretir", () => {
  const result = buildAccrualDistribution(30000, 2027, 3, 12);
  assert.equal(result.rows.length, 12);
  assert.deepEqual(result.rows[0], { year: 2027, month: 3, cents: 250000 });
  assert.deepEqual(result.rows[9], { year: 2027, month: 12, cents: 250000 });
  assert.deepEqual(result.rows[10], { year: 2028, month: 1, cents: 250000 });
  assert.deepEqual(result.rows[11], { year: 2028, month: 2, cents: 250000 });
  assert.equal(result.rows.reduce((sum, row) => sum + row.cents, 0), 3000000);
});

test("12.565 USD cent farkını son aya ekler", () => {
  const result = buildAccrualDistribution(12565, 2027, 3, 12);
  assert.equal(result.rows[0].cents, 104708);
  assert.equal(result.rows[10].cents, 104708);
  assert.equal(result.rows[11].cents, 104712);
  assert.equal(result.rows.reduce((sum, row) => sum + row.cents, 0), 1256500);
});
