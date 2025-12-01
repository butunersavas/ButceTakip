import { FormEvent, useState } from "react";
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from "@mui/material";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

export default function CleanupView() {
  return (
    <Box id="temizleme-araclari" data-section="temizleme-araclari">
      <CleaningToolsSection />
    </Box>
  );
}

function CleaningToolsSection() {
  const scenarios = ["2026-Temel", "2025-Temel", "2024-Yedek", "Arşiv-1", "Test Senaryosu"];
  const [selectedScenario, setSelectedScenario] = useState<string>(scenarios[0]);
  const [cleanupStatus, setCleanupStatus] = useState<{ type: "success" | "info" | "error"; message: string } | null>(
    null
  );

  const handleCleanup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedScenario) {
      setCleanupStatus({ type: "error", message: "Lütfen silinecek bir senaryo seçin." });
      return;
    }

    setCleanupStatus({ type: "success", message: `"${selectedScenario}" senaryosu silindi.` });
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
              onChange={(event) => setSelectedScenario(event.target.value)}
              fullWidth
            >
              {scenarios.map((scenario) => (
                <MenuItem key={scenario} value={scenario}>
                  {scenario}
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
