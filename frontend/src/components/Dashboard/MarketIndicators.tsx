import CurrencyExchangeOutlinedIcon from "@mui/icons-material/CurrencyExchangeOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import {
  Box,
  Button,
  Collapse,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import {
  formatMarketRate,
  formatMarketRateDate,
  type MarketRatesResponse,
} from "../../utils/marketRates";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

type ConversionDirection = "TRY_TO_USD" | "USD_TO_TRY";

function normalizeAmountInput(value: string) {
  return value.replace(/\s/g, "").replace(",", ".");
}

function parseAmount(value: string) {
  const parsed = Number(normalizeAmountInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatConvertedAmount(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export default function MarketIndicators() {
  const client = useAuthorizedClient();
  const [converterOpen, setConverterOpen] = useState(false);
  const [direction, setDirection] = useState<ConversionDirection>("TRY_TO_USD");
  const [amount, setAmount] = useState("");

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

  const usdRate = useMemo(() => {
    const value = Number(data?.usd_try);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [data?.usd_try]);

  const convertedValue = useMemo(() => {
    const parsed = parseAmount(amount);
    if (!usdRate || parsed === null) return null;
    return direction === "TRY_TO_USD" ? parsed / usdRate : parsed * usdRate;
  }, [amount, direction, usdRate]);

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

  const inputCurrency = direction === "TRY_TO_USD" ? "TL" : "USD";
  const outputCurrency = direction === "TRY_TO_USD" ? "USD" : "TL";

  return (
    <Stack spacing={0.9}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.2,
          borderRadius: 2.5,
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        <Stack spacing={0.65}>
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
              sx={{ minHeight: 22 }}
            >
              <Stack direction="row" alignItems="center" spacing={0.65} sx={{ minWidth: 0 }}>
                <Box sx={{ color: "primary.main", display: "flex", alignItems: "center" }}>
                  {row.icon}
                </Box>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {row.label}
                </Typography>
              </Stack>

              {isLoading ? (
                <Skeleton variant="text" width={58} height={18} />
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
              sx={{ cursor: "default", lineHeight: 1.2, pt: 0.15 }}
            >
              TCMB{data?.rate_date ? ` · ${formatMarketRateDate(data.rate_date)}` : ""}
              {warning ? " · Güncellenemedi" : ""}
            </Typography>
          </Tooltip>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          borderColor: "divider",
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <Button
          fullWidth
          color="inherit"
          onClick={() => setConverterOpen((open) => !open)}
          endIcon={converterOpen ? <ExpandLessOutlinedIcon /> : <ExpandMoreOutlinedIcon />}
          sx={{
            minHeight: 34,
            px: 1.2,
            justifyContent: "space-between",
            textTransform: "none",
            fontSize: "0.74rem",
            fontWeight: 700,
            color: "text.secondary",
            "& .MuiButton-endIcon": {
              ml: "auto",
              "& svg": { fontSize: 16 },
            },
          }}
        >
          Kur Dönüştürücü
        </Button>

        <Collapse in={converterOpen} timeout="auto" unmountOnExit>
          <Stack spacing={0.75} sx={{ px: 1.2, pb: 1, pt: 0.15 }}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={direction}
              onChange={(_event, value: ConversionDirection | null) => {
                if (value) {
                  setDirection(value);
                  setAmount("");
                }
              }}
              aria-label="Kur dönüştürme yönü"
              sx={{
                "& .MuiToggleButton-root": {
                  minHeight: 28,
                  py: 0.15,
                  px: 0.5,
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  textTransform: "none",
                  "&.Mui-selected": {
                    bgcolor: "success.main",
                    color: "success.contrastText",
                    "&:hover": {
                      bgcolor: "success.dark",
                    },
                  },
                },
              }}
            >
              <ToggleButton value="TRY_TO_USD">TL → USD</ToggleButton>
              <ToggleButton value="USD_TO_TRY">USD → TL</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              size="small"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={!usdRate}
              placeholder="Tutar"
              inputProps={{ inputMode: "decimal", "aria-label": "Dönüştürülecek tutar" }}
              InputProps={{
                endAdornment: <InputAdornment position="end">{inputCurrency}</InputAdornment>,
              }}
              sx={{
                "& .MuiInputBase-root": {
                  height: 32,
                  fontSize: "0.76rem",
                  borderRadius: 1.5,
                },
                "& .MuiInputAdornment-root": { fontSize: "0.7rem" },
              }}
            />

            <Stack
              direction="row"
              alignItems="baseline"
              justifyContent="space-between"
              spacing={1}
              sx={{ px: 0.25, minHeight: 24 }}
            >
              <Typography variant="caption" color="text.secondary">
                Sonuç
              </Typography>
              <Typography variant="body2" fontWeight={800} noWrap>
                {convertedValue === null
                  ? `- ${outputCurrency}`
                  : `${formatConvertedAmount(convertedValue)} ${outputCurrency}`}
              </Typography>
            </Stack>

            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontSize: "0.62rem", lineHeight: 1.15 }}
            >
              TCMB USD satış kuru kullanılır.
            </Typography>
          </Stack>
        </Collapse>
      </Paper>
    </Stack>
  );
}
