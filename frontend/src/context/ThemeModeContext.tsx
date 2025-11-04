import { Dispatch, SetStateAction, createContext, useContext, useMemo } from "react";
import { CssBaseline, PaletteMode, ThemeProvider } from "@mui/material";

import usePersistentState from "../hooks/usePersistentState";
import createAppTheme from "../theme";

type ThemeModeContextValue = {
  mode: PaletteMode;
  toggleMode: () => void;
  setMode: Dispatch<SetStateAction<PaletteMode>>;
};

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

interface ThemeModeProviderProps {
  children: React.ReactNode;
}

export function ThemeModeProvider({ children }: ThemeModeProviderProps) {
  const [mode, setMode] = usePersistentState<PaletteMode>("ui:themeMode", "light");

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      mode,
      toggleMode: () => setMode((prev) => (prev === "light" ? "dark" : "light")),
      setMode,
    }),
    [mode, setMode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return context;
}

