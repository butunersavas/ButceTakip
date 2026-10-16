import CurrencyExchangeOutlinedIcon from "@mui/icons-material/CurrencyExchangeOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import SwapVertOutlinedIcon from "@mui/icons-material/SwapVertOutlined";
import {
  Box,
  Divider,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import {
  formatMarketRate,
  formatMarketRateDate,
  type MarketRatesResponse,
} from "../../utils/marketRates";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

function normalizeAmountInput(value: string) {
  return value.replace(/\s/g, "").replace(",", ".");
}

function parseAmount(value: string) {
  const parsed = Number(normalizeAmountInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatConvertedAmount(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export default function MarketIndicators() {
  const client = useAuthorizedClient();
  const [tryAmount, setTryAmount] = useState("");
  const [usdAmount, setUsdAmount] = useState("");
  const [lastEdited, setLastEdited] = useState<"try" | "usd">("try");

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

  useEffect(() => {
    if (!usdRate) return;
    if (lastEdited === "try") {
      const amount = parseAmount(tryAmount);
      setUsdAmount(amount === null ? "" : formatConvertedAmount(amount / usdRate));
    } else {
      const amount = parseAmount(usdAmount);
      setTryAmount(amount === null ? "" : formatConvertedAmount(amount * usdRate));
    }
  }, [lastEdited, usdRate]);

  const handleTryChange = (value: string) => {
    setLastEdited("try");
    setTryAmount(value);
    if (!usdRate) {
      setUsdAmount("");
      return;
    }
    const amount = parseAmount(value);
    setUsdAmount(amount === null ? "" : formatConvertedAmount(amount / usdRate));
  };

  const handleUsdChange = (value: string) => {
    setLastEdited("usd");
    setUsdAmount(value);
    if (!usdRate) {
      setTryAmount("");
      return;
    }
    const amount = parseAmount(value);
    setTryAmount(amount === null ? "" : formatConvertedAmount(amount * usdRate));
  };

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

        <Divider sx={{ my: 0.25 }} />

        <Stack spacing={0.75}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <SwapVertOutlinedIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              TL ↔ USD Dönüştürücü
            </Typography>
          </Stack>
          <TextField
            size="small"
            label="TL"
            value={tryAmount}
            onChange={(event) => handleTryChange(event.target.value)}
            placeholder="0,00"
            disabled={!usdRate}
            inputProps={{ inputMode: "decimal" }}
            sx={{
              "& .MuiInputBase-root": { height: 34, fontSize: "0.78rem" },
              "& .MuiInputLabel-root": { fontSize: "0.78rem" },
            }}
          />
          <TextField
            size="small"
            label="USD"
            value={usdAmount}
            onChange={(event) => handleUsdChange(event.target.value)}
            placeholder="0,00"
            disabled={!usdRate}
            inputProps={{ inputMode: "decimal" }}
            sx={{
              "& .MuiInputBase-root": { height: 34, fontSize: "0.78rem" },
              "& .MuiInputLabel-root": { fontSize: "0.78rem" },
            }}
          />
          <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>
            TCMB USD satış kuru ile hesaplanır.
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
