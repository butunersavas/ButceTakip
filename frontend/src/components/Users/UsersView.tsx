import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
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

type UserUpdate = {
  full_name?: string | null;
  is_admin?: boolean;
  is_active?: boolean;
  password?: string;
};

export default function UsersView() {
  const { user } = useAuth();
  const client = useAuthorizedClient();
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRead | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRead | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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

  const handleEditClick = (selectedUser: UserRead) => {
    setEditingUser(selectedUser);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload: UserUpdate = {
      full_name: editingUser.full_name,
      is_active: editingUser.is_active,
      is_admin: editingUser.is_admin
    };

    try {
      await client.put(`/users/${editingUser.id}`, payload);
      await loadUsers();
      setEditingUser(null);
      setSuccess("Kullanıcı güncellendi.");
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Kullanıcı güncellenemedi.");
      } else {
        setError("Kullanıcı güncellenemedi.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (selectedUser: UserRead) => {
    setUserToDelete(selectedUser);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await client.delete(`/users/${userToDelete.id}`);
      await loadUsers();
      setSuccess("Kullanıcı silindi.");
    } catch (err) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail || "Kullanıcı silinemedi.");
      } else {
        setError("Kullanıcı silinemedi.");
      }
    } finally {
      setSubmitting(false);
      setIsDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  };

  const columns: GridColDef[] = [
    { field: "username", headerName: "Kullanıcı Adı", flex: 1 },
    { field: "full_name", headerName: "Ad Soyad", flex: 1 },
    { field: "is_admin", headerName: "Admin", width: 120, type: "boolean" },
    { field: "is_active", headerName: "Aktif", width: 120, type: "boolean" },
    {
      field: "actions",
      headerName: "İşlemler",
      width: 140,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton size="small" onClick={() => handleEditClick(params.row as UserRead)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteClick(params.row as UserRead)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )
    }
  ];

  if (!user?.is_admin) {
    return (
      <Box>
        <Alert severity="warning">Bu sayfaya sadece admin kullanıcılar erişebilir.</Alert>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>

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
                <DataGrid
                  rows={users}
                  columns={columns}
                  autoHeight
                  disableRowSelectionOnClick
                  pageSizeOptions={[10, 25, 50]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                />
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

      <Dialog open={!!editingUser} onClose={() => setEditingUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="Kullanıcı Adı"
            value={editingUser?.username ?? ""}
            fullWidth
            margin="normal"
            disabled
          />
          <TextField
            label="Ad Soyad"
            value={editingUser?.full_name ?? ""}
            onChange={(e) =>
              setEditingUser((prev) => (prev ? { ...prev, full_name: e.target.value } : prev))
            }
            fullWidth
            margin="normal"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={!!editingUser?.is_admin}
                onChange={(e) =>
                  setEditingUser((prev) => (prev ? { ...prev, is_admin: e.target.checked } : prev))
                }
              />
            }
            label="Admin yetkisi"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={!!editingUser?.is_active}
                onChange={(e) =>
                  setEditingUser((prev) => (prev ? { ...prev, is_active: e.target.checked } : prev))
                }
              />
            }
            label="Aktif"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingUser(null)}>İptal</Button>
          <Button variant="contained" onClick={handleUpdateUser} disabled={submitting}>
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setUserToDelete(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Kullanıcıyı sil</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            {userToDelete
              ? `"${userToDelete.username}" kullanıcısını silmek istediğinize emin misiniz?`
              : "Bu kullanıcıyı silmek istediğinize emin misiniz?"}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteConfirmOpen(false)}>İptal</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete} disabled={submitting}>
            Sil
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
