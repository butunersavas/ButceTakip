import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const utilitySource = await readFile(new URL("./src/utils/quoteManagement.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(utilitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const utility = await import(moduleUrl);

test("teklif tutarı arayüzde adet x birim fiyat olarak hesaplanır", () => {
  assert.equal(utility.calculateQuoteLineTotal("3", "12.50"), 37.5);
  assert.equal(utility.calculateQuoteLineTotal("0.1", "0.2"), 0.02);
});

test("Teklif oluşturma para birimi yalnız USD'dir", () => {
  assert.deepEqual(utility.QUOTE_CURRENCIES, ["USD"]);
  assert.match(utility.formatQuoteCurrency(12500, "USD"), /12\.500,00/);
});

test("firma renkleri deterministik ve aynı süreçte ayırt edicidir", () => {
  assert.equal(utility.QUOTE_PROCESS_TYPES.PACKAGE, "Paket / Çoklu Ürün");
  const vendors = ["TürkTelekom", "F1 Teknoloji"];
  assert.deepEqual(
    utility.getVendorChipSx("TürkTelekom", vendors),
    utility.getVendorChipSx(" TürkTelekom ", vendors),
  );
  assert.notEqual(
    utility.getVendorChipSx(vendors[0], vendors).backgroundColor,
    utility.getVendorChipSx(vendors[1], vendors).backgroundColor,
  );
  assert.equal(utility.getVendorChipSx(vendors[0], vendors).color, "#FFFFFF");
});

test("Teklif Yönetimi KDV alanı oluşturmaz ve güvenli belge akışını sunar", async () => {
  const component = await readFile(
    new URL("./src/components/Quotes/QuoteManagementView.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(component.includes("Fiyat Teklifi PDF / Excel Ekle"));
  assert.ok(component.includes("/documents/${document.id}/preview"));
  assert.ok(component.includes("/preferred-offer"));
  assert.ok(component.includes("Teklif Belgeleri"));
  assert.ok(component.includes("<Autocomplete"));
  assert.ok(component.includes("Bütçe ürünü ara"));
  assert.ok(component.includes('revisionPayload.currency = "USD"'));
  assert.ok(component.includes('value="USD"'));
  assert.ok(component.includes("Tüm paket"));
  assert.ok(component.includes("Belirli ürün(ler)"));
  assert.ok(component.includes("Teklif verilmedi"));
  assert.ok(component.includes("changed_process_item_ids"));
  assert.ok(component.includes("Silinen Teklifler"));
  assert.ok(component.includes("/revisions/${offerDialog.revision.id}"));
  assert.ok(component.includes("/revisions/${revision.id}/restore"));
  assert.ok(component.includes("getVendorChipSx"));
  assert.ok(component.includes("const total = items.reduce"));
  assert.ok(!component.includes("const total = visibleItems.reduce"));
  assert.ok(!component.includes("setCurrency("));
  assert.ok(!component.includes("KDV Oranı"));
  assert.ok(!component.includes("kdv_orani"));
});

test("menü ve route Teklif Yönetimi ekranına bağlıdır", async () => {
  const app = await readFile(new URL("./src/App.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("./src/components/layout/AppLayout.tsx", import.meta.url), "utf8");
  assert.ok(app.includes('path="/quote-management"'));
  assert.ok(layout.includes('label: "Teklif Yönetimi"'));
  assert.ok(layout.includes('path: "/quote-management"'));
});
