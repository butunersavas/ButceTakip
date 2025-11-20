import { FormEvent, useState } from "react";
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

export default function CleanupView() {
  return (
    <Box id="temizleme-araclari" data-section="temizleme-araclari">
      <CleaningToolsSection />
    </Box>
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
