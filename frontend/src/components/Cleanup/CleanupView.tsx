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
        <CardContent>
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
        </CardContent>
      </Card>
    </Stack>
  );
}
