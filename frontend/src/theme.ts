import { PaletteMode } from "@mui/material";
import { alpha, createTheme } from "@mui/material/styles";

const surfaceShadow = {
  light: "0 8px 24px rgba(15, 23, 42, 0.08)",
  dark: "0 12px 32px rgba(0, 0, 0, 0.4)"
};

const backgroundDefault = {
  light: "#f5f7fb",
  dark: "#0b172a"
};

const backgroundPaper = {
  light: "#ffffff",
  dark: "#14233d"
};

export default function createAppTheme(mode: PaletteMode) {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: "#0d47a1"
      },
      secondary: {
        main: "#26a69a"
      },
      background: {
        default: backgroundDefault[mode],
        paper: backgroundPaper[mode]
      },
      text: {
        primary: mode === "light" ? "#0f172a" : "#e2e8f0",
        secondary: mode === "light" ? "#475569" : alpha("#e2e8f0", 0.75)
      }
    },
    typography: {
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    components: {
      MuiAppBar: {
        defaultProps: {
          color: "default"
        },
        styleOverrides: {
          root: {
            backgroundImage: "none"
          }
        }
      },
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
            boxShadow: surfaceShadow[mode]
          }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: backgroundPaper[mode]
          }
        }
      }
    }
  });
}
