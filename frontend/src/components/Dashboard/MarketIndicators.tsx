import CurrencyExchangeOutlinedIcon from "@mui/icons-material/CurrencyExchangeOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import {
  Box,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import {
  formatMarketRate,
  formatMarketRateDate,
  type MarketRatesResponse,
} from "../../utils/marketRates";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

export default function MarketIndicators() {
  const client = useAuthorizedClient();
  const { data, isLoading, isError } = useQuery<MarketRatesResponse>({
    queryKey: ["market-rates"],
    queryFn: async () => {
      const response = await client.get<MarketRatesResponse>("/market-rates", {
        suppressGlobalError: true,
      });
      return response.data;
    },
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: false,
  });

  const warning = isError ? "TCMB verilerine şu anda ulaşılamıyor." : data?.warning;
  const sourceInfo = warning
    ? warning
    : `Kaynak: TCMB${data?.rate_date ? ` · ${formatMarketRateDate(data.rate_date)}` : ""}`;

  const rows = [
    {
      key: "usd",
      label: "USD / TL",
      value: data?.usd_try ?? null,
      icon: <CurrencyExchangeOutlinedIcon sx={{ fontSize: 16 }} />,
    },
    {
      key: "eur",
      label: "EUR / TL",
      value: data?.eur_try ?? null,
      icon: <EuroOutlinedIcon sx={{ fontSize: 16 }} />,
    },
  ];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        borderRadius: 2.5,
        borderColor: "divider",
        bgcolor: "background.default",
      }}
    >
      <Stack spacing={0.75}>
        <Typography variant="caption" fontWeight={800} color="text.secondary">
          Piyasa
        </Typography>

        {rows.map((row) => (
          <Stack
            key={row.key}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ minHeight: 24 }}
          >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
              <Box sx={{ color: "primary.main", display: "flex", alignItems: "center" }}>
                {row.icon}
              </Box>
              <Typography variant="caption" color="text.secondary" noWrap>
                {row.label}
              </Typography>
            </Stack>

            {isLoading ? (
              <Skeleton variant="text" width={58} height={20} />
            ) : (
              <Typography variant="body2" fontWeight={700} noWrap>
                {formatMarketRate(row.value, 4)}
              </Typography>
            )}
          </Stack>
        ))}

        <Tooltip title={sourceInfo} placement="right" arrow>
          <Typography
            variant="caption"
            color={warning ? "warning.main" : "text.disabled"}
            noWrap
            sx={{ cursor: "default", lineHeight: 1.2 }}
          >
            TCMB{data?.rate_date ? ` · ${formatMarketRateDate(data.rate_date)}` : ""}
            {warning ? " · Güncellenemedi" : ""}
          </Typography>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
