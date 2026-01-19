import {
  Alert,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import CleaningServicesOutlinedIcon from "@mui/icons-material/CleaningServicesOutlined";
import PeopleOutlineOutlinedIcon from "@mui/icons-material/PeopleOutlineOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Location, To } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useThemeMode } from "../../context/ThemeModeContext";
import brandLogo from "../../assets/brand-logo.svg";
import useAuthorizedClient from "../../hooks/useAuthorizedClient";

const drawerWidth = 260;

type NavItem = {
  label: string;
  icon: React.ReactNode;
  path: string;
  to?: To;
  isSelected?: (location: Location) => boolean;
};

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { logout, user } = useAuth();
  const { mode, toggleMode, setMode } = useThemeMode();
  const client = useAuthorizedClient();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; severity: "success" | "error" } | null>(null);
  const [apiError, setApiError] = useState<{ message: string; status?: number } | null>(null);

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      {
        label: "Dashboard",
        icon: <DashboardOutlinedIcon />,
        path: "/dashboard",
        isSelected: (currentLocation) => ["/", "/dashboard"].includes(currentLocation.pathname),
      },
      {
        label: "Plan Yönetimi",
        icon: <TableChartOutlinedIcon />,
        path: "/plans",
      },
      {
        label: "Harcama Yönetimi",
        icon: <ReceiptLongOutlinedIcon />,
        path: "/expenses",
      },
      {
        label: "Raporlama",
        icon: <CloudOutlinedIcon />,
        path: "/reports",
      },
    ];

    if (user?.is_admin) {
      items.push(
        {
          label: "Temizleme Araçları",
          icon: <CleaningServicesOutlinedIcon />,
          path: "/cleanup",
          isSelected: (currentLocation) => currentLocation.pathname === "/cleanup" && !currentLocation.hash,
          to: "/cleanup",
        },
        {
          label: "Kullanıcı Yönetimi",
          icon: <PeopleOutlineOutlinedIcon />,
          path: "/users",
        },
        {
          label: "Garanti Takibi",
          icon: <VerifiedOutlinedIcon />,
          path: "/warranty-tracking",
        }
      );
    }

    return items;
  }, [user?.is_admin]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; status?: number }>).detail;
      if (detail?.message) {
        setApiError({ message: detail.message, status: detail.status });
      }
    };
    window.addEventListener("api-error", handler as EventListener);
    return () => window.removeEventListener("api-error", handler as EventListener);
  }, []);

  const userDisplayName = user?.full_name?.trim() || user?.username || "Kullanıcı";
  const userInitials = useMemo(() => {
    const source = user?.full_name || user?.username || "";
    if (!source) return "";
    const parts = source.trim().split(/\s+/);
    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
    return initials.join("") || source.charAt(0).toUpperCase();
  }, [user?.full_name, user?.username]);

  const handlePasswordChange = async () => {
    if (newPassword !== newPasswordAgain) {
      setFeedback({ message: "Yeni şifreler eşleşmiyor.", severity: "error" });
      return;
    }

    try {
      setIsSavingPassword(true);
      await client.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setFeedback({ message: "Şifreniz güncellendi.", severity: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordAgain("");
      setIsChangePasswordOpen(false);
    } catch (error: any) {
      const detail = error?.response?.data?.detail ?? "Şifre güncellenirken hata oluştu.";
      setFeedback({ message: detail, severity: "error" });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const drawer = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Box component="img" src={brandLogo} alt="Bütçe Takip" sx={{ width: 48, height: 48, flexShrink: 0 }} />
        <Box>
          <Typography variant="h6" fontWeight={700} color="primary">
            Bütçe Takip
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Yönetim Platformu
          </Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ flexGrow: 1, py: 2 }}>
        {navItems.map((item) => {
          const isActive = item.isSelected ? item.isSelected(location) : location.pathname === item.path;
          return (
            <ListItemButton
              component={Link}
              to={item.to ?? item.path}
              key={item.label}
              selected={isActive}
              sx={{
                mx: 2,
                borderRadius: 2,
                mb: 0.5,
                color: isActive ? "primary.main" : "text.primary",
                "& .MuiListItemIcon-root": {
                  color: isActive ? "primary.main" : "grey.600",
                },
                "& .MuiListItemText-primary": {
                  fontWeight: isActive ? 600 : 500,
                },
                "&.Mui-selected": {
                  backgroundColor: (theme) => `${theme.palette.primary.main}0f`,
                  color: "primary.main",
                },
                "&:hover": {
                  backgroundColor: (theme) => `${theme.palette.primary.main}0a`,
                },
              }}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
              <ChevronRightIcon sx={{ color: "divider", fontSize: 18 }} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            borderRadius: 3,
            backgroundColor: (theme) => `${theme.palette.primary.main}0a`,
            borderColor: (theme) => `${theme.palette.primary.main}1f`,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>{userInitials}</Avatar>
            <Box flexGrow={1}>
              <Typography variant="body1" fontWeight={700}>
                {userDisplayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.is_admin ? "Yönetici" : "Kullanıcı"}
              </Typography>
            </Box>
            <Button variant="outlined" color="primary" size="small" onClick={(event) => setUserMenuAnchor(event.currentTarget)}>
              Profil
            </Button>
          </Stack>
        </Paper>
        <Tooltip title={mode === "dark" ? "Açık moda geç" : "Karanlık moda geç"} placement="top">
          <ListItemButton onClick={toggleMode} sx={{ borderRadius: 2, color: "text.secondary" }}>
            <ListItemIcon sx={{ color: "text.secondary" }}>
              {mode === "dark" ? <DarkModeIcon /> : <LightModeIcon />}
            </ListItemIcon>
            <ListItemText
              primary="Karanlık Mod"
              secondary={mode === "dark" ? "Aktif" : "Pasif"}
              secondaryTypographyProps={{ color: "text.secondary" }}
            />
            <Switch
              edge="end"
              checked={mode === "dark"}
              onChange={(event) => {
                event.stopPropagation();
                setMode(event.target.checked ? "dark" : "light");
              }}
              onClick={(event) => event.stopPropagation()}
              inputProps={{ "aria-label": "Karanlık mod anahtarı" }}
            />
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "background.default",
        overflowX: "hidden",
      }}
    >
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth, borderRight: "1px solid", borderColor: "divider" } }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: "100%",
          maxWidth: "100vw",
          bgcolor: "background.default",
        }}
      >
        <Box sx={{ px: { xs: 3, md: 5 }, pt: { xs: 3, md: 5 } }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { xs: "inline-flex", md: "none" }, mb: 2 }}
            aria-label="Menü"
          >
            <MenuIcon />
          </IconButton>
        </Box>
        <Box
          sx={{
            width: "100%",
            maxWidth: "none",
            ml: 0,
            mr: 0,
            px: { xs: 3, md: 4 },
            pb: { xs: 4, md: 6 },
          }}
        >
          {children}
        </Box>
        <Menu
          anchorEl={userMenuAnchor}
          open={Boolean(userMenuAnchor)}
          onClose={() => setUserMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem
            onClick={() => {
              setIsChangePasswordOpen(true);
              setUserMenuAnchor(null);
            }}
          >
            Şifremi Değiştir
          </MenuItem>
          <MenuItem
            onClick={() => {
              logout();
              setUserMenuAnchor(null);
            }}
          >
            Çıkış Yap
          </MenuItem>
        </Menu>
        <Dialog
          open={isChangePasswordOpen}
          onClose={() => {
            if (!isSavingPassword) setIsChangePasswordOpen(false);
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Şifremi Değiştir</DialogTitle>
          <DialogContent dividers>
            <TextField
              fullWidth
              margin="normal"
              label="Mevcut şifre"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <TextField
              fullWidth
              margin="normal"
              label="Yeni şifre"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              fullWidth
              margin="normal"
              label="Yeni şifre (tekrar)"
              type="password"
              value={newPasswordAgain}
              onChange={(e) => setNewPasswordAgain(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => !isSavingPassword && setIsChangePasswordOpen(false)} disabled={isSavingPassword}>
              İptal
            </Button>
            <Button variant="contained" disabled={isSavingPassword} onClick={handlePasswordChange}>
              Kaydet
            </Button>
          </DialogActions>
        </Dialog>
        <Snackbar
          open={Boolean(feedback)}
          autoHideDuration={4000}
          onClose={() => setFeedback(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          {feedback && (
            <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ width: "100%" }}>
              {feedback.message}
            </Alert>
          )}
        </Snackbar>
        <Snackbar
          open={Boolean(apiError)}
          autoHideDuration={5000}
          onClose={() => setApiError(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          {apiError && (
            <Alert severity="error" onClose={() => setApiError(null)} sx={{ width: "100%" }}>
              {apiError.status ? `[${apiError.status}] ` : ""}
              {apiError.message}
            </Alert>
          )}
        </Snackbar>
      </Box>
    </Box>
  );
}
