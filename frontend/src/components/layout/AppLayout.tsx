import {
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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import brandLogo from "../../assets/brand-logo.svg";
import { useAuth } from "../../context/AuthContext";
import { useThemeMode } from "../../context/ThemeModeContext";
import { useDashboardPlayback } from "../../context/DashboardPlaybackContext";

const drawerWidth = 260;

const navItems = [
  { label: "Dashboard", icon: <DashboardIcon />, path: "/" },
  { label: "Plan Yönetimi", icon: <ListAltIcon />, path: "/plans" },
  { label: "Harcama Yönetimi", icon: <ReceiptIcon />, path: "/expenses" },
  { label: "Raporlama", icon: <CloudUploadIcon />, path: "/import-export" },
  { label: "Temizleme Araçları", icon: <CleaningServicesIcon />, path: "/cleanup" }
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, toggleMode, setMode } = useThemeMode();
  const { autoPlay, toggleAutoPlay } = useDashboardPlayback();

  const drawer = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper"
      }}
    >
      <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box component="img" src={brandLogo} alt="Bütçe Takip" sx={{ height: 32, width: 32 }} />
        <Box>
          <Typography variant="h6" fontWeight={700} color="primary">
            Bütçe Takip
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Yönetim Platformu
          </Typography>
          {user?.full_name && (
            <Typography variant="caption" color="text.secondary">
              {user.full_name}
            </Typography>
          )}
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
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon sx={{ color: selected ? "primary.main" : "text.secondary" }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Tooltip title={autoPlay ? "Grafik oynatımını durdur" : "Grafik oynatımını başlat"} placement="top">
          <ListItemButton onClick={toggleAutoPlay} sx={{ borderRadius: 2, color: "text.secondary" }}>
            <ListItemIcon sx={{ color: "text.secondary" }}>
              {autoPlay ? <PauseIcon /> : <PlayArrowIcon />}
            </ListItemIcon>
            <ListItemText
              primary="Grafik Oynatımı"
              secondary={autoPlay ? "Otomatik" : "Duraklatıldı"}
              secondaryTypographyProps={{ color: "text.secondary" }}
            />
          </ListItemButton>
        </Tooltip>

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
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: "1px solid",
              borderColor: "divider"
            }
          }}
          open
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
          mt: 0
        }}
      >
        <Box sx={{ display: { xs: "flex", md: "none" }, justifyContent: "flex-end", mb: 2 }}>
          <Tooltip title="Menüyü aç">
            <IconButton onClick={() => setMobileOpen(true)} color="primary">
              <MenuIcon />
            </IconButton>
          </Tooltip>
        </Box>
        {children}
      </Box>
    </Box>
  );
}
