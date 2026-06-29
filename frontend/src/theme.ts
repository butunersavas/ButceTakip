import { PaletteMode } from "@mui/material";
import { alpha, createTheme } from "@mui/material/styles";

const paletteBackgroundDefault = {
  light: "#F5F7FB",
  dark: "#0b172a",
};

const paletteBackgroundPaper = {
  light: "#ffffff",
  dark: "#14233d",
};

const primaryMain = {
  light: "#2952E3",
  dark: "#8aa3ff",
};

export default function createAppTheme(mode: PaletteMode) {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryMain[mode],
        contrastText: "#ffffff",
      },
      secondary: {
        main: "#4C6FFF",
      },
      background: {
        default: paletteBackgroundDefault[mode],
        paper: paletteBackgroundPaper[mode],
      },
      text: {
        primary: mode === "light" ? "#0f172a" : "#e2e8f0",
        secondary: mode === "light" ? "#475569" : alpha("#e2e8f0", 0.75),
      },
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: "Inter, Roboto, 'Segoe UI', sans-serif",
      h4: {
        fontSize: 26,
        fontWeight: 700,
      },
      h5: {
        fontSize: 22,
        fontWeight: 700,
      },
      h6: {
        fontSize: 18,
        fontWeight: 600,
      },
      body2: {
        fontSize: 14,
      },
    },
    components: {
      MuiAppBar: {
        defaultProps: {
          color: "default",
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 1,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.shape.borderRadius,
            boxShadow:
              mode === "light"
                ? "0px 10px 30px rgba(41, 82, 227, 0.08)"
                : "0px 16px 40px rgba(0, 0, 0, 0.45)",
          }),
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 1,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.shape.borderRadius,
            boxShadow:
              mode === "light"
                ? "0px 10px 30px rgba(41, 82, 227, 0.08)"
                : "0px 16px 40px rgba(0, 0, 0, 0.45)",
          }),
        },
      },
      MuiButton: {
        defaultProps: {
          variant: "contained",
          color: "primary",
        },
        styleOverrides: {
          root: ({ theme }) => ({
            textTransform: "none",
            borderRadius: theme.shape.borderRadius,
            fontWeight: 600,
            padding: "10px 16px",
            boxShadow: "none",
            "&:hover": {
              boxShadow:
                mode === "light"
                  ? "0px 10px 30px rgba(41, 82, 227, 0.18)"
                  : "0px 16px 40px rgba(0, 0, 0, 0.6)",
            },
          }),
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: paletteBackgroundPaper[mode],
          },
        },
      },
      MuiPopover: {
        defaultProps: {
          disableScrollLock: true,
        },
      },
      MuiMenu: {
        defaultProps: {
          disableScrollLock: true,
        },
      },
      MuiModal: {
        defaultProps: {
          disableScrollLock: true,
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: ({ theme }) => ({
            border: "none",
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.background.paper,
            boxShadow: mode === "light" ? "0px 8px 24px rgba(15, 23, 42, 0.08)" : "none",
          }),
          columnHeaders: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.primary.main, 0.06),
            color: theme.palette.text.primary,
            fontWeight: 700,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }),
          columnHeaderTitle: {
            fontWeight: 700,
            fontSize: 14,
          },
          cell: {
            fontSize: 14,
          },
        },
      },
    },
  });
}
