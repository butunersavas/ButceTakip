import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import GroupsIcon from "@mui/icons-material/Groups";
import axios from "axios";

import { useAuth } from "../../context/AuthContext";
import useAuthorizedClient from "../../hooks/useAuthorizedClient";

type UserRead = {
  id: number;
  username: string;
  full_name?: string | null;
  is_admin: boolean;
  is_active: boolean;
};

type UserCreate = {
  username: string;
  full_name?: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
};

export default function UsersView() {
  const { user } = useAuth();
  const client = useAuthorizedClient();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<UserCreate>({
    username: "",
    full_name: "",
    password: "",
    is_admin: false,
    is_active: true
  });

  const loadUsers = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const { data } = await client.get<UserRead[]>("/users");
      setUsers(data);
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Kullanıcı listesi alınırken bir hata oluştu.");
      } else {
        setError("Kullanıcı listesi alınırken bir hata oluştu.");
      }
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!user?.is_admin) {
      setLoading(false);
      setError("Bu sayfaya sadece admin kullanıcılar erişebilir.");
      return;
    }

    loadUsers();
  }, [loadUsers, user?.is_admin]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.username.trim() || !form.password.trim()) {
      setError("Kullanıcı adı ve şifre zorunludur.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: UserCreate = {
        ...form,
        username: form.username.trim().toLowerCase(),
        full_name: form.full_name?.trim() || ""
      };
      await client.post<UserRead>("/users", payload);
      setSuccess("Kullanıcı başarıyla oluşturuldu.");
      setForm({ username: "", full_name: "", password: "", is_admin: false, is_active: true });
      await loadUsers();
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Kullanıcı oluşturulamadı.");
      } else {
        setError("Kullanıcı oluşturulamadı.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <Box>
        <Alert severity="warning">Bu sayfaya sadece admin kullanıcılar erişebilir.</Alert>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Box display="flex" alignItems="center" gap={2}>
        <GroupsIcon color="primary" fontSize="large" />
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Kullanıcı Yönetimi
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Mevcut kullanıcıları görüntüleyin ve yeni kullanıcılar ekleyin.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Kullanıcılar
              </Typography>
              {loading ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress />
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Kullanıcı Adı</TableCell>
                      <TableCell>Ad Soyad</TableCell>
                      <TableCell>Admin</TableCell>
                      <TableCell>Durum</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.username}</TableCell>
                        <TableCell>{item.full_name || "-"}</TableCell>
                        <TableCell>{item.is_admin ? "Evet" : "Hayır"}</TableCell>
                        <TableCell>{item.is_active ? "Aktif" : "Pasif"}</TableCell>
                      </TableRow>
                    ))}
                    {!users.length && (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          Henüz kullanıcı bulunmuyor.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card component="form" onSubmit={handleSubmit}>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <PersonAddIcon color="primary" />
                  <Typography variant="h6" fontWeight={700}>
                    Yeni Kullanıcı Ekle
                  </Typography>
                </Box>
                <TextField
                  label="Kullanıcı Adı"
                  name="username"
                  value={form.username}
                  onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                  required
                  helperText="Küçük harf ve boşluksuz bir kullanıcı adı girin."
                />
                <TextField
                  label="Ad Soyad"
                  name="full_name"
                  value={form.full_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                />
                <TextField
                  label="Şifre"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                  helperText="En az 8 karakter"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.is_admin}
                      onChange={(event) => setForm((prev) => ({ ...prev, is_admin: event.target.checked }))}
                    />
                  }
                  label="Admin"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.is_active}
                      onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                    />
                  }
                  label="Aktif"
                />
                <Box>
                  <Button type="submit" variant="contained" startIcon={<PersonAddIcon />} disabled={submitting}>
                    {submitting ? "Ekleniyor..." : "Kullanıcı Oluştur"}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
