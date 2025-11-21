import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import CleaningServicesIcon from "@mui/icons-material/CleaningServicesOutlined";
import { useQuery } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";

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

export default function CleanupView() {
  return (
    <Box id="temizleme-araclari" data-section="temizleme-araclari">
      <CleaningToolsSection />
    </Box>
  );
}

function CleaningToolsSection() {
  const client = useAuthorizedClient();
  const cleanupOptions = [
    { value: "usage-logs", label: "İşlem Kayıtları" },
    { value: "orphan-data", label: "Yetim Kayıtlar" },
    { value: "archived-records", label: "Arşivlenmiş Veriler" }
  ];

  const [cleanupType, setCleanupType] = useState(cleanupOptions[0].value);
  const [keyword, setKeyword] = useState("");
  const [onlyPast, setOnlyPast] = useState(true);
  const [includePlans, setIncludePlans] = useState(false);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<number | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [deleteSelectedRecord, setDeleteSelectedRecord] = useState(false);
  const [deleteSelectedScenario, setDeleteSelectedScenario] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<
    { type: "success" | "info" | "error"; message: string } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

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

  const selectedOption = cleanupOptions.find((option) => option.value === cleanupType);

  const scenarioOptions = useMemo(() => {
    return scenarios?.map((scenario) => ({
      value: scenario.id,
      label: `${scenario.name} (${scenario.year})`
    }));
  }, [scenarios]);

  const budgetOptions = useMemo(() => {
    return budgetItems?.map((item) => ({
      value: item.id,
      label: `${item.code} - ${item.name}`
    }));
  }, [budgetItems]);

  useEffect(() => {
    setDeleteSelectedScenario(Boolean(selectedScenarioId));
  }, [selectedScenarioId]);

  useEffect(() => {
    setDeleteSelectedRecord(Boolean(selectedBudgetItemId));
  }, [selectedBudgetItemId]);

  useEffect(() => {
    if (!scenarios || !scenarios.length) return;
    setSelectedScenarioId((previous) => previous ?? scenarios[0].id);
  }, [scenarios]);

  const handleCleanup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetLabel = selectedOption?.label ?? "Veri";

    if (deleteSelectedScenario && !selectedScenarioId) {
      setCleanupStatus({
        type: "error",
        message: "Temizlemek için bir senaryo seçmelisiniz."
      });
      return;
    }

    if (deleteSelectedRecord && !selectedBudgetItemId) {
      setCleanupStatus({
        type: "error",
        message: "Silmek için bir bütçe kaydı seçmelisiniz."
      });
      return;
    }

    try {
      setSubmitting(true);
      setCleanupStatus({
        type: "info",
        message: `${targetLabel} için temizleme isteği gönderiliyor...`
      });

      const { data } = await client.post<{
        status: string;
        cleared_expenses: number;
        cleared_plans: number;
        cleared_budget_items: number;
        reindexed_budget_items: number;
      }>("/io/cleanup", {
        budget_item_id: deleteSelectedRecord ? selectedBudgetItemId : null,
        scenario_id: deleteSelectedScenario ? selectedScenarioId : null,
        clear_imported_only: cleanupType === "archived-records",
        reset_plans: includePlans
      });

      setCleanupStatus({
        type: "success",
        message: `${targetLabel} için temizlik tamamlandı. Silinen harcama: ${
          data.cleared_expenses
        }, silinen plan kaydı: ${data.cleared_plans}, silinen bütçe kaydı: ${
          data.cleared_budget_items
        }, yeniden sıralanan kod: ${data.reindexed_budget_items}.`
      });
    } catch (error) {
      console.error(error);
      setCleanupStatus({
        type: "error",
        message:
          "Temizleme işlemi başarısız oldu. Lütfen seçimlerinizi ve bağlantıyı kontrol edin."
      });
    } finally {
      setSubmitting(false);
    }
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
                <TextField
                  select
                  label="Seçili bütçe kaydı"
                  value={selectedBudgetItemId ?? ""}
                  onChange={(event) =>
                    setSelectedBudgetItemId(
                      event.target.value === "" ? null : Number(event.target.value)
                    )
                  }
                  placeholder="Bütçe kaydı seçin"
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                >
                  <MenuItem value="">
                    <em>Seçilmedi</em>
                  </MenuItem>
                  {budgetOptions?.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  label="Seçili senaryo"
                  value={selectedScenarioId ?? ""}
                  onChange={(event) =>
                    setSelectedScenarioId(
                      event.target.value === "" ? null : Number(event.target.value)
                    )
                  }
                  placeholder="Senaryo seçin"
                  fullWidth
                  SelectProps={{ displayEmpty: true }}
                >
                  <MenuItem value="">
                    <em>Seçilmedi</em>
                  </MenuItem>
                  {scenarioOptions?.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
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
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={deleteSelectedRecord}
                        onChange={(event) => setDeleteSelectedRecord(event.target.checked)}
                      />
                    }
                    label="Seçili kaydı sil"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={deleteSelectedScenario}
                        onChange={(event) => setDeleteSelectedScenario(event.target.checked)}
                      />
                    }
                    label="Seçili senaryoyu sil"
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
                disabled={submitting}
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
