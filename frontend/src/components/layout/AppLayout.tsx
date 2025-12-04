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
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/SpaceDashboardOutlined";
import ListAltIcon from "@mui/icons-material/ListAltOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import CloudUploadIcon from "@mui/icons-material/CloudUploadOutlined";
import CleaningServicesIcon from "@mui/icons-material/CleaningServicesOutlined";
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import { useMemo, useState } from "react";
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

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      {
        label: "Dashboard",
        icon: <DashboardIcon />,
        path: "/",
      },
      {
        label: "Plan Yönetimi",
        icon: <ListAltIcon />,
        path: "/plans",
      },
      {
        label: "Harcama Yönetimi",
        icon: <ReceiptIcon />,
        path: "/expenses",
      },
      {
        label: "Raporlama",
        icon: <CloudUploadIcon />,
        path: "/import-export",
      },
    ];

    if (user?.is_admin) {
      items.push(
        {
          label: "Temizleme Araçları",
          icon: <CleaningServicesIcon />,
          path: "/cleanup",
          isSelected: (currentLocation) => currentLocation.pathname === "/cleanup" && !currentLocation.hash,
          to: "/cleanup",
        },
        {
          label: "Kullanıcı Yönetimi",
          icon: <PeopleIcon />,
          path: "/users",
        }
      );
    }

    return items;
  }, [user?.is_admin]);

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
          const selected = item.isSelected ? item.isSelected(location) : location.pathname === item.path;
          return (
            <ListItemButton
              component={Link}
              to={item.to ?? item.path}
              key={item.label}
              selected={selected}
              sx={{
                mx: 2,
                borderRadius: 2,
                mb: 1,
                color: selected ? "primary.main" : "text.primary",
                "&.Mui-selected": {
                  backgroundColor: "rgba(13, 71, 161, 0.12)",
                  color: "primary.main",
                },
              }}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon sx={{ color: selected ? "primary.main" : "text.secondary" }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <ListItemButton
          onClick={(event) => setUserMenuAnchor(event.currentTarget)}
          sx={{ borderRadius: 2, color: "text.primary" }}
        >
          <ListItemIcon>
            <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32 }}>
              {userInitials}
            </Avatar>
          </ListItemIcon>
          <ListItemText
            primary={userDisplayName}
            secondary={user?.is_admin ? "Yönetici" : "Kullanıcı"}
            secondaryTypographyProps={{ color: "text.secondary" }}
          />
        </ListItemButton>
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
        <Tooltip title="Çıkış Yap">
          <ListItemButton onClick={logout} sx={{ borderRadius: 2, color: "text.secondary" }}>
            <ListItemIcon>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Çıkış" />
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
      <Box
        sx={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: (theme) => theme.zIndex.drawer + 1,
          display: { xs: "inline-flex", md: "none" },
          backgroundColor: "background.paper",
          borderRadius: 2,
          boxShadow: 3,
          p: 0.5,
        }}
      >
        <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)}>
          <MenuIcon />
        </IconButton>
      </Box>
      <Box
        sx={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: (theme) => theme.zIndex.drawer + 1,
          display: { xs: "inline-flex", md: "none" },
          backgroundColor: "background.paper",
          borderRadius: 2,
          boxShadow: 3,
          p: 0.5,
          alignItems: "center",
        }}
      >
        <IconButton onClick={(event) => setUserMenuAnchor(event.currentTarget)}>
          <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32 }}>{userInitials}</Avatar>
        </IconButton>
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
          sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth } }}
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
          p: { xs: 3, md: 5 },
          mt: { xs: 3, md: 4 },
        }}
      >
        {children}
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
      </Box>
    </Box>
  );
}
