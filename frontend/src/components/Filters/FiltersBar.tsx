import { ReactNode } from "react";
import { Box, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";

type FiltersBarProps = {
  title?: string;
  onApply: () => void;
  onReset: () => void;
  children: ReactNode;
};

export default function FiltersBar({ title = "Filtreler", onApply, onReset, children }: FiltersBarProps) {
  return (
    <Card>
      <CardContent sx={{ py: 1.5, px: 2.5 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          sx={{ rowGap: 1 }}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: "fit-content" }}>
            {title}
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              flex: 1
            }}
          >
            {children}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="contained"
              startIcon={<FilterAltOutlinedIcon sx={{ fontSize: 18 }} />}
              onClick={onApply}
              sx={{
                minWidth: 90,
                textTransform: "none"
              }}
            >
              Uygula
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RestartAltOutlinedIcon sx={{ fontSize: 18 }} />}
              onClick={onReset}
              sx={{
                minWidth: 90,
                textTransform: "none"
              }}
            >
              Sıfırla
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
