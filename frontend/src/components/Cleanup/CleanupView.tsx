import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  MenuItem,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import { useQuery } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { useAuth } from "../../context/AuthContext";

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

interface CleanupResponse {
  status: string;
  cleared_expenses: number;
  cleared_plans: number;
}

export default function CleanupView() {
  const client = useAuthorizedClient();
  const { user } = useAuth();

  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [budgetItemId, setBudgetItemId] = useState<number | null>(null);
  const [clearImportedOnly, setClearImportedOnly] = useState(false);
  const [resetPlans, setResetPlans] = useState(false);
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
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Veri Temizleme Araçları
        </Typography>
        <Typography variant="body1" color="text.secondary">
          İçe aktarılan verileri temizleyin veya seçili plan/harcamaları sıfırlayın. İşlemler geri alınamaz!
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            {!isAdmin && (
              <Alert severity="warning">
                Temizleme işlemleri yalnızca yönetici rolüne sahip kullanıcılar tarafından yapılabilir.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {result && (
              <Alert severity="success">
                {result.status === "ok" ? "Temizlik tamamlandı." : result.status} Silinen harcama: {result.cleared_expenses} — Silinen plan: {result.cleared_plans}
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
                      {item.code} — {item.name}
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
        </CardContent>
      </Card>
    </Stack>
  );
}
