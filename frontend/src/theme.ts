import { PaletteMode } from "@mui/material";
import { createTheme } from "@mui/material/styles";

export default function createAppTheme(_: PaletteMode) {
  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: "#D72638",
      },
      secondary: {
        main: "#0F172A",
      },
      background: {
        default: "#F3F4F6",
        paper: "#FFFFFF",
      },
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h5: {
        fontWeight: 600,
        letterSpacing: 0.2,
      },
      body2: {
        fontSize: 13,
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            borderRadius: 16,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 16,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: "none",
            borderBottom: "1px solid rgba(148, 163, 184, 0.4)",
          },
        },
      },
    },
  });
}
