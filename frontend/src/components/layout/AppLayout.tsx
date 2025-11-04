import {
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Switch,
  Tooltip,
  Typography
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/SpaceDashboardOutlined";
import ListAltIcon from "@mui/icons-material/ListAltOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import CloudUploadIcon from "@mui/icons-material/CloudUploadOutlined";
import CleaningServicesIcon from "@mui/icons-material/CleaningServicesOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import brandLogo from "../../assets/brand-logo.svg";
import { useThemeMode } from "../../context/ThemeModeContext";

const drawerWidth = 260;

const navItems = [
  {
    label: "Dashboard",
    icon: <DashboardIcon />,
    path: "/"
  },
  {
    label: "Plan Yönetimi",
    icon: <ListAltIcon />,
    path: "/plans"
  },
  {
    label: "Harcama Yönetimi",
    icon: <ReceiptIcon />,
    path: "/expenses"
  },
  {
    label: "Raporlama",
    icon: <CloudUploadIcon />,
    path: "/import-export"
  },
  {
    label: "Temizleme Araçları",
    icon: <CleaningServicesIcon />,
    path: "/cleanup"
  }
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, toggleMode, setMode } = useThemeMode();

  const initials = useMemo(() => {
    if (!user) return "?";
    const segments = user.full_name.split(" ");
    return segments
      .map((segment) => segment[0])
      .join("")
      .toUpperCase();
  }, [user]);

  const drawer = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          component="img"
          src={brandLogo}
          alt="Bütçe Takip"
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        />
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
          const selected = location.pathname === item.path;
          return (
            <ListItemButton
              component={Link}
              to={item.path}
              key={item.label}
              selected={selected}
              sx={{
                mx: 2,
                borderRadius: 2,
                mb: 1,
                color: selected ? "primary.main" : "text.primary",
                "&.Mui-selected": {
                  backgroundColor: "rgba(13, 71, 161, 0.12)",
                  color: "primary.main"
                }
              }}
            >
              <ListItemIcon
                sx={{ color: selected ? "primary.main" : "text.secondary" }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar sx={{ bgcolor: "primary.main" }}>{initials}</Avatar>
          <Box>
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              {user?.full_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(user?.role ?? "user").toLowerCase() === "admin" ? "Yönetici" : "Kullanıcı"}
            </Typography>
          </Box>
        </Box>
        <Tooltip title={mode === "dark" ? "Açık moda geç" : "Karanlık moda geç"} placement="top">
          <ListItemButton
            onClick={toggleMode}
            sx={{ borderRadius: 2, color: "text.secondary" }}
          >
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
          <ListItemButton
            onClick={logout}
            sx={{ borderRadius: 2, color: "text.secondary" }}
          >
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
        overflowX: "hidden"
      }}
    >
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth }
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth }
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <IconButton
        onClick={() => setMobileOpen(true)}
        color="primary"
        aria-label="Menüyü aç"
        sx={{
          position: "fixed",
          top: 16,
          left: 16,
          display: { xs: mobileOpen ? "none" : "flex", md: "none" },
          zIndex: (theme) => theme.zIndex.drawer + 1,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          backgroundColor: "background.paper",
          boxShadow: 1,
          width: 44,
          height: 44,
          "&:hover": {
            backgroundColor: "background.paper"
          }
        }}
      >
        <MenuIcon />
      </IconButton>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: "100%",
          maxWidth: "100vw",
          p: { xs: 3, md: 5 }
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
