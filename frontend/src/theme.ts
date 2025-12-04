import { PaletteMode } from "@mui/material";
import { createTheme } from "@mui/material/styles";

export default function createAppTheme(mode: PaletteMode) {
  return createTheme({
    palette: {
      mode,
    },
  });
}
