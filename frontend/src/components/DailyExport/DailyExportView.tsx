import { useEffect, useMemo, useRef, useState } from "react";
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

interface LabelHistoryEntry {
  labelIdentifier: string;
  receiverRegion: string;
  receiverName: string;
  dispatchNote: string;
  productName: string;
  assetNumber: string;
  date: string;
  printedAt: string;
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
  const [productName, setProductName] = useState("");
  const [assetNumber, setAssetNumber] = useState("");
  const [labelSequence, setLabelSequence] = useState(1);
  const [labelHistory, setLabelHistory] = useState<LabelHistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];

    const stored = window.localStorage.getItem("daily-export-label-history");
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Geçmiş verisi okunamadı", error);
      return [];
    }
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("Tümü");
  const labelRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildSampleRows(date), [date]);

  const labelIdentifier = useMemo(
    () => `${date.replace(/-/g, "")}-${labelSequence.toString().padStart(3, "0")}`,
    [date, labelSequence]
  );

  useEffect(() => {
    window.localStorage.setItem("daily-export-label-history", JSON.stringify(labelHistory));
  }, [labelHistory]);

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

    const missingFields: string[] = [];
    if (!receiverName.trim()) missingFields.push("Alıcı Adı");
    if (!receiverRegion.trim()) missingFields.push("Alıcı Bölge");
    if (!productName.trim()) missingFields.push("Gönderilen Ürün");
    if (!assetNumber.trim()) missingFields.push("Demirbaş Numarası");
    if (!date) missingFields.push("Tarih");

    if (missingFields.length > 0) {
      setExportStatus({
        type: "error",
        message: `${missingFields.join(", ")} alanlarını doldurmalısınız. Not alanı isteğe bağlıdır.`
      });
      return;
    }

    const printWindow = window.open("", "_blank", "width=520,height=680");
    if (!printWindow) {
      setExportStatus({ type: "error", message: "Yazdırma penceresi açılamadı." });
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Barkod Etiketi</title>
          <style>
            :root { font-family: 'Inter', Arial, sans-serif; color: #0f172a; }
            body { margin: 0; padding: 24px; background: #f8fafc; }
            .sheet { max-width: 460px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12); padding: 20px; }
            .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
            .toolbar h1 { font-size: 16px; margin: 0; }
            .hint { font-size: 12px; color: #475569; margin: 12px 0 0; }
            .label { width: 100mm; height: 100mm; box-sizing: border-box; padding: 10mm; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
            .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
            .print-btn { background: #e11d48; color: #fff; border: none; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-weight: 700; }
            .print-btn:hover { background: #be123c; }
            @page { size: 100mm 100mm; margin: 0; }
            @media print { body { background: transparent; padding: 0; } .sheet { box-shadow: none; border: none; padding: 0; } .toolbar, .actions, .hint { display: none; } }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="toolbar">
              <h1>Günlük Çıkış Barkod Önizleme</h1>
              <span style="font-size:12px; color:#64748b;">${new Date(date).toLocaleDateString("tr-TR")}</span>
            </div>
            <div class="label">${labelRef.current.innerHTML}</div>
            <div class="actions">
              <button class="print-btn" onclick="window.print()">Yazdır</button>
            </div>
            <p class="hint">Barkodun son halini bu pencerede görebilir, yazdırmadan önce yazıcı ayarlarını güncelleyebilirsiniz.</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    const printedAt = new Date().toISOString();
    setLabelHistory((previous) => [
      {
        labelIdentifier,
        receiverRegion,
        receiverName,
        dispatchNote,
        productName,
        assetNumber,
        date,
        printedAt
      },
      ...previous
    ]);

    setExportStatus({ type: "success", message: "Etiket yazdırma işine gönderildi." });
    setLabelSequence((previous) => previous + 1);
  };

  const filteredHistory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return labelHistory.filter((entry) => {
      const matchesRegion = regionFilter === "Tümü" || entry.receiverRegion === regionFilter;

      if (!normalizedSearch) {
        return matchesRegion;
      }

      const content = [
        entry.receiverName,
        entry.receiverRegion,
        entry.productName,
        entry.assetNumber,
        entry.dispatchNote,
        entry.labelIdentifier
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesRegion && content.includes(normalizedSearch);
    });
  }, [labelHistory, regionFilter, searchTerm]);

  return (
    <Stack spacing={3} data-section="gunluk-cikis">
      <Stack direction="row" spacing={1} alignItems="center">
        <CalendarMonthIcon color="primary" />
        <Typography variant="h5" fontWeight={700} component="h1">
          Günlük Çıkış
        </Typography>
      </Stack>
      <Typography variant="body1" color="text.secondary">
        Günlük plan özetini indirip barkod yazdırma işlemlerini tek ekranda, gereksiz alanlar olmadan yönetin.
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
                  required
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="body2" color="text.secondary">
                  Tarihi belirledikten sonra tek tıkla XLSX veya CSV formatında günlük çıkış özetini indirebilirsiniz.
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

      <Card sx={{ border: 1, borderColor: "divider" }}>
        <CardContent>
          <Stack spacing={3}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={700}>
                Barkod ve Etiket Bilgileri
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Etiket yazdırma sırası: #{labelSequence.toString().padStart(3, "0")}
              </Typography>
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  label="Alıcı Adı"
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  placeholder="Alıcı adı veya firma"
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  select
                  label="Alıcı Bölge"
                  value={receiverRegion}
                  onChange={(event) => setReceiverRegion(event.target.value)}
                  fullWidth
                  required
                >
                  {receiverRegions.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  label="Günlük Çıkış Notu"
                  value={dispatchNote}
                  onChange={(event) => setDispatchNote(event.target.value)}
                  placeholder="Örn. Acil teslimat"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  label="Gönderilen Ürün"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="Ürün adı"
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  label="Demirbaş Numarası"
                  value={assetNumber}
                  onChange={(event) => setAssetNumber(event.target.value)}
                  placeholder="örn. DM-1024"
                  fullWidth
                  required
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
                      Gönderilen Ürün: {productName || "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Demirbaş No: {assetNumber || "-"}
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
                    Barkod yazdır butonuna bastığınızda açılan pencerede etiketin son halini görebilir, ardından yazıcı ayarlarını
                    güncelleyerek çıktıyı alabilirsiniz.
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

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700} component="h2">
              Yazdırma Geçmişi
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Gönderilen ürün, alıcı ismi, alıcı bölge ve demirbaş numarası alanlarında hızlı arama yapabilirsiniz.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  label="Arama"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Ürün, alıcı, demirbaş no vb."
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  select
                  label="Bölge Filtresi"
                  value={regionFilter}
                  onChange={(event) => setRegionFilter(event.target.value)}
                  fullWidth
                >
                  <MenuItem value="Tümü">Tümü</MenuItem>
                  {receiverRegions.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            {filteredHistory.length === 0 ? (
              <Alert severity="info">Henüz kayıtlı bir etiket yazdırma bulunmuyor.</Alert>
            ) : (
              <Stack spacing={1.5} divider={<Divider flexItem />}>
                {filteredHistory.map((entry) => (
                  <Stack key={`${entry.labelIdentifier}-${entry.printedAt}`} spacing={0.5}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {entry.productName || "(Ürün belirtilmedi)"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Alıcı: {entry.receiverName || "-"} · Bölge: {entry.receiverRegion}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Demirbaş No: {entry.assetNumber || "-"} · Etiket ID: {entry.labelIdentifier}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Not: {entry.dispatchNote || "-"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Yazdırılma tarihi: {new Date(entry.printedAt).toLocaleString("tr-TR")}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
