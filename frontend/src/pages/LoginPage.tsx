import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await login(email, password);
  };

  return (
    <Container maxWidth="sm" sx={{ display: "flex", minHeight: "100vh", alignItems: "center" }}>
      <Card sx={{ width: "100%", p: { xs: 2, sm: 4 } }}>
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                Bütçe Yönetim Platformu
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Kurumsal bütçe planlama, harcama yönetimi ve raporlama panelinize giriş yapın.
              </Typography>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <form onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                <TextField
                  label="E-posta"
                  type="email"
                  value={email}
                  required
                  onChange={(event) => setEmail(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Şifre"
                  type="password"
                  value={password}
                  required
                  onChange={(event) => setPassword(event.target.value)}
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ borderRadius: 3, py: 1.5 }}
                >
                  {loading ? <CircularProgress color="inherit" size={24} /> : "Giriş Yap"}
                </Button>
              </Stack>
            </form>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Henüz hesabınız yoksa yöneticinizden kullanıcı oluşturmasını isteyin.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
