import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import CleaningServicesIcon from "@mui/icons-material/CleaningServicesOutlined";
import { useLocation } from "react-router-dom";

interface DispatchRecord {
  id: string;
  product: string;
  asset: string;
  region: string;
  quantity: number;
  createdAt: string;
  status: string;
}

export default function CleanupView() {
  const location = useLocation();
  const cleanupSectionRef = useRef<HTMLDivElement | null>(null);
  const dailySectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (location.hash === "#gunluk-cikis" && dailySectionRef.current) {
      dailySectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!location.hash && cleanupSectionRef.current) {
      cleanupSectionRef.current.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [location.hash]);

  return (
    <Stack spacing={6}>
      <Box
        id="temizleme-araclari"
        data-section="temizleme-araclari"
        ref={cleanupSectionRef}
      >
        <CleaningToolsSection />
      </Box>
      <Divider sx={{ my: { xs: 1, md: 2 } }} />
      <Box id="gunluk-cikis" data-section="gunluk-cikis" ref={dailySectionRef}>
        <DailyDispatchTab />
      </Box>
    </Stack>
  );
}

function CleaningToolsSection() {
  const cleanupOptions = [
    { value: "usage-logs", label: "İşlem Kayıtları" },
    { value: "orphan-data", label: "Yetim Kayıtlar" },
    { value: "archived-records", label: "Arşivlenmiş Veriler" }
  ];

  const [cleanupType, setCleanupType] = useState(cleanupOptions[0].value);
  const [keyword, setKeyword] = useState("");
  const [onlyPast, setOnlyPast] = useState(true);
  const [includePlans, setIncludePlans] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<
    { type: "success" | "info" | "error"; message: string } | null
  >(null);

  const selectedOption = cleanupOptions.find((option) => option.value === cleanupType);

  const handleCleanup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetLabel = selectedOption?.label ?? "Veri";
    setCleanupStatus({
      type: "info",
      message: `${targetLabel} için temizleme isteği oluşturuldu. Filtre: "${
        keyword || "*"
      }". Geçmiş tarihler: ${onlyPast ? "Evet" : "Hayır"}. Plan verileri: ${
        includePlans ? "Silinecek" : "Korunacak"
      }.`
    });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={700}>
          Temizleme Araçları
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sorgulama ve toplu temizleme işlemini bu alandan yönetebilirsiniz.
        </Typography>
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={3} component="form" onSubmit={handleCleanup}>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  label="İşlem"
                  value={cleanupType}
                  onChange={(event) => setCleanupType(event.target.value)}
                  fullWidth
                >
                  {cleanupOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Filtre kelime"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="Örn. LOG-2024"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack direction="column" spacing={1.5}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={onlyPast}
                        onChange={(event) => setOnlyPast(event.target.checked)}
                      />
                    }
                    label="Yalnızca geçmiş tarihlerdeki verileri temizle"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={includePlans}
                        onChange={(event) => setIncludePlans(event.target.checked)}
                      />
                    }
                    label="Plan verilerini de sil"
                  />
                </Stack>
              </Grid>
            </Grid>
            {cleanupStatus && <Alert severity={cleanupStatus.type}>{cleanupStatus.message}</Alert>}
            <Box>
              <Button
                type="submit"
                variant="contained"
                color="error"
                startIcon={<CleaningServicesIcon />}
              >
                Temizlik işlemini başlat
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function DailyDispatchTab() {
  type RecordFormState = {
    product: string;
    asset: string;
    region: string;
    servicedeskId: string;
    note: string;
    date: string;
  };

  const regionOptions = [
    "İSTANBUL",
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
  ] as const;

  const dispatches = useMemo<DispatchRecord[]>(
    () => [
      {
        id: "SD-2412",
        product: "LAPTOP",
        asset: "DMR-4821",
        region: "İSTANBUL",
        quantity: 3,
        createdAt: "2024-06-01T10:32",
        status: "Etiket Hazır"
      },
      {
        id: "SD-2413",
        product: "MODEM",
        asset: "DMR-3120",
        region: "ANKARA",
        quantity: 2,
        createdAt: "2024-06-01T14:05",
        status: "Bekliyor"
      },
      {
        id: "SD-2414",
        product: "SUNUCU",
        asset: "DMR-1208",
        region: "İZMİR",
        quantity: 1,
        createdAt: "2024-06-02T09:15",
        status: "Teslim Edildi"
      },
      {
        id: "SD-2415",
        product: "ROUTER",
        asset: "DMR-8897",
        region: "BURSA",
        quantity: 4,
        createdAt: "2024-06-02T11:42",
        status: "Etiket Hazır"
      }
    ],
    []
  );

  const [dispatchTab, setDispatchTab] = useState<"record" | "search" | "print">("record");
  const [recordStatus, setRecordStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [recordForm, setRecordForm] = useState<RecordFormState>(() => ({
    product: "",
    asset: "",
    region: "",
    servicedeskId: "",
    note: "",
    date: new Date().toISOString().slice(0, 10)
  }));
  const [searchFilters, setSearchFilters] = useState({
    product: "",
    asset: "",
    region: "",
    from: "",
    to: ""
  });
  const [selectedDispatchId, setSelectedDispatchId] = useState<string>(dispatches[0]?.id ?? "");
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [printSequence, setPrintSequence] = useState<Record<string, number>>({});
  const sequenceRef = useRef(0);

  const filteredDispatches = useMemo(() => {
    const upper = (value: string) => value.trim().toUpperCase();
    return dispatches.filter((dispatch) => {
      const matchesProduct = searchFilters.product
        ? dispatch.product.includes(upper(searchFilters.product))
        : true;
      const matchesAsset = searchFilters.asset
        ? dispatch.asset.includes(upper(searchFilters.asset))
        : true;
      const matchesRegion = searchFilters.region
        ? dispatch.region.includes(upper(searchFilters.region))
        : true;
      const matchesFrom = searchFilters.from ? dispatch.createdAt >= searchFilters.from : true;
      const matchesTo = searchFilters.to ? dispatch.createdAt <= searchFilters.to : true;
      return matchesProduct && matchesAsset && matchesRegion && matchesFrom && matchesTo;
    });
  }, [dispatches, searchFilters]);

  const selectedDispatch = useMemo(
    () => dispatches.find((dispatch) => dispatch.id === selectedDispatchId) ?? dispatches[0],
    [dispatches, selectedDispatchId]
  );

  const labelRows = selectedDispatch
    ? [
        { label: "ServiceDesk", value: selectedDispatch.id },
        { label: "Ürün", value: selectedDispatch.product },
        { label: "Demirbaş", value: selectedDispatch.asset },
        { label: "Alıcı Bölge", value: selectedDispatch.region },
        { label: "Adet", value: String(selectedDispatch.quantity) },
        {
          label: "Tarih",
          value: new Date(selectedDispatch.createdAt).toLocaleDateString("tr-TR")
        }
      ]
    : [];

  const handleRecordChange = (field: keyof RecordFormState, value: string) => {
    const uppercaseFields: Array<keyof RecordFormState> = ["product", "asset", "region"];
    setRecordForm((prev) => ({
      ...prev,
      [field]: uppercaseFields.includes(field) ? value.toUpperCase() : value
    }));
  };

  const handleRecordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recordForm.product || !recordForm.asset || !recordForm.region || !recordForm.servicedeskId) {
      setRecordStatus({ type: "error", message: "Ürün, Demirbaş, Bölge ve ServiceDesk ID alanları zorunludur." });
      return;
    }
    setRecordStatus({
      type: "success",
      message: `${recordForm.asset} için kayıt bilgileri /api/kayit uç noktasına gönderilmeye hazır.`
    });
  };

  const handleFilterChange = (field: keyof typeof searchFilters, value: string) => {
    setSearchFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handlePrint = (dispatchId: string) => {
    setSelectedDispatchId(dispatchId);
    sequenceRef.current += 1;
    const nextSequence = sequenceRef.current;
    setPrintSequence((current) => ({
      ...current,
      [dispatchId]: nextSequence
    }));
    setPrintMessage(`${dispatchId} numaralı barkod Zebra ZD220 yazıcısına gönderildi.`);
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  };

  return (
    <Stack spacing={4}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
      >
        <Stack spacing={0.5}>
          <Typography variant="h5" fontWeight={700}>
            Günlük Çıkış
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Kayıt oluşturma, arama ve yazdırma işlemlerini tek alandan yönetin.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Inventory2OutlinedIcon />}
          onClick={() => setDispatchTab("record")}
        >
          Günlük Çıkış
        </Button>
      </Stack>

      <Card>
        <Tabs
          value={dispatchTab}
          onChange={(_, value) => setDispatchTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ px: 2 }}
        >
          <Tab
            label="Kayıt"
            value="record"
            icon={<Inventory2OutlinedIcon fontSize="small" />}
            iconPosition="start"
          />
          <Tab
            label="Arama"
            value="search"
            icon={<SearchOutlinedIcon fontSize="small" />}
            iconPosition="start"
          />
          <Tab
            label="Yazdırma"
            value="print"
            icon={<PrintOutlinedIcon fontSize="small" />}
            iconPosition="start"
          />
        </Tabs>
        <Divider />
        <CardContent>
          {dispatchTab === "record" && (
            <Stack spacing={3} component="form" onSubmit={handleRecordSubmit}>
              <Typography variant="h6" fontWeight={700}>
                Kayıt Formu
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Ürün"
                    value={recordForm.product}
                    onChange={(event) => handleRecordChange("product", event.target.value)}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Demirbaş"
                    value={recordForm.asset}
                    onChange={(event) => handleRecordChange("asset", event.target.value)}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Bölge"
                    value={recordForm.region}
                    onChange={(event) => handleRecordChange("region", event.target.value)}
                    fullWidth
                    required
                    helperText="Tek seferde yalnızca bir bölge seçebilirsiniz"
                  >
                    {regionOptions.map((region) => (
                      <MenuItem key={region} value={region}>
                        {region}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="ServiceDesk ID"
                    value={recordForm.servicedeskId}
                    onChange={(event) => handleRecordChange("servicedeskId", event.target.value)}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Çıkış Tarihi"
                    type="date"
                    value={recordForm.date}
                    onChange={(event) => handleRecordChange("date", event.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Not"
                    value={recordForm.note}
                    onChange={(event) => handleRecordChange("note", event.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                </Grid>
              </Grid>
              {recordStatus && <Alert severity={recordStatus.type}>{recordStatus.message}</Alert>}
              <Box>
                <Button type="submit" variant="contained" startIcon={<TaskAltOutlinedIcon />}>
                  Kayıt Oluştur
                </Button>
              </Box>
            </Stack>
          )}
          {dispatchTab === "search" && (
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={700}>
                Kayıt Arama
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Ürün"
                    value={searchFilters.product}
                    onChange={(event) => handleFilterChange("product", event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Demirbaş"
                    value={searchFilters.asset}
                    onChange={(event) => handleFilterChange("asset", event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Bölge"
                    value={searchFilters.region}
                    onChange={(event) => handleFilterChange("region", event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <Button
                    variant="text"
                    sx={{ mt: { xs: 0, md: 3 } }}
                    onClick={() =>
                      setSearchFilters({ product: "", asset: "", region: "", from: "", to: "" })
                    }
                  >
                    Filtreleri Temizle
                  </Button>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Başlangıç"
                    type="datetime-local"
                    value={searchFilters.from}
                    onChange={(event) => handleFilterChange("from", event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Bitiş"
                    type="datetime-local"
                    value={searchFilters.to}
                    onChange={(event) => handleFilterChange("to", event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Grid>
              </Grid>
              <Typography variant="body2" color="text.secondary">
                {filteredDispatches.length} kayıt listeleniyor.
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ServiceDesk</TableCell>
                    <TableCell>Ürün</TableCell>
                    <TableCell>Demirbaş</TableCell>
                    <TableCell>Bölge</TableCell>
                    <TableCell align="right">Adet</TableCell>
                    <TableCell>Tarih</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDispatches.map((dispatch) => (
                    <TableRow
                      key={dispatch.id}
                      hover
                      selected={dispatch.id === selectedDispatchId}
                      sx={{ cursor: "pointer" }}
                      onClick={() => setSelectedDispatchId(dispatch.id)}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={dispatch.id} size="small" />
                        </Stack>
                      </TableCell>
                      <TableCell>{dispatch.product}</TableCell>
                      <TableCell>{dispatch.asset}</TableCell>
                      <TableCell>{dispatch.region}</TableCell>
                      <TableCell align="right">{dispatch.quantity}</TableCell>
                      <TableCell>
                        {new Date(dispatch.createdAt).toLocaleString("tr-TR", {
                          dateStyle: "short",
                          timeStyle: "short"
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          )}
          {dispatchTab === "print" && (
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={700}>
                Etiket Yazdırma
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                  <List sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                    {dispatches.map((dispatch) => (
                      <ListItem
                        key={dispatch.id}
                        selected={dispatch.id === selectedDispatchId}
                        secondaryAction={
                          <Stack direction="row" spacing={1} alignItems="center">
                            {printSequence[dispatch.id] && (
                              <Chip
                                label={`#${printSequence[dispatch.id]}`}
                                color="secondary"
                                size="small"
                                variant="outlined"
                              />
                            )}
                            <Button size="small" onClick={() => handlePrint(dispatch.id)}>
                              Barkod Yazdır
                            </Button>
                          </Stack>
                        }
                        sx={{ cursor: "pointer" }}
                        onClick={() => setSelectedDispatchId(dispatch.id)}
                      >
                        <ListItemIcon>
                          <QrCode2OutlinedIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={`${dispatch.id} · ${dispatch.product}`}
                          secondary={`Demirbaş: ${dispatch.asset} • ${dispatch.region}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={12} md={7}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle1" fontWeight={700}>
                            Barkod Önizlemesi
                          </Typography>
                          {selectedDispatch && (
                            <Chip label={selectedDispatch.status} color="primary" variant="outlined" />
                          )}
                        </Stack>
                        {selectedDispatch ? (
                          <Box
                            className="etiket etiket-print-area"
                            sx={{
                              border: "2px solid",
                              borderColor: "grey.800",
                              borderRadius: 2,
                              p: 3,
                              width: "100mm",
                              height: "100mm",
                              maxWidth: "100%",
                              mx: "auto",
                              bgcolor: "background.paper",
                              boxShadow: (theme) => `inset 0 0 0 1px ${theme.palette.grey[300]}`,
                              fontFamily: "'IBM Plex Sans', 'Roboto', sans-serif"
                            }}
                          >
                            <Stack spacing={1.5} sx={{ height: "100%" }}>
                              <Stack spacing={0.5}>
                                <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                                  GÖNDERİCİ
                                </Typography>
                                <Typography variant="subtitle1" fontWeight={700}>
                                  Teknik Destek Departmanı
                                </Typography>
                                {printSequence[selectedDispatch.id] && (
                                  <Typography variant="caption" color="text.secondary">
                                    Yazdırma Sırası: #{printSequence[selectedDispatch.id]}
                                  </Typography>
                                )}
                              </Stack>
                              <Divider />
                              <Typography
                                variant="h4"
                                fontWeight={700}
                                sx={{ letterSpacing: 1, textTransform: "uppercase" }}
                              >
                                {selectedDispatch.asset}
                              </Typography>
                              <Divider />
                              <Grid container spacing={1} columns={12} sx={{ textTransform: "none" }}>
                                {labelRows.map((row) => (
                                  <Grid item xs={12} sm={6} key={row.label}>
                                    <Typography variant="caption" color="text.secondary">
                                      {row.label}
                                    </Typography>
                                    <Typography variant="body1" fontWeight={600}>
                                      {row.value}
                                    </Typography>
                                  </Grid>
                                ))}
                              </Grid>
                            </Stack>
                          </Box>
                        ) : (
                          <Typography color="text.secondary">Bir kayıt seçin.</Typography>
                        )}
                        {printMessage && <Alert severity="info">{printMessage}</Alert>}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
