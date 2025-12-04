import {
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
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
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Location, To } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import brandLogo from "../../assets/brand-logo.svg";

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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const envLabel = (import.meta.env.VITE_APP_ENV as string | undefined) ?? "TEST";

  const drawer = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "primary.main",
        color: "common.white",
        minHeight: "100vh"
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
          <Typography variant="h6" fontWeight={700}>
            Bütçe Takip
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Yönetim Platformu
          </Typography>
        </Box>
      </Box>
      <List sx={{ flexGrow: 1, py: 2 }}>
        {navItems.map((item) => {
          const selected = item.isSelected ? item.isSelected(location) : location.pathname === item.path;

          return (
            <ListItemButton
              component={Link}
              to={item.to ?? item.path}
              key={item.path}
              selected={selected}
              sx={{
                borderRadius: 2,
                mx: 1,
                mb: 0.5,
                color: "inherit",
                "&.Mui-selected": {
                  bgcolor: "rgba(255,255,255,0.14)"
                },
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.10)"
                }
              }}
              onClick={() => setMobileOpen(false)}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: 14, fontWeight: selected ? 600 : 500 }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ p: 2 }}>
        <Tooltip title="Çıkış Yap">
          <ListItemButton
            onClick={logout}
            sx={{
              borderRadius: 2,
              color: "inherit",
              mx: 1,
              "&:hover": { bgcolor: "rgba(255,255,255,0.10)" }
            }}
          >
            <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Çıkış" primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
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
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              bgcolor: "primary.main",
              color: "common.white"
            }
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
              bgcolor: "primary.main",
              color: "common.white",
              borderRight: "none"
            }
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          backgroundColor: "background.default",
          minHeight: "100vh",
          p: { xs: 2, md: 3 }
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <Chip
            label={envLabel.toUpperCase()}
            size="small"
            color={envLabel.toUpperCase() === "PROD" ? "error" : "default"}
            variant="outlined"
          />
        </Box>
        {children}
      </Box>
    </Box>
  );
}
