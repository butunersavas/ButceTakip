import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  typography: {
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  palette: {
    primary: {
      main: "#0d47a1"
    },
    secondary: {
      main: "#26a69a"
    },
    background: {
      default: "#f5f7fb"
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 10,
          fontWeight: 600
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)"
        }
      }
    }
  }
});

export default theme;
