import { PaletteMode } from "@mui/material";
import { createTheme } from "@mui/material/styles";

export default function createAppTheme(_: PaletteMode) {
  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: "#D72638"
      },
      secondary: {
        main: "#004B6B"
      },
      background: {
        default: "#f4f5f7",
        paper: "#ffffff"
      }
    },
    shape: {
      borderRadius: 12
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: "0 8px 16px rgba(15, 23, 42, 0.08)"
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: "none",
            borderBottom: "1px solid rgba(148, 163, 184, 0.4)"
          }
        }
      }
    },
    typography: {
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h5: {
        fontWeight: 600,
        letterSpacing: 0.2
      }
    }
  });
}
