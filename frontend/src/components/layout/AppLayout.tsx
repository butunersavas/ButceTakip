import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
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
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

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
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          Bütçe Yönetimi
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Kurumsal bütçe planlama ve raporlama
        </Typography>
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
      <Box sx={{ p: 2 }}>
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
    <Box sx={{ display: "flex", minHeight: "100vh", backgroundColor: "background.default" }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          boxShadow: "none",
          backgroundColor: "transparent"
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", backgroundColor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600 }}>
            {navItems.find((item) => item.path === location.pathname)?.label ?? "Bütçe Yönetimi"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="subtitle2" fontWeight={600}>
                {user?.full_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.role === "admin" ? "Yönetici" : "Kullanıcı"}
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "primary.main" }}>{initials}</Avatar>
          </Box>
        </Toolbar>
      </AppBar>
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
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 3, md: 5 }, mt: { xs: 8, md: 10 } }}>
        {children}
      </Box>
    </Box>
  );
}
