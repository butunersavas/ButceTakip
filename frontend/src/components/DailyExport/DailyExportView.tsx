import { useMemo, useRef, useState } from "react";
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
import DownloadIcon from "@mui/icons-material/Download";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PrintIcon from "@mui/icons-material/Print";
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

const receiverRegions = [
  "ANADOLU",
  "ANKARA",
  "ANTALYA",
  "BATI KARADENİZ",
  "BURSA",
  "DIYARBAKIR",
  "ERZURUM",
  "GAZIANTEP",
  "KARADENİZ",
  "SURDIŞI",
  "TRAKYA",
  "ÇUKUROVA",
  "İZMİR",
  "İÇ ANADOLU"
];

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
  const [receiverRegion, setReceiverRegion] = useState<string>(receiverRegions[0]);
  const [receiverName, setReceiverName] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [labelSequence, setLabelSequence] = useState(1);
  const labelRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildSampleRows(date), [date]);

  const labelIdentifier = useMemo(
    () => `${date.replace(/-/g, "")}-${labelSequence.toString().padStart(3, "0")}`,
    [date, labelSequence]
  );

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

  const handlePrintLabel = () => {
    if (!labelRef.current) return;

    const printWindow = window.open("", "_blank", "width=420,height=520");
    if (!printWindow) {
      setExportStatus({ type: "error", message: "Yazdırma penceresi açılamadı." });
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Barkod Etiketi</title>
          <style>
            @page { size: 100mm 100mm; margin: 0; }
            body { margin: 0; display: flex; justify-content: center; align-items: center; font-family: Arial, sans-serif; }
            .label { width: 100mm; height: 100mm; box-sizing: border-box; padding: 10mm; }
          </style>
        </head>
        <body>
          <div class="label">${labelRef.current.innerHTML}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
    setLabelSequence((previous) => previous + 1);
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

      <Card sx={{ border: 2, borderColor: "error.main" }}>
        <CardContent>
          <Stack spacing={3}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={700} color="error.main">
                Günlük Çıkış Etiket Alanı
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Etiket yazdırma sırası: #{labelSequence.toString().padStart(3, "0")}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Kırmızı çerçeve içindeki alan yalnızca Günlük Çıkış etiketleri içindir. Gönderici sabit olarak
              "Teknik Destek Departmanı" olarak kalır; alıcı bölgesi listeden seçilir ve etiket üzerine yazılır.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  label="Alıcı Adı"
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  placeholder="Alıcı adı veya firma"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  select
                  label="Alıcı Bölge"
                  value={receiverRegion}
                  onChange={(event) => setReceiverRegion(event.target.value)}
                  fullWidth
                >
                  {receiverRegions.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={12} lg={4}>
                <TextField
                  label="Günlük Çıkış Notu"
                  value={dispatchNote}
                  onChange={(event) => setDispatchNote(event.target.value)}
                  placeholder="Örn. Acil teslimat"
                  fullWidth
                />
              </Grid>
            </Grid>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={8}>
                <Box
                  ref={labelRef}
                  sx={{
                    border: "1px dashed",
                    borderColor: "grey.400",
                    borderRadius: 2,
                    p: 2,
                    width: "100%",
                    maxWidth: 360,
                    bgcolor: "background.paper"
                  }}
                >
                  <Stack spacing={1}>
                    <Typography variant="caption" color="text.secondary">
                      Etiket #{labelSequence.toString().padStart(3, "0")} · {new Date(date).toLocaleDateString("tr-TR")}
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      Alıcı Bölge: {receiverRegion}
                    </Typography>
                    <Typography variant="subtitle2" color="text.secondary">
                      Alıcı: {receiverName || "(Belirtilmedi)"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Gönderici: Teknik Destek Departmanı
                    </Typography>
                    <Typography variant="body2">Günlük Çıkış Notu: {dispatchNote || "-"}</Typography>
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: "grey.900",
                        color: "grey.100",
                        fontFamily: "monospace",
                        letterSpacing: 2,
                        textAlign: "center"
                      }}
                    >
                      {labelIdentifier}
                    </Box>
                  </Stack>
                </Box>
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    Barkod yazdır butonuna bastığınızda Zebra ZD220 (10×10 cm) yazıcıdan etiket çıktısı alınır. Etiket
                    içeriklerinde "Teknik Çıkış Etiketi" metni gösterilmez, yalnızca gönderici ve alıcı bilgileri
                    yer alır.
                  </Typography>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<PrintIcon />}
                    onClick={handlePrintLabel}
                    fullWidth
                  >
                    Barkod Yazdır
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
