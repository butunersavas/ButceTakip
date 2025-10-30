import { useEffect, useState } from "react";
import {
  Alert,
  Box,
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

import useAuthorizedClient from "../../hooks/useAuthorizedClient";

interface Scenario {
  id: number;
  name: string;
  year: number;
}

interface BudgetItem {
  id: number;
  code: string;
  name: string;
}

interface ImportSummary {
  imported_plans: number;
  imported_expenses: number;
  skipped_rows: number;
  message?: string;
}

const sampleCsv = `type,budget_code,budget_name,scenario,year,month,amount,date,quantity,unit_price,vendor,description,out_of_budget\nplan,MARKETING,Marketing Temel,Temel,2024,1,15000,,,,,,false\nexpense,MARKETING,Marketing Temel,Temel,2024,,12000,2024-01-15,1,12000,ACME Ltd,Reklam harcaması,false\n`;

export default function ImportExportView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | "">(new Date().getFullYear());
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [budgetItemId, setBudgetItemId] = useState<number | null>(null);
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

  const handleImport = async (file: File, type: "json" | "csv") => {
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, type: "json" | "csv") => {
    const file = event.target.files?.[0];
    if (file) {
      void handleImport(file, type);
      event.target.value = "";
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    setExportError(null);
    try {
      const params: Record<string, string | number> = {};
      if (year) params.year = Number(year);
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      const response = await client.get(`/io/export/${format}`, {
        params,
        responseType: "blob"
      });
      const blob = new Blob([response.data]);
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      const fileName = `butce-raporu-${format}-${Date.now()}.${format}`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setExportError("Dışa aktarma sırasında bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const handleQuarterlyExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    setExportError(null);
    try {
      const params: Record<string, string | number> = {};
      if (year) params.year = Number(year);
      if (scenarioId) params.scenario_id = scenarioId;
      if (budgetItemId) params.budget_item_id = budgetItemId;
      const response = await client.get(`/io/export/quarterly/${format}`, {
        params,
        responseType: "blob"
      });
      const blob = new Blob([response.data]);
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      const fileName = `butce-ucaylik-rapor-${Date.now()}.${format}`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setExportError("Üç aylık rapor indirilirken bir hata oluştu. Lütfen filtreleri kontrol edin.");
    } finally {
      setExporting(false);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "butce-ornek.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Raporlama
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Verileri içe aktarın, filtrelenmiş raporları indirin ve üç aylık özetleri CSV/XLSX olarak dışa aktarın.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  İçe Aktarım
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Plan ve harcama verilerini JSON veya CSV formatında sisteme aktarabilirsiniz.
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
                <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadSample} sx={{ alignSelf: "flex-start" }}>
                  Örnek CSV indir
                </Button>
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
                  Filtrelere göre plan ve harcama raporlarını ve üç aylık özetleri CSV veya XLSX olarak dışa aktarın.
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
                          {item.code} — {item.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleExport("csv")}
                      disabled={exporting}
                      fullWidth
                    >
                      CSV Olarak Dışa Aktar
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleExport("xlsx")}
                      disabled={exporting}
                      fullWidth
                    >
                      XLSX Olarak Dışa Aktar
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      color="secondary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleQuarterlyExport("csv")}
                      disabled={exporting}
                      fullWidth
                    >
                      3 Aylık CSV İndir
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<DownloadIcon />}
                      onClick={() => void handleQuarterlyExport("xlsx")}
                      disabled={exporting}
                      fullWidth
                    >
                      3 Aylık XLSX İndir
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
