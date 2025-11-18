import { FormEvent, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
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
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import QrCode2OutlinedIcon from "@mui/icons-material/QrCode2Outlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import TabOutlinedIcon from "@mui/icons-material/TabOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from "recharts";

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
  recipient: string;
  status: string;
}

export default function CleanupView() {
  const client = useAuthorizedClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = usePersistentState<string>("cleanup:activeTab", "tools");
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
    recipient: string;
    note: string;
    date: string;
  };

  const dispatches = useMemo<DispatchRecord[]>(
    () => [
      {
        id: "SD-2412",
        product: "LAPTOP",
        asset: "DMR-4821",
        region: "İSTANBUL",
        quantity: 3,
        createdAt: "2024-06-01T10:32",
        recipient: "İstanbul Bölge",
        status: "Etiket Hazır"
      },
      {
        id: "SD-2413",
        product: "MODEM",
        asset: "DMR-3120",
        region: "ANKARA",
        quantity: 2,
        createdAt: "2024-06-01T14:05",
        recipient: "Ankara Teknik",
        status: "Bekliyor"
      },
      {
        id: "SD-2414",
        product: "SUNUCU",
        asset: "DMR-1208",
        region: "İZMİR",
        quantity: 1,
        createdAt: "2024-06-02T09:15",
        recipient: "Ege Data Center",
        status: "Teslim Edildi"
      },
      {
        id: "SD-2415",
        product: "ROUTER",
        asset: "DMR-8897",
        region: "BURSA",
        quantity: 4,
        createdAt: "2024-06-02T11:42",
        recipient: "Bursa Bölge",
        status: "Etiket Hazır"
      }
    ],
    []
  );

  const nowLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "full",
        timeStyle: "short"
      }).format(new Date()),
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
    recipient: "",
    note: "",
    date: new Date().toISOString().slice(0, 16)
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
  };

  const goals = [
    "Teknik Destek çıkışlarını bölge bazında kaydetmek ve ServiceDesk ID ile eşleştirmek.",
    "Seçilen kayıtlar için gönderen/alıcı bilgilerinin yer aldığı etiket (barkod) çıktıları üretmek.",
    "Kayıt arama, filtreleme, silme ve anlık tarih-saat bilgisi ile operasyonel akışı sadeleştirmek."
  ];

  const featureDetails = [
    {
      title: "Sekmeli yapı",
      description:
        '"Kayıt / Arama / Yazdırma" sekmeleri openTab fonksiyonu ile hangi ekran aktifse ilgili verileri yüklüyor.',
      icon: <TabOutlinedIcon color="primary" />
    },
    {
      title: "Kayıt formu",
      description:
        "Ürün, Demirbaş ve Bölge alanları otomatik büyük harfe çevrilir, tarih alanı set edilir ve /api/kayit ile kaydedilir.",
      icon: <TaskAltOutlinedIcon color="success" />
    },
    {
      title: "Arama & filtreleme",
      description:
        "GET /api/kayitlar sonucunu istemci tarafında ürün, demirbaş, bölge ve tarih filtreleriyle daraltabilirsiniz.",
      icon: <SearchOutlinedIcon color="action" />
    },
    {
      title: "Yazdırma akışı",
      description:
        "barkodYazdir(id) fonksiyonu sorumlu bilgilerini eşleyip demirbaş listesini etiket HTML'i içinde yazdırır.",
      icon: <PrintOutlinedIcon color="secondary" />
    },
    {
      title: "Bildirim sistemi",
      description:
        "bildirimGoster bileşeni başarılı veya hatalı işlemleri üst bildirimde göstererek kullanıcıyı uyarır.",
      icon: <TaskAltOutlinedIcon color="info" />
    },
    {
      title: "Silme güvenliği",
      description:
        "confirm diyaloğu ile onay alındıktan sonra DELETE /api/kayit/{id} çağrısı yapılır ve liste yeniden filtrelenir.",
      icon: <DeleteOutlineOutlinedIcon color="error" />
    }
  ];

  const quickStats = [
    {
      label: "Kayıtlı Çıkış",
      value: "128",
      icon: <LocalShippingOutlinedIcon />,
      color: "primary"
    },
    {
      label: "Etiket Hazır",
      value: "64",
      icon: <QrCode2OutlinedIcon />,
      color: "secondary"
    },
    {
      label: "Günlük Operasyon",
      value: "32",
      icon: <SearchOutlinedIcon />,
      color: "warning"
    }
  ] as const;

  const regionDispatchData = [
    { region: "İstanbul", count: 42 },
    { region: "Ankara", count: 28 },
    { region: "İzmir", count: 22 },
    { region: "Bursa", count: 18 }
  ];

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography variant="h5" fontWeight={700}>
          Günlük Çıkış Operasyon Özeti
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Temizleme araçlarının yanına eklenen bu alan, günlük teknik destek çıkışlarını tek ekrandan yönetmeniz için
          bilgi kartları ve görsel özetler sunar.
        </Typography>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip label="Sitenin Amacı" color="primary" variant="outlined" />
                  <Chip label="index - Copy" size="small" />
                </Stack>
                <Typography variant="body1">
                  Günlük çıkış ekranının amacı aşağıdaki operasyonları tek yerden yönetmek:
                </Typography>
                <List dense>
                  {goals.map((goal) => (
                    <ListItem key={goal} disableGutters>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <TaskAltOutlinedIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={goal} />
                    </ListItem>
                  ))}
                </List>
                <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
                  <AccessTimeOutlinedIcon fontSize="small" />
                  <Typography variant="body2">Anlık durum: {nowLabel}</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Operasyon Göstergeleri
                </Typography>
                <Grid container spacing={2}>
                  {quickStats.map((stat) => (
                    <Grid item xs={12} sm={4} key={stat.label}>
                      <Stack spacing={1} alignItems="center">
                        <Avatar sx={{ bgcolor: `${stat.color}.main`, width: 48, height: 48 }}>
                          {stat.icon}
                        </Avatar>
                        <Typography variant="h6" fontWeight={700}>
                          {stat.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" textAlign="center">
                          {stat.label}
                        </Typography>
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionDispatchData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="region" />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip
                        formatter={(value: number) => `${value} çıkış`}
                        labelFormatter={(label) => `${label} bölgesi`}
                      />
                      <Bar dataKey="count" name="Çıkış Adedi" fill="#1976d2" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
                    label="Bölge"
                    value={recordForm.region}
                    onChange={(event) => handleRecordChange("region", event.target.value)}
                    fullWidth
                    required
                  />
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
                    label="Gönderilen Bölüm"
                    value={recordForm.recipient}
                    onChange={(event) => handleRecordChange("recipient", event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Çıkış Tarihi"
                    type="datetime-local"
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
                          <Button size="small" onClick={() => handlePrint(dispatch.id)}>
                            Yazdır
                          </Button>
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
                            sx={{
                              border: "1px dashed",
                              borderColor: "divider",
                              borderRadius: 2,
                              p: 3,
                              textTransform: "uppercase",
                              fontFamily: "'Fira Code', monospace"
                            }}
                          >
                            <Typography variant="overline">Gönderen: Teknik Destek Merkezi</Typography>
                            <Typography variant="h4" fontWeight={700}>
                              {selectedDispatch.asset}
                            </Typography>
                            <Typography variant="subtitle1">ServiceDesk: {selectedDispatch.id}</Typography>
                            <Typography variant="body2">Ürün: {selectedDispatch.product}</Typography>
                            <Typography variant="body2">Bölge: {selectedDispatch.region}</Typography>
                            <Typography variant="body2">Alıcı: {selectedDispatch.recipient}</Typography>
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

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>
              Yapılanlar / Özellikler
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Günlük çıkış modülü kayıt, arama ve yazdırma sekmelerinde aşağıdaki işlevleri içerir:
            </Typography>
            <List>
              {featureDetails.map((feature) => (
                <ListItem key={feature.title} alignItems="flex-start">
                  <ListItemIcon sx={{ minWidth: 42 }}>{feature.icon}</ListItemIcon>
                  <ListItemText primary={feature.title} secondary={feature.description} />
                </ListItem>
              ))}
            </List>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
