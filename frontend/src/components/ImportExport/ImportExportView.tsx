import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DownloadIcon from "@mui/icons-material/Download";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { formatBudgetItemLabel } from "../../utils/budgetItem";

interface Scenario {
  id: number;
  name: string;
  year: number;
}

interface BudgetItem {
  id: number;
  code: string;
  name: string;
  map_category?: string | null;
  map_attribute?: string | null;
}

interface ImportSummary {
  imported_plans: number;
  imported_expenses: number;
  skipped_rows: number;
  message?: string;
}

const sampleHeaders = [
  "type",
  "budget_code",
  "budget_name",
  "scenario",
  "year",
  "month",
  "amount",
  "date",
  "quantity",
  "unit_price",
  "vendor",
  "description",
  "Departman",
  "out_of_budget",
  "capex_opex",
  "asset_type"
] as const;

type SampleHeader = (typeof sampleHeaders)[number];

type SampleRow = Record<SampleHeader, string>;

const sampleRows: SampleRow[] = [
  {
    type: "plan",
    budget_code: "SK01",
    budget_name: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    scenario: "Temel",
    year: "2026",
    month: "6",
    amount: "50000",
    date: "",
    quantity: "1",
    unit_price: "50000",
    vendor: "",
    description: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    Departman: "Operasyon",
    out_of_budget: "YANLIŞ",
    capex_opex: "Capex",
    asset_type: "Donanım"
  },
  {
    type: "plan",
    budget_code: "SK01",
    budget_name: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    scenario: "Temel",
    year: "2026",
    month: "10",
    amount: "50000",
    date: "",
    quantity: "1",
    unit_price: "50000",
    vendor: "",
    description: "ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)",
    Departman: "Operasyon",
    out_of_budget: "YANLIŞ",
    capex_opex: "Capex",
    asset_type: "Donanım"
  }
];

const sampleCsv = [
  sampleHeaders.join(","),
  ...sampleRows.map((row) => sampleHeaders.map((header) => row[header]).join(","))
].join("\n");

export default function ImportExportView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = usePersistentState<number | "">("io:year", new Date().getFullYear());
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("io:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("io:budgetItemId", null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await client.get<Scenario[]>("/scenarios");
      return data;
    }
  });

  const { data: budgetItems } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      const { data } = await client.get<BudgetItem[]>("/budget-items");
      return data;
    }
  });

  useEffect(() => {
    if (!scenarios?.length) return;
    const numericYear = typeof year === "string" ? Number(year) : year;
    const matchingScenario = scenarios.find((scenario) => scenario.year === numericYear);
    setScenarioId((previous) => {
      if (
        previous &&
        scenarios.some((scenario) => scenario.id === previous && scenario.year === numericYear)
      ) {
        return previous;
      }
      return matchingScenario ? matchingScenario.id : null;
    });
  }, [scenarios, year]);

  const handleImport = async (file: File, type: "json" | "csv" | "xlsx") => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await client.post<ImportSummary>(`/io/import/${type}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportSummary(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["budget-items"] });
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    } catch (err) {
      console.error(err);
      setError("Dosya içe aktarılırken bir hata oluştu. Lütfen formatı kontrol edin.");
      setImportSummary(null);
    }
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "json" | "csv"
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (type === "json") {
        void handleImport(file, "json");
      } else if (extension === "xlsx" || extension === "xls") {
        void handleImport(file, "xlsx");
      } else {
        void handleImport(file, "csv");
      }
      event.target.value = "";
    }
  };

  const buildExportParams = () => {
    const params: Record<string, string | number> = {};
    if (year) params.year = Number(year);
    if (scenarioId) params.scenario_id = scenarioId;
    if (budgetItemId) params.budget_item_id = budgetItemId;
    return params;
  };

  const downloadBlob = (
    data: BlobPart | Blob,
    fileName: string,
    options?: BlobPropertyBag
  ) => {
    const blob = data instanceof Blob && !options ? data : new Blob([data], options);
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get("/io/export/xlsx", {
        params: buildExportParams(),
        responseType: "blob"
      });
      downloadBlob(response.data, `butce-raporu-${Date.now()}.xlsx`);
    } catch (err) {
      console.error(err);
      setExportError("Dışa aktarma sırasında bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleQuarterlyExportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get("/io/export/quarterly/xlsx", {
        params: buildExportParams(),
        responseType: "blob"
      });
      downloadBlob(response.data, `butce-ucaylik-rapor-${Date.now()}.xlsx`);
    } catch (err) {
      console.error(err);
      setExportError("Üç aylık rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleFilteredExpenseExport = async (type: "out-of-budget" | "cancelled") => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get(`/io/export/expenses/${type}`, {
        params: buildExportParams(),
        responseType: "blob"
      });
      const fileName =
        type === "out-of-budget"
          ? `butce-disi-harcamalar-${Date.now()}.xlsx`
          : `iptal-edilen-harcamalar-${Date.now()}.xlsx`;
      downloadBlob(response.data, fileName);
    } catch (err) {
      console.error(err);
      setExportError("Seçili rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPreparedPurchaseForms = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await client.get("/reports/purchase-forms-prepared/xlsx", {
        params: { year, scenario_id: scenarioId ?? undefined },
        responseType: "blob",
      });
      downloadBlob(response.data, `satinalma_formu_hazirlanan_butceler_${year}.xlsx`);
    } catch (err) {
      console.error(err);
      setExportError("Rapor indirilirken hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const downloadSampleCsv = () => {
    downloadBlob(sampleCsv, "butce-ornek.csv", { type: "text/csv;charset=utf-8;" });
  };

  const downloadSampleXlsx = () => {
    const worksheetData = [
      sampleHeaders,
      ...sampleRows.map((row) => sampleHeaders.map((header) => row[header]))
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Örnek");
    const workbookBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    downloadBlob(workbookBuffer, "butce-ornek.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  };

  return (
    <Stack spacing={4}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  İçe Aktarım
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Plan ve harcama verilerini JSON, CSV veya Excel (XLSX) formatında sisteme aktarabilirsiniz. Lütfen dosyalarınıza
                  Map Nitelik sütununu da ekleyin. Qlik’ten alınan pivot tablo çıktıları gibi “Row Labels” ve ay bazlı sütunlar içeren
                  Departman sütunu opsiyoneldir; boş bırakılabilir.
                  Excel dosyaları da otomatik olarak parçalanıp plana dönüştürülür.
                </Typography>
                {error && <Alert severity="error">{error}</Alert>}
                {importSummary && (
                  <Alert severity="success">
                    {importSummary.message ?? "İçe aktarma tamamlandı"} — Plan: {importSummary.imported_plans}
                    , Harcama: {importSummary.imported_expenses}, Atlanan Satır: {importSummary.skipped_rows}
                  </Alert>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button
                    component="label"
                    variant="contained"
                    startIcon={<CloudUploadIcon />}
                  >
                    JSON Yükle
                    <input type="file" hidden accept="application/json" onChange={(event) => handleFileChange(event, "json")} />
                  </Button>
                  <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
                    CSV/XLSX Yükle
                    <input
                      type="file"
                      hidden
                      accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => handleFileChange(event, "csv")}
                    />
                  </Button>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignSelf: "flex-start" }}>
                  <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadSampleCsv}>
                    Örnek CSV indir
                  </Button>
                  <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadSampleXlsx}>
                    Örnek XLSX indir
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  Dışa Aktarım
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Filtrelere göre plan ve harcama raporlarını, üç aylık özetleri ve özel harcama listelerini XLSX
                  formatında dışa aktarın.
                </Typography>
                {exportError && <Alert severity="error">{exportError}</Alert>}
                <Divider sx={{ my: 1 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      label="Yıl"
                      type="number"
                      value={year}
                      onChange={(event) => setYear(event.target.value ? Number(event.target.value) : "")}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      select
                      label="Senaryo"
                      value={scenarioId ?? ""}
                      onChange={(event) =>
                        setScenarioId(event.target.value ? Number(event.target.value) : null)
                      }
                      fullWidth
                    >
                      <MenuItem value="">Tümü</MenuItem>
                      {scenarios?.map((scenario) => (
                        <MenuItem key={scenario.id} value={scenario.id}>
                          {scenario.name} ({scenario.year})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      select
                      label="Bütçe Kalemi"
                      value={budgetItemId ?? ""}
                      onChange={(event) =>
                        setBudgetItemId(event.target.value ? Number(event.target.value) : null)
                      }
                      fullWidth
                    >
                <MenuItem value="">Tümü</MenuItem>
                {budgetItems?.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {formatBudgetItemLabel(item)}
                  </MenuItem>
                ))}
                    </TextField>
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleExportXlsx()}
                      disabled={exporting}
                      fullWidth
                    >
                      Bütçe Yedek Al
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleQuarterlyExportXlsx()}
                      disabled={exporting}
                      fullWidth
                    >
                      3 Aylık XLSX İndir
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleFilteredExpenseExport("out-of-budget")}
                      disabled={exporting}
                      fullWidth
                    >
                      Bütçe Dışı Harcamalar XLSX
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleFilteredExpenseExport("cancelled")}
                      disabled={exporting}
                      fullWidth
                    >
                      İptal Edilen Harcamalar XLSX
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      variant="contained"
                      color="primary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleDownloadPreparedPurchaseForms()}
                      disabled={exporting}
                    >
                      Satın alma formu hazırlanan bütçeler XLSX
                    </Button>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

    </Stack>
  );
}
