import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import * as XLSX from "xlsx";

interface ExportStatus {
  type: "success" | "error";
  message: string;
}

interface DailyExportRow {
  date: string;
  category: string;
  amount: number;
  note: string;
}

function buildSampleRows(selectedDate: string): DailyExportRow[] {
  const dayLabel = new Date(selectedDate).toLocaleDateString("tr-TR");
  return [
    {
      date: dayLabel,
      category: "Planlanan Harcama",
      amount: 125000,
      note: "Günlük planlanan toplam"
    },
    {
      date: dayLabel,
      category: "Gerçekleşen Harcama",
      amount: 118400,
      note: "Sistemdeki kayıtlı işlemler"
    },
    {
      date: dayLabel,
      category: "Tasarruf",
      amount: 6600,
      note: "Plan - Gerçekleşen farkı"
    }
  ];
}

function downloadBlob(data: BlobPart | Blob, fileName: string, options?: BlobPropertyBag) {
  const blob = data instanceof Blob && !options ? data : new Blob([data], options);
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DailyExportView() {
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const rows = useMemo(() => buildSampleRows(date), [date]);

  const handleExport = (format: "xlsx" | "csv") => {
    try {
      if (!date) {
        setExportStatus({ type: "error", message: "Lütfen geçerli bir tarih seçin." });
        return;
      }

      if (format === "xlsx") {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Gunluk Cikis");
        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        downloadBlob(buffer, `gunluk-cikis-${date}.xlsx`, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
      } else {
        const headers = ["Tarih", "Kategori", "Tutar", "Not"];
        const csvRows = [
          headers.join(";"),
          ...rows.map((row) => [row.date, row.category, row.amount, row.note].join(";"))
        ];
        downloadBlob(csvRows.join("\n"), `gunluk-cikis-${date}.csv`, {
          type: "text/csv;charset=utf-8;"
        });
      }

      setExportStatus({ type: "success", message: "Günlük çıkış dosyası indirildi." });
    } catch (error) {
      console.error(error);
      setExportStatus({
        type: "error",
        message: "Dosya hazırlanırken bir sorun oluştu. Lütfen tekrar deneyin."
      });
    }
  };

  return (
    <Stack spacing={3} data-section="gunluk-cikis">
      <Stack direction="row" spacing={1} alignItems="center">
        <CalendarMonthIcon color="primary" />
        <Typography variant="h5" fontWeight={700} component="h1">
          Günlük Çıkış
        </Typography>
      </Stack>
      <Typography variant="body1" color="text.secondary">
        Seçtiğiniz gün için plan, gerçekleşen harcamalar ve tasarruf özetini tek ekrandan
        dışa aktarın. Bu ekran yalnızca günlük çıkışa odaklanır; temizleme araçlarıyla
        aynı sayfada değildir.
      </Typography>
      {exportStatus && <Alert severity={exportStatus.type}>{exportStatus.message}</Alert>}
      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  label="Tarih"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="body2" color="text.secondary">
                  Tarihi seçtikten sonra tek tıkla XLSX veya CSV formatında günlük çıkış dosyasını
                  indirebilirsiniz.
                </Typography>
              </Grid>
            </Grid>
            <Divider />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExport("xlsx")}
                  fullWidth
                >
                  XLSX olarak indir
                </Button>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExport("csv")}
                  fullWidth
                >
                  CSV olarak indir
                </Button>
              </Grid>
            </Grid>
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Önizleme
              </Typography>
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    {rows.map((row) => (
                      <Stack
                        key={`${row.category}-${row.note}`}
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Typography variant="body2" fontWeight={600}>
                          {row.category}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {row.date}
                        </Typography>
                        <Typography variant="body2" color="primary" fontWeight={700}>
                          {row.amount.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {row.note}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
