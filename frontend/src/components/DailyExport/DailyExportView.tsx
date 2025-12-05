import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import CheckIcon from "@mui/icons-material/CheckCircle";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/EditOutlined";
import { Link as RouterLink } from "react-router-dom";

interface LabelHistoryEntry {
  labelIdentifier: string;
  receiverRegion: string;
  receiverName: string;
  dispatchNote: string;
  productName: string;
  assetNumbers: string[];
  date: string;
  createdAt: string;
  printedAt?: string;
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

export default function DailyExportView() {
  const [exportStatus, setExportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [receiverRegion, setReceiverRegion] = useState<string>(receiverRegions[0]);
  const [receiverName, setReceiverName] = useState("");
  const [dispatchNote, setDispatchNote] = useState("");
  const [productName, setProductName] = useState("");
  const [assetNumbersInput, setAssetNumbersInput] = useState("");
  const [labelSequence, setLabelSequence] = useState(1);
  const [labelHistory, setLabelHistory] = useState<LabelHistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];

    const stored = window.localStorage.getItem("daily-export-label-history");
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((entry: LabelHistoryEntry) => ({
        ...entry,
        assetNumbers: Array.isArray(entry.assetNumbers)
          ? entry.assetNumbers
          : entry.assetNumbers
            ? String(entry.assetNumbers)
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
        createdAt: entry.createdAt ?? entry.printedAt ?? new Date().toISOString()
      }));
    } catch (error) {
      console.error("Geçmiş verisi okunamadı", error);
      return [];
    }
  });
  const [editingIdentifier, setEditingIdentifier] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("Tümü");
  const [dateFilter, setDateFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const highestSequence = labelHistory.reduce((maxValue, entry) => {
      const [, sequencePart] = entry.labelIdentifier.split("-");
      const parsed = Number(sequencePart);
      if (Number.isNaN(parsed)) return maxValue;
      return Math.max(maxValue, parsed);
    }, 0);
    setLabelSequence(highestSequence + 1);
  }, [labelHistory]);

  const labelIdentifier = useMemo(
    () => `${date.replace(/-/g, "")}-${labelSequence.toString().padStart(3, "0")}`,
    [date, labelSequence]
  );

  useEffect(() => {
    window.localStorage.setItem("daily-export-label-history", JSON.stringify(labelHistory));
  }, [labelHistory]);

  const parseAssetNumbers = (value: string) =>
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const parsedAssetNumbers = useMemo(
    () => parseAssetNumbers(assetNumbersInput),
    [assetNumbersInput]
  );

  const buildLabelMarkup = (entry: LabelHistoryEntry) => {
    const assetList = entry.assetNumbers.length
      ? entry.assetNumbers.map((asset) => `<li>${asset}</li>`).join("")
      : "<li>-</li>";

    return `
      <div style="display:flex;flex-direction:column;gap:8px;color:#0f172a;font-family:'Inter',Arial,sans-serif;">
        <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:18px;font-weight:800;">${entry.receiverRegion}</div>
            <div style="color:#475569;font-weight:600;">${entry.receiverName}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-weight:700;">Ürün</div>
          <div style="color:#0f172a;font-weight:600;">${entry.productName}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-weight:700;">Demirbaş Numarası</div>
          <ul style="margin:0;padding-left:18px;line-height:1.4;color:#0f172a;">${assetList}</ul>
        </div>
        <div style="font-size:12px;color:#475569;">Gönderici: Teknik Destek Departmanı</div>
        <div style="font-size:12px;color:#334155;font-weight:600;">Not: ${entry.dispatchNote || "-"}</div>
        <div style="margin-top:auto;text-align:center;padding:10px;border-radius:10px;background:#0f172a;color:#f1f5f9;font-weight:800;letter-spacing:2px;">${
          entry.labelIdentifier
        }</div>
      </div>
    `;
  };

  const createEntry = () => {
    const missingFields: string[] = [];
    const parsedAssets = parseAssetNumbers(assetNumbersInput);

    if (!receiverName.trim()) missingFields.push("Alıcı Adı");
    if (!receiverRegion.trim()) missingFields.push("Alıcı Bölge");
    if (!productName.trim()) missingFields.push("Ürün");
    if (!parsedAssets.length) missingFields.push("Demirbaş Numarası");
    if (!date) missingFields.push("Tarih");

    if (missingFields.length > 0) {
      setExportStatus({
        type: "error",
        message: `${missingFields.join(", ")} alanlarını doldurmalısınız. Not alanı isteğe bağlıdır.`
      });
      return null;
    }

    const targetIdentifier = editingIdentifier ?? labelIdentifier;
    const existingEntry = editingIdentifier
      ? labelHistory.find((item) => item.labelIdentifier === editingIdentifier)
      : null;

    const newEntry: LabelHistoryEntry = {
      labelIdentifier: targetIdentifier,
      receiverRegion,
      receiverName,
      dispatchNote,
      productName,
      assetNumbers: parsedAssets,
      date,
      createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
      printedAt: existingEntry?.printedAt
    };

    setLabelHistory((previous) =>
      editingIdentifier
        ? previous.map((item) =>
            item.labelIdentifier === editingIdentifier ? newEntry : item
          )
        : [newEntry, ...previous]
    );
    if (!editingIdentifier) {
      setLabelSequence((previous) => previous + 1);
    }
    setExportStatus({
      type: "success",
      message: editingIdentifier ? "Kayıt güncellendi." : "Kayıt oluşturuldu."
    });
    setEditingIdentifier(null);

    return newEntry;
  };

  const handleSave = () => {
    const entry = createEntry();
    if (entry) {
      setDispatchNote("");
      setProductName("");
      setAssetNumbersInput("");
    }
  };

  const handlePrintEntry = (entry: LabelHistoryEntry) => {
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
            .toolbar { display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin-bottom: 14px; }
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
            </div>
            <div class="label">${buildLabelMarkup(entry)}</div>
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
    setLabelHistory((previous) =>
      previous.map((item) =>
        item.labelIdentifier === entry.labelIdentifier ? { ...item, printedAt } : item
      )
    );
    setExportStatus({ type: "success", message: "Etiket yazdırma işine gönderildi." });
  };

  const handleDeleteEntry = (entry: LabelHistoryEntry) => {
    setLabelHistory((previous) =>
      previous.filter((item) => item.labelIdentifier !== entry.labelIdentifier)
    );
    if (editingIdentifier === entry.labelIdentifier) {
      setEditingIdentifier(null);
    }
    setExportStatus({
      type: "success",
      message: `${entry.labelIdentifier} numaralı kayıt silindi.`
    });
  };

  const handleEditEntry = (entry: LabelHistoryEntry) => {
    setEditingIdentifier(entry.labelIdentifier);
    setDate(entry.date);
    setReceiverRegion(entry.receiverRegion);
    setReceiverName(entry.receiverName);
    setProductName(entry.productName);
    setDispatchNote(entry.dispatchNote);
    setAssetNumbersInput(entry.assetNumbers.join("\n"));
    setExportStatus({
      type: "info",
      message: `${entry.labelIdentifier} etiketi düzenlenmek üzere yüklendi.`
    });
  };

  const filteredHistory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizedAsset = assetFilter.trim().toLowerCase();

    return labelHistory.filter((entry) => {
      const matchesRegion = regionFilter === "Tümü" || entry.receiverRegion === regionFilter;
      const matchesDate = !dateFilter || entry.date === dateFilter;
      const matchesAsset =
        !normalizedAsset || entry.assetNumbers.some((asset) => asset.toLowerCase().includes(normalizedAsset));

      if (!normalizedSearch) {
        return matchesRegion && matchesDate && matchesAsset;
      }

      const content = [
        entry.receiverName,
        entry.receiverRegion,
        entry.productName,
        entry.assetNumbers.join(" "),
        entry.dispatchNote,
        entry.labelIdentifier
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesRegion && matchesDate && matchesAsset && content.includes(normalizedSearch);
    });
  }, [assetFilter, dateFilter, labelHistory, regionFilter, searchTerm]);

  return (
    <Stack spacing={3} data-section="gunluk-cikis">
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="flex-end"
      flexWrap="wrap"
    >
      <Button component={RouterLink} to="/reports" variant="outlined" startIcon={<CheckIcon />}>
        Raporlama sekmesine git
      </Button>
    </Stack>
      {exportStatus && <Alert severity={exportStatus.type}>{exportStatus.message}</Alert>}

      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack spacing={3}>
                <Stack spacing={0.5}>
                  <Typography variant="h6" fontWeight={700}>
                    Kayıt Oluştur
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Günlük çıkış raporlarını indirmek için Raporlama sekmesini kullanın. Buradan depodan çıkan ürünleri kayıt
                    altına alabilir ve 100×100 mm etiket çıktısı alabilirsiniz.
                  </Typography>
                </Stack>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
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
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Alıcı Adı"
                      value={receiverName}
                      onChange={(event) => setReceiverName(event.target.value)}
                      placeholder="Alıcı adı"
                      required
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
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
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Gönderilen Ürün"
                      value={productName}
                      onChange={(event) => setProductName(event.target.value)}
                      placeholder="Ürün adı"
                      required
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Demirbaş Numarası"
                      value={assetNumbersInput}
                      onChange={(event) => setAssetNumbersInput(event.target.value)}
                      placeholder="Virgül veya satır sonuyla birden fazla numara ekleyin"
                      required
                      fullWidth
                      multiline
                      minRows={2}
                      helperText="Birden fazla demirbaş numarası yazabilirsiniz."
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Not (Opsiyonel)"
                      value={dispatchNote}
                      onChange={(event) => setDispatchNote(event.target.value)}
                      placeholder="İsteğe bağlı not"
                      fullWidth
                      multiline
                      minRows={2}
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={7}>
                    <Box
                      ref={labelRef}
                      sx={{
                        border: "1px dashed",
                        borderColor: "divider",
                        borderRadius: 2,
                        p: 2,
                        width: "100%",
                        bgcolor: "background.paper"
                      }}
                    >
                      <Stack spacing={1}>
                        <Typography variant="caption" color="text.secondary">
                          Etiket #{labelSequence.toString().padStart(3, "0")} · {new Date(date).toLocaleDateString("tr-TR")}
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                          {receiverRegion}
                        </Typography>
                        <Typography variant="subtitle2" color="text.secondary">
                          Alıcı: {receiverName || "(Belirtilmedi)"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Ürün: {productName || "-"}
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {(parsedAssetNumbers.length ? parsedAssetNumbers : ["-"]).map((item) => (
                            <Chip key={item} label={item} size="small" color="default" />
                          ))}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Gönderici: Teknik Destek Departmanı
                        </Typography>
                        <Typography variant="body2">Not: {dispatchNote || "-"}</Typography>
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
                  <Grid item xs={12} md={5}>
                    <Stack spacing={1.5}>
                      <Typography variant="body2" color="text.secondary">
                        Barkod yazdırma penceresi 100×100 mm ölçüsünde açılır. Yazdırmadan önce yazıcı ayarlarını kontrol edin.
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleSave} fullWidth>
                          Kaydı Oluştur
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<PrintIcon />}
                          onClick={() => {
                            const entry = createEntry();
                            if (entry) {
                              handlePrintEntry(entry);
                            }
                          }}
                          fullWidth
                        >
                          Kaydet ve Yazdır
                        </Button>
                      </Stack>
                    </Stack>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack spacing={2} sx={{ height: "100%" }}>
                <Typography variant="h6" fontWeight={700} component="h2">
                  Kayıtlar ve Yazdırma
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sağdaki listeden oluşturduğunuz kayıtları görebilir, her kaydın yanındaki yazdır butonuyla etiketi yazdırabilirsiniz.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Arama"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Ürün, alıcı, demirbaş no vb."
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
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
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Tarih Filtresi"
                      type="date"
                      value={dateFilter}
                      onChange={(event) => setDateFilter(event.target.value)}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Demirbaş Filtresi"
                      value={assetFilter}
                      onChange={(event) => setAssetFilter(event.target.value)}
                      placeholder="Demirbaş numarası girin"
                      fullWidth
                    />
                  </Grid>
                </Grid>

                {filteredHistory.length === 0 ? (
                  <Alert severity="info">Henüz kayıtlı bir etiket bulunmuyor.</Alert>
                ) : (
                  <Stack spacing={1.5} divider={<Divider flexItem />}>
                    {filteredHistory.map((entry) => (
                      <Stack
                        key={`${entry.labelIdentifier}-${entry.createdAt}`}
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        flexWrap="wrap"
                      >
                        <Stack spacing={0.5}>
                          <Typography variant="subtitle1" fontWeight={700}>
                            {entry.productName || "(Ürün belirtilmedi)"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Alıcı: {entry.receiverName || "-"} · Bölge: {entry.receiverRegion}
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {entry.assetNumbers.map((asset) => (
                              <Chip key={asset} label={asset} size="small" />
                            ))}
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            Not: {entry.dispatchNote || "-"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Etiket ID: {entry.labelIdentifier} · Kayıt: {new Date(entry.createdAt).toLocaleString("tr-TR")}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Yazdırılma: {entry.printedAt ? new Date(entry.printedAt).toLocaleString("tr-TR") : "Henüz yazdırılmadı"}
                          </Typography>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          justifyContent={{ xs: "flex-start", sm: "flex-end" }}
                        >
                          <Button
                            variant="outlined"
                            color="primary"
                            startIcon={<EditIcon />}
                            onClick={() => handleEditEntry(entry)}
                          >
                            Düzenle
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={() => handleDeleteEntry(entry)}
                          >
                            Sil
                          </Button>
                          <Button
                            variant="contained"
                            color="error"
                            startIcon={<PrintIcon />}
                            onClick={() => handlePrintEntry(entry)}
                          >
                            Yazdır
                          </Button>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
