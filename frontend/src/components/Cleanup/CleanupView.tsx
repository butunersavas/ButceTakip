import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import CleaningServicesIcon from "@mui/icons-material/CleaningServicesOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel } from "../../utils/budgetLabel";

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
  cleared_budget_items: number;
  reindexed_budget_items: number;
}

export default function CleanupView() {
  return (
    <Box id="temizleme-araclari" data-section="temizleme-araclari">
      <CleaningToolsSection />
    </Box>
  );
}

function CleaningToolsSection() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isAdmin = !!user?.is_admin;

  const [scenarioId, setScenarioId] = useState<number | "">("");
  const [budgetItemId, setBudgetItemId] = useState<number | "">("");
  const [clearImportedOnly, setClearImportedOnly] = useState(false);
  const [resetPlans, setResetPlans] = useState(false);
  const [result, setResult] = useState<CleanupResponse | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"cleanup" | "delete-scenario">("cleanup");

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

  useEffect(() => {
    if (scenarios && scenarios.length > 0) {
      setScenarioId((previous) => {
        if (previous && scenarios.some((scenario) => scenario.id === previous)) {
          return previous;
        }
        return scenarios[0]?.id ?? "";
      });
    } else {
      setScenarioId("");
    }
  }, [scenarios]);

  useEffect(() => {
    if (budgetItems && budgetItems.length > 0) {
      setBudgetItemId((previous) => {
        if (previous && budgetItems.some((item) => item.id === previous)) {
          return previous;
        }
        return budgetItems[0]?.id ?? "";
      });
    } else {
      setBudgetItemId("");
    }
  }, [budgetItems]);

  const selectedScenarioName = useMemo(() => {
    if (!scenarioId || !scenarios) return "";
    const scenario = scenarios.find((item) => item.id === scenarioId);
    return scenario ? `${scenario.name} (${scenario.year})` : "";
  }, [scenarioId, scenarios]);

  const isDefaultScenario = useMemo(() => {
    if (!scenarioId || !scenarios) return false;
    const scenario = scenarios.find((item) => item.id === scenarioId);
    return scenario?.name?.trim().toLowerCase() === "temel";
  }, [scenarioId, scenarios]);

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data } = await client.post<CleanupResponse>("/io/cleanup", {
        scenario_id: scenarioId === "" ? undefined : scenarioId,
        budget_item_id: budgetItemId === "" ? undefined : budgetItemId,
        clear_imported_only: clearImportedOnly,
        reset_plans: resetPlans
      });
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setOperationMessage(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["budget-items"] });
    },
    onError: (err) => {
      console.error(err);
      setResult(null);
      setOperationMessage(null);

      if (axios.isAxiosError(err)) {
        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          err.response?.data?.message;

        if (detail) {
          setError(detail);
          return;
        }
      }

      setError(
        "Temizlik işlemi sırasında beklenmedik bir hata oluştu. Lütfen yetkilerinizi ve bağlantınızı kontrol edin."
      );
    }
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: async (scenarioToDelete: number) => {
      await client.delete(`/scenarios/${scenarioToDelete}`, {
        params: { force: true }
      });
      return scenarioToDelete;
    },
    onSuccess: (deletedId) => {
      const deletedScenarioName = scenarios?.find((item) => item.id === deletedId)?.name;
      setResult(null);
      setError(null);
      setOperationMessage(
        `${deletedScenarioName || "Senaryo"} ve ilişkili bütçe verileri veritabanından kalıcı olarak silindi.`
      );
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (err) => {
      console.error("SCENARIO DELETE FAILED", err);
      setResult(null);
      setOperationMessage(null);

      if (axios.isAxiosError(err)) {
        console.error("DELETE RESPONSE", err.response?.status, err.response?.data);

        const detail =
          (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
          (err.response?.data as { detail?: string; message?: string } | undefined)?.message;

        if (detail) {
          setError(detail);
          return;
        }

        const status = err.response?.status;
        if (status === 403) {
          setError("Bu işlem için yetkiniz yok.");
          return;
        }
        if (status === 404) {
          setError("Senaryo bulunamadı.");
          return;
        }
        if (status === 409) {
          setError("Senaryo bağlı kayıtlar nedeniyle silinemedi. force=true ile silebilirsiniz.");
          return;
        }
        if (status === 400) {
          setError("Senaryo silinirken geçersiz bir istek oluştu.");
          return;
        }
      }

      setError(
        "Senaryo silme işlemi sırasında beklenmedik bir hata oluştu. Lütfen yetkilerinizi ve bağlantınızı kontrol edin."
      );
      setResult(null);
      setOperationMessage(null);
    }
  });

  const handleCleanup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAdmin) {
      setError("Bu işlemi yalnızca admin kullanıcıları gerçekleştirebilir.");
      return;
    }

    if (actionType === "delete-scenario") {
      if (!scenarioId || typeof scenarioId !== "number") {
        setError("Silmek için bir senaryo seçmelisiniz.");
        return;
      }

      const confirmed = window.confirm(
        `${selectedScenarioName} senaryosunu ve ilgili kayıtları kalıcı olarak silmek istediğinize emin misiniz?`
      );

      if (!confirmed) return;

      deleteScenarioMutation.mutate(scenarioId);
      return;
    }

    const confirmed = window.confirm(
      `"${selectedScenarioName || "Tüm senaryolar"}" için tüm harcama kayıtlarını silmek istediğinize emin misiniz?`
    );

    if (!confirmed) return;

    cleanupMutation.mutate();
  };

  return (
    <Stack spacing={3} component="form" onSubmit={handleCleanup}>
      <Card>
        <CardContent>
          <Stack spacing={3}>
            {!isAdmin && (
              <Alert severity="warning">
                Bu işlemi yalnızca <strong>admin</strong> kullanıcıları gerçekleştirebilir.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {operationMessage && <Alert severity="success">{operationMessage}</Alert>}
            {result && (
              <Alert severity="success">
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Temizlik tamamlandı
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Harcama kayıtları: {result.cleared_expenses}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Plan kayıtları: {result.cleared_plans}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Silinen bütçe kalemleri: {result.cleared_budget_items}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Yeniden numaralandırılan bütçe kalemleri: {result.reindexed_budget_items}
                  </Typography>
                </Stack>
              </Alert>
            )}
            <FormControl component="fieldset">
              <FormLabel component="legend">İşlem</FormLabel>
              <RadioGroup
                row
                value={actionType}
                onChange={(event) => {
                  const selectedAction = event.target.value as "cleanup" | "delete-scenario";
                  setActionType(selectedAction);
                  setResult(null);
                  setOperationMessage(null);
                  setError(null);
                }}
              >
                <FormControlLabel
                  value="cleanup"
                  control={<Radio />}
                  label="Harcama temizliği (tüm harcamaları sil)"
                />
                <FormControlLabel
                  value="delete-scenario"
                  control={<Radio />}
                  label="Senaryoyu/Bütçeyi tamamen sil"
                />
              </RadioGroup>
            </FormControl>
            <TextField
              select
              label="Senaryo"
              value={scenarioId}
              onChange={(event) => {
                const value = event.target.value;
                setScenarioId(value === "" ? "" : Number(value));
              }}
              fullWidth
              disabled={!scenarios?.length}
              helperText={
                actionType === "delete-scenario"
                  ? "Silme işlemi yalnızca seçilen senaryoya uygulanır."
                  : "Temizlik işlemi sadece seçilen senaryoda uygulanır."
              }
            >
              {!scenarios?.length && <MenuItem value="">Aktif senaryo bulunamadı</MenuItem>}
              {scenarios?.map((scenario) => (
                <MenuItem key={scenario.id} value={scenario.id}>
                  {scenario.name} ({scenario.year})
                </MenuItem>
              ))}
              {actionType === "cleanup" && <MenuItem value="">Tüm senaryolar</MenuItem>}
            </TextField>
            {actionType === "delete-scenario" && isDefaultScenario && (
              <Alert severity="info">Temel senaryosu silinemez.</Alert>
            )}
            {actionType === "cleanup" ? (
              <>
                <TextField
                  select
                  label="Bütçe Kalemi"
                  value={budgetItemId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setBudgetItemId(value === "" ? "" : Number(value));
                  }}
                  fullWidth
                  disabled={!budgetItems?.length}
                  helperText="İsteğe bağlı olarak belirli bir bütçe kalemine göre filtreleyin."
                >
                  {!budgetItems?.length && <MenuItem value="">Bütçe kalemi bulunamadı</MenuItem>}
                  {budgetItems?.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {formatBudgetItemLabel(item)}
                    </MenuItem>
                  ))}
                  <MenuItem value="">Tüm bütçe kalemleri</MenuItem>
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={clearImportedOnly}
                      onChange={(event) => setClearImportedOnly(event.target.checked)}
                    />
                  }
                  label="Yalnızca içe aktarılan harcamaları temizle"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={resetPlans}
                      onChange={(event) => setResetPlans(event.target.checked)}
                    />
                  }
                  label="Plan kayıtlarını sıfırla ve bütçe kalemlerini yeniden numaralandır"
                />
              </>
            ) : (
              <>
                <Divider />
                <Typography variant="body2" color="text.secondary">
                  Bu seçenek, seçilen senaryoyu ve ona bağlı bütçe kayıtlarını veritabanından kalıcı
                  olarak siler.
                </Typography>
              </>
            )}
            <Box>
              <Button
                type="submit"
                variant="contained"
                color="error"
                startIcon={<CleaningServicesIcon />}
                disabled={
                  !isAdmin ||
                  cleanupMutation.isPending ||
                  deleteScenarioMutation.isPending ||
                  (actionType === "delete-scenario" && (scenarioId === "" || isDefaultScenario))
                }
              >
                {actionType === "delete-scenario" ? "Senaryoyu Sil" : "Temizleme İşlemini Başlat"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
