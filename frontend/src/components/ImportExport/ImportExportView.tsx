import { useEffect, useMemo, useRef, useState } from "react";
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
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DownloadIcon from "@mui/icons-material/Download";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";

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

type BudgetImportRow = {
  type: string;
  budget_code: string;
  budget_name: string;
  scenario: string;
  year: string;
  month: string;
  amount: string;
  date?: string;
  quantity?: string;
  unit_price?: string;
  vendor?: string;
  description?: string;
  department?: string | null;
  out_of_budget?: string;
  capex_opex?: string;
  asset_type?: string;
};

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
  "department",
  "out_of_budget",
  "capex_opex",
  "asset_type"
] as const;

type SampleHeader = (typeof sampleHeaders)[number];

const sampleRows: BudgetImportRow[] = [
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
    department: "Operasyon",
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
    department: "Operasyon",
    out_of_budget: "YANLIŞ",
    capex_opex: "Capex",
    asset_type: "Donanım"
  }
];

const monthLabels = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık"
];

const sampleCsv = [
  sampleHeaders.join(","),
  ...sampleRows.map((row) =>
    sampleHeaders.map((header) => row[header as keyof BudgetImportRow] ?? "").join(",")
  )
].join("\n");

export default function ImportExportView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = usePersistentState<number | "">("io:year", new Date().getFullYear());
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("io:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("io:budgetItemId", null);
  const [monthFilter, setMonthFilter] = usePersistentState<number | "">("io:month", "");
  const [departmentFilter, setDepartmentFilter] = usePersistentState<string>("io:department", "");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{ message: string; severity: "success" | "error" } | null>(
    null
  );

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

  const { data: departments = [] } = useQuery<string[]>({
    queryKey: ["plan-departments", year, scenarioId],
    queryFn: async () => {
      const params: Record<string, number> = {};
      if (year) params.year = Number(year);
      if (scenarioId) params.scenario_id = scenarioId;
      const { data } = await client.get<string[]>("/plans/departments", { params });
      return data ?? [];
    }
  });

  const budgetFilterOptions = useMemo(
    () =>
      createFilterOptions<BudgetItem>({
        stringify: (option) =>
          `${option.code ?? ""} ${stripBudgetCode(option.name ?? "")} ${option.map_category ?? ""} ${option.map_attribute ?? ""}`
      }),
    []
  );

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
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;
        setError(detail || "Dosya içe aktarılırken bir hata oluştu. Lütfen formatı kontrol edin.");
      } else {
        setError("Dosya içe aktarılırken bir hata oluştu. Lütfen formatı kontrol edin.");
      }
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

  const handleRestoreFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleRestoreBackup(file);
      event.target.value = "";
    }
  };

  const buildExportParams = () => {
    const params: Record<string, string | number> = {};
    if (year) params.year = Number(year);
    if (scenarioId) params.scenario_id = scenarioId;
    if (budgetItemId) params.budget_item_id = budgetItemId;
    if (monthFilter) params.month = Number(monthFilter);
    if (departmentFilter) params.department = departmentFilter;
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
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;
        setExportError(detail || "Dışa aktarma sırasında bir hata oluştu. Lütfen filtreleri kontrol edin.");
      } else {
        setExportError("Dışa aktarma sırasında bir hata oluştu. Lütfen filtreleri kontrol edin.");
      }
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
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;
        setExportError(
          detail || "Üç aylık rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin."
        );
      } else {
        setExportError("Üç aylık rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
      }
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
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;
        setExportError(
          detail || "Seçili rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin."
        );
      } else {
        setExportError("Seçili rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPreparedPurchaseForms = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params: Record<string, string | number> = {};
      if (year) params.year = Number(year);
      if (scenarioId) params.scenario_id = scenarioId;
      if (monthFilter) params.month = Number(monthFilter);
      if (departmentFilter) params.department = departmentFilter;
      const response = await client.get("/reports/purchase-forms-prepared/xlsx", {
        params,
        responseType: "blob",
      });
      downloadBlob(response.data, `satinalma_formu_hazirlanan_butceler_${year}.xlsx`);
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;
        setExportError(detail || "Rapor indirilirken hata oluştu. Lütfen filtreleri kontrol edin.");
      } else {
        setExportError("Rapor indirilirken hata oluştu. Lütfen filtreleri kontrol edin.");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadBackup = async (type: "full" | "users") => {
    setExporting(true);
    setBackupFeedback(null);
    try {
      const response = await client.get(`/backup/${type}`, {
        responseType: "blob"
      });
      const fileName =
        type === "full"
          ? `butce_tam_yedek_${Date.now()}.json`
          : `butce_kullanicilar_${Date.now()}.json`;
      downloadBlob(response.data, fileName, { type: "application/json" });
      setBackupFeedback({
        message: "Yedek başarıyla indirildi.",
        severity: "success"
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        message: "Yedek indirilirken hata oluştu.",
        severity: "error"
      });
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreBackup = async (file: File) => {
    const confirmed = window.confirm(
      "Mevcut tüm veri silinip yüklenecek, emin misiniz?"
    );
    if (!confirmed) return;
    setExporting(true);
    setBackupFeedback(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await client.post("/backup/restore/full", payload);
      setBackupFeedback({
        message: "Yedek başarıyla geri yüklendi.",
        severity: "success"
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        message: "Yedek geri yüklenirken hata oluştu.",
        severity: "error"
      });
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
      ...sampleRows.map((row) =>
        sampleHeaders.map((header) => row[header as keyof BudgetImportRow] ?? "")
      )
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
                  Plan ve harcama verilerini JSON, CSV veya Excel (XLSX) formatında sisteme aktarabilirsiniz.
                </Typography>
                <Stack component="ul" spacing={0.5} sx={{ pl: 3, m: 0 }}>
                  <Typography component="li" variant="body2" color="text.secondary">
                    Dosyalarınızda kod, ad, senaryo, yıl, ay ve tutar sütunlarının bulunduğundan emin olun; Map Nitelik
                    (map_attribute) ve Map Capex/Opex (map_category) sütunları da desteklenir.
                  </Typography>
                  <Typography component="li" variant="body2" color="text.secondary">
                    Departman (opsiyonel): Bu plan kaydının bağlı olduğu departman. Örnek: "Operasyon", "Bilgi İşlem", "Pazarlama".
                  </Typography>
                  <Typography component="li" variant="body2" color="text.secondary">
                    Qlik’ten alınan pivot tablo çıktıları gibi “Row Labels” ve ay bazlı sütunlar içeren Excel dosyaları da otomatik
                    olarak parçalanıp plana dönüştürülür.
                  </Typography>
                </Stack>
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
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="Ay"
                      value={monthFilter}
                      onChange={(event) =>
                        setMonthFilter(event.target.value ? Number(event.target.value) : "")
                      }
                      fullWidth
                    >
                      <MenuItem value="">Tümü</MenuItem>
                      {monthLabels.map((label, index) => (
                        <MenuItem key={label} value={index + 1}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="Departman"
                      value={departmentFilter}
                      onChange={(event) => setDepartmentFilter(event.target.value)}
                      fullWidth
                    >
                      <MenuItem value="">Tümü</MenuItem>
                      {departments.map((department) => (
                        <MenuItem key={department} value={department}>
                          {department}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <Autocomplete
                      options={budgetItems ?? []}
                      value={budgetItems?.find((item) => item.id === budgetItemId) ?? null}
                      onChange={(_, value) => setBudgetItemId(value?.id ?? null)}
                      getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                      filterOptions={budgetFilterOptions}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      renderInput={(params) => (
                        <TextField {...params} label="Bütçe Kalemi" placeholder="Tümü" fullWidth />
                      )}
                    />
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

      {isAdmin && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={600}>
                Yönetici Yedekleme
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tam yedek ve kullanıcı yedeklerini alabilir, mevcut veriyi tamamen değiştirerek geri yükleyebilirsiniz.
              </Typography>
              {backupFeedback && (
                <Alert severity={backupFeedback.severity}>{backupFeedback.message}</Alert>
              )}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleDownloadBackup("full")}
                  disabled={exporting}
                >
                  Tam Yedek Al
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={() => void handleDownloadBackup("users")}
                  disabled={exporting}
                >
                  Kullanıcı Yedeği Al
                </Button>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<CloudUploadIcon />}
                  onClick={() => restoreInputRef.current?.click()}
                  disabled={exporting}
                >
                  Geri Yükle (Replace)
                </Button>
                <input
                  ref={restoreInputRef}
                  type="file"
                  hidden
                  accept="application/json"
                  onChange={handleRestoreFileChange}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

    </Stack>
  );
}
