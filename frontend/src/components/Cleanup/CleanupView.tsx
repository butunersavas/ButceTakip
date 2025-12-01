import { FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from "@mui/material";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";

interface Scenario {
  id: number;
  name: string;
  year: number;
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

  const [selectedScenario, setSelectedScenario] = useState<number | "">("");
  const [cleanupStatus, setCleanupStatus] = useState<{ type: "success" | "info" | "error"; message: string } | null>(
    null
  );

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await client.get<Scenario[]>("/scenarios");
      return data;
    }
  });

  useEffect(() => {
    if (scenarios && scenarios.length > 0) {
      setSelectedScenario((previous) => {
        if (previous && scenarios.some((scenario) => scenario.id === previous)) {
          return previous;
        }
        return scenarios[0]?.id ?? "";
      });
    } else {
      setSelectedScenario("");
    }
  }, [scenarios]);

  const selectedScenarioName = useMemo(() => {
    if (!selectedScenario || !scenarios) return "";
    const scenario = scenarios.find((item) => item.id === selectedScenario);
    return scenario ? `${scenario.name} (${scenario.year})` : "";
  }, [scenarios, selectedScenario]);

  const deleteScenario = useMutation({
    mutationFn: async (scenarioId: number) => {
      await client.delete(`/scenarios/${scenarioId}`);
    },
    onSuccess: (_, scenarioId) => {
      setCleanupStatus({ type: "success", message: `"${selectedScenarioName}" senaryosu silindi.` });
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });

      setSelectedScenario((current) => {
        if (current !== scenarioId) return current;
        const remaining = scenarios?.filter((item) => item.id !== scenarioId) ?? [];
        return remaining[0]?.id ?? "";
      });
    },
    onError: (error: unknown) => {
      console.error(error);
      setCleanupStatus({ type: "error", message: "Senaryo silinirken bir hata oluştu." });
    }
  });

  const handleCleanup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedScenario) {
      setCleanupStatus({ type: "error", message: "Lütfen silinecek bir senaryo seçin." });
      return;
    }

    deleteScenario.mutate(selectedScenario as number);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={700}>
          Temizleme Araçları
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sadece senaryo seçip silme işlemini buradan yapabilirsiniz.
        </Typography>
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={3} component="form" onSubmit={handleCleanup}>
            <TextField
              select
              label="Silinecek senaryo"
              value={selectedScenario}
              onChange={(event) => setSelectedScenario(event.target.value as number)}
              fullWidth
              disabled={!scenarios?.length}
            >
              {!scenarios?.length && <MenuItem value="">Aktif senaryo bulunamadı</MenuItem>}
              {scenarios?.map((scenario) => (
                <MenuItem key={scenario.id} value={scenario.id}>
                  {scenario.name} ({scenario.year})
                </MenuItem>
              ))}
            </TextField>
            {cleanupStatus && <Alert severity={cleanupStatus.type}>{cleanupStatus.message}</Alert>}
            <Box>
              <Button
                type="submit"
                variant="contained"
                color="error"
                startIcon={<DeleteForeverIcon />}
                disabled={deleteScenario.isPending || !scenarios?.length}
              >
                Senaryoyu Sil
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
