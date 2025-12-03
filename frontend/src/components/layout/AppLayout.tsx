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
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Location, To } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import brandLogo from "../../assets/brand-logo.svg";
import { useThemeMode } from "../../context/ThemeModeContext";

const drawerWidth = 280;

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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, toggleMode, setMode } = useThemeMode();

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
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
        label: "Raporlama / İçeri Aktar",
        icon: <CloudUploadIcon />,
        path: "/import-export"
      }
    ];

    if (user?.is_admin) {
      items.push(
        {
          label: "Temizleme Araçları",
          icon: <CleaningServicesIcon />,
          path: "/cleanup",
          isSelected: (currentLocation) =>
            currentLocation.pathname === "/cleanup" && !currentLocation.hash,
          to: "/cleanup"
        },
        {
          label: "Kullanıcı Yönetimi",
          icon: <PeopleIcon />,
          path: "/users"
        }
      );
    }

    return items;
  }, [user?.is_admin]);

  const drawer = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "background.paper"
      }}
    >
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
          const resolvedTo = item.to ?? item.path;
          const selected = item.isSelected
            ? item.isSelected(location)
            : location.pathname === item.path;
          return (
            <ListItemButton
              component={Link}
              to={resolvedTo}
              key={item.label}
              selected={selected}
              sx={{
                mx: 2,
                borderRadius: 2,
                mb: 1,
                color: selected ? "primary.main" : "text.primary",
                gap: 1,
                "&.Mui-selected": {
                  backgroundColor: "rgba(13, 71, 161, 0.12)",
                  color: "primary.main"
                }
              }}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon
                sx={{ color: selected ? "primary.main" : "text.secondary", minWidth: 48 }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ sx: { fontSize: "16px" } }} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
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
              primaryTypographyProps={{ sx: { fontSize: "16px" } }}
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
            <ListItemText primary="Çıkış" primaryTypographyProps={{ sx: { fontSize: "16px" } }} />
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
      <IconButton
        aria-label="Menüyü aç"
        onClick={() => setMobileOpen(true)}
        sx={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: (theme) => theme.zIndex.drawer + 2,
          display: { xs: "flex", md: "none" },
          backgroundColor: "background.paper",
          boxShadow: 1,
          border: "1px solid",
          borderColor: "divider"
        }}
      >
        <MenuIcon />
      </IconButton>
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
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: "1px solid",
              borderColor: "divider"
            }
          }}
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
        {children}
      </Box>
    </Box>
  );
}
