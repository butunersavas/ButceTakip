import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";


const source = readFileSync(
  new URL("./src/components/WarrantyTracking/WarrantyTrackingView.tsx", import.meta.url),
  "utf8"
);

const searchColumnsStart = source.indexOf('headerName: "KATEGORİ"');
const searchColumnsEnd = source.indexOf("].map", searchColumnsStart);
const searchColumns = source.slice(searchColumnsStart, searchColumnsEnd);


test("Garanti arama sonucu dokuz kolon sözleşmesini korur", () => {
  assert.notEqual(searchColumnsStart, -1);
  assert.notEqual(searchColumnsEnd, -1);

  for (const header of [
    "KATEGORİ",
    "KAYIT / ÜRÜN ADI",
    "MARKA / MODEL",
    "SERİ NUMARASI",
    "GARANTİ BİTİŞ TARİHİ",
    "Kalan Gün",
    "FİRMA / KAYNAK",
    "KAYDI GİREN",
  ]) {
    assert.match(searchColumns, new RegExp(`headerName: "${header}"`));
  }
  assert.match(searchColumns, /actionColumn/);
});

test("Seri numarası gerçek serial_number alanından gösterilir", () => {
  const serialColumnStart = searchColumns.indexOf('field: "serial_number"');
  const serialColumnEnd = searchColumns.indexOf("},", serialColumnStart);
  const serialColumn = searchColumns.slice(serialColumnStart, serialColumnEnd);

  assert.notEqual(serialColumnStart, -1);
  assert.match(serialColumn, /params\?\.row\?\.serial_number/);
  assert.doesNotMatch(serialColumn, /asset_tag|service_code/);
  assert.match(source, /const toSearchResultText/);
  assert.match(source, /const getWarrantySource/);
});
