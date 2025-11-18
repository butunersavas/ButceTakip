import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
  Switch,
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
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { useQuery } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
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

interface CleanupResponse {
  status: string;
  cleared_expenses: number;
  cleared_plans: number;
  cleared_budget_items: number;
  reindexed_budget_items: number;
}

interface DispatchRecord {
  id: string;
  product: string;
  asset: string;
  region: string;
  quantity: number;
  createdAt: string;
  status: string;
}

interface CleanupViewProps {
  defaultTab?: "tools" | "daily";
}

export default function CleanupView({ defaultTab = "tools" }: CleanupViewProps) {
  const client = useAuthorizedClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = usePersistentState<string>("cleanup:activeTab", defaultTab);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("cleanup:scenarioId", null);
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("cleanup:budgetItemId", null);
  const [clearImportedOnly, setClearImportedOnly] = usePersistentState<boolean>("cleanup:clearImported", false);
  const [resetPlans, setResetPlans] = usePersistentState<boolean>("cleanup:resetPlans", false);
  const [result, setResult] = useState<CleanupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleCleanup = async () => {
    const confirmed = window.confirm(
      "Seçili verileri temizlemek istediğinize emin misiniz? Bu işlem geri alınamaz."
    );
    if (!confirmed) {
      return;
    }
    try {
      const { data } = await client.post<CleanupResponse>("/io/cleanup", {
        scenario_id: scenarioId ?? undefined,
        budget_item_id: budgetItemId ?? undefined,
        clear_imported_only: clearImportedOnly,
        reset_plans: resetPlans
      });
      setResult(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Temizlik işlemi sırasında hata oluştu. Yalnızca yöneticiler bu işlemi yapabilir.");
      setResult(null);
    }
  };

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (defaultTab === "daily") {
      setActiveTab("daily");
    }
  }, [defaultTab, setActiveTab]);

  return (
    <Stack spacing={4}>
      <Card>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ px: 2 }}
        >
          <Tab
            label="Temizleme Araçları"
            value="tools"
            icon={<CleaningServicesIcon fontSize="small" />}
            iconPosition="start"
          />
          <Tab
            label="Günlük Çıkış"
            value="daily"
            icon={<Inventory2OutlinedIcon fontSize="small" />}
            iconPosition="start"
          />
        </Tabs>
        <Divider />
        <CardContent>
          {activeTab === "tools" ? (
            <Stack spacing={3}>
              {!isAdmin && (
                <Alert severity="warning">
                  Temizleme işlemleri yalnızca yönetici rolüne sahip kullanıcılar tarafından yapılabilir.
                </Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              {result && (
                <Alert severity="success" sx={{ lineHeight: 1.7 }}>
                  <Typography fontWeight={600} component="span">
                    {result.status === "ok" ? "Temizlik tamamlandı." : result.status}
                  </Typography>
                  <br />
                  <Typography variant="body2" component="span">
                    Silinen harcama: <strong>{result.cleared_expenses}</strong> — Silinen plan: <strong>{result.cleared_plans}</strong>
                  </Typography>
                  <br />
                  <Typography variant="body2" component="span">
                    Silinen bütçe kalemi: <strong>{result.cleared_budget_items}</strong> — Yeniden kodlanan bütçe kalemi: <strong>{result.reindexed_budget_items}</strong>
                  </Typography>
                </Alert>
              )}
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12} md={4}>
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
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={clearImportedOnly}
                        onChange={(event) => setClearImportedOnly(event.target.checked)}
                      />
                    }
                    label="Yalnızca içe aktarılan verileri temizle"
                  />
                  <FormControlLabel
                    control={
                      <Switch checked={resetPlans} onChange={(event) => setResetPlans(event.target.checked)} />
                    }
                    label="Plan verilerini de sıfırla"
                  />
                </Grid>
              </Grid>
              <Box>
                <Button
                  variant="contained"
                  startIcon={<CleaningServicesIcon />}
                  onClick={handleCleanup}
                  disabled={!isAdmin}
                  color="error"
                >
                  Temizlik İşlemini Başlat
                </Button>
              </Box>
            </Stack>
          ) : (
            <DailyDispatchTab />
          )}
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
  const [printedDispatchIds, setPrintedDispatchIds] = useState<string[]>([]);

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
        { label: "Bölge", value: selectedDispatch.region },
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
    setPrintMessage(`${dispatchId} numaralı çıkışın barkod içeriği güncellendi.`);
    setPrintedDispatchIds((prev) => (prev.includes(dispatchId) ? prev : [...prev, dispatchId]));
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
                    {dispatches.map((dispatch) => {
                      const printed = printedDispatchIds.includes(dispatch.id);
                      return (
                        <ListItem
                          key={dispatch.id}
                          selected={dispatch.id === selectedDispatchId}
                          secondaryAction={
                            <Button
                              size="medium"
                              variant="contained"
                              color="primary"
                              onClick={() => handlePrint(dispatch.id)}
                              sx={{ fontWeight: 600, px: 2.5 }}
                            >
                              Yazdır
                            </Button>
                          }
                          sx={{
                            cursor: "pointer",
                            bgcolor: printed ? "action.selected" : undefined,
                            transition: "background-color 0.2s ease",
                            borderRadius: 2,
                            mb: 1,
                            "&.Mui-selected": {
                              bgcolor: "rgba(25, 118, 210, 0.2)",
                              "&:hover": {
                                bgcolor: "rgba(25, 118, 210, 0.28)"
                              }
                            }
                          }}
                          onClick={() => setSelectedDispatchId(dispatch.id)}
                        >
                          <ListItemIcon sx={{ color: printed ? "primary.main" : "text.secondary" }}>
                            <QrCode2OutlinedIcon />
                          </ListItemIcon>
                          <ListItemText
                            primary={`${dispatch.id} · ${dispatch.product}`}
                            secondary={`Demirbaş: ${dispatch.asset} • ${dispatch.region}`}
                            primaryTypographyProps={{ fontWeight: printed ? 700 : 500 }}
                          />
                        </ListItem>
                      );
                    })}
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
                            sx={{
                              border: "2px solid",
                              borderColor: "grey.800",
                              borderRadius: 2,
                              p: 3,
                              width: 1,
                              maxWidth: 420,
                              aspectRatio: "1",
                              bgcolor: "background.paper",
                              boxShadow: (theme) => `inset 0 0 0 1px ${theme.palette.grey[300]}`,
                              fontFamily: "'IBM Plex Sans', 'Roboto', sans-serif"
                            }}
                          >
                            <Stack spacing={1.5} sx={{ height: "100%" }}>
                              <Typography variant="caption" sx={{ letterSpacing: 1.5 }} color="text.secondary">
                                GÖNDEREN · TEKNİK DESTEK DEPARTMANI
                              </Typography>
                              <Typography
                                variant="subtitle1"
                                fontWeight={700}
                                color="primary"
                                sx={{ letterSpacing: 1.2 }}
                              >
                                ALICI · {selectedDispatch.region}
                              </Typography>
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
