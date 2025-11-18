import { useState } from "react";
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

  const nowLabel = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date());

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
