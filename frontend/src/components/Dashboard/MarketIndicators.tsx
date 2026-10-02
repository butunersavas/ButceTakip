import CurrencyExchangeOutlinedIcon from "@mui/icons-material/CurrencyExchangeOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import {
  buildMarketIndicatorCards,
  formatMarketRate,
  formatMarketRateDate,
  type MarketRatesResponse,
} from "../../utils/marketRates";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

const indicatorIcons: Record<string, ReactNode> = {
  usd: <CurrencyExchangeOutlinedIcon fontSize="small" />,
  eur: <EuroOutlinedIcon fontSize="small" />,
  gold: <PaidOutlinedIcon fontSize="small" />,
};

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

  const cards = buildMarketIndicatorCards(data);
  const warning = isError ? "TCMB verilerine şu anda ulaşılamıyor." : data?.warning;

  return (
    <Card variant="outlined" sx={{ borderColor: "divider" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
        <Stack spacing={1.75}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={0.5}
          >
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Piyasa Göstergeleri
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Bilgilendirme amaçlıdır; bütçe hesaplamalarına ve raporlara dahil edilmez.
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {data?.source ?? "Türkiye Cumhuriyet Merkez Bankası (TCMB)"}
              {data?.rate_date ? ` · ${formatMarketRateDate(data.rate_date)}` : ""}
              {data?.rate_type ? ` · ${data.rate_type}` : ""}
            </Typography>
          </Stack>

          <Grid container spacing={1.5}>
            {cards.map((card) => (
              <Grid item xs={12} sm={4} key={card.key}>
                <Box
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 2,
                    px: 2,
                    py: 1.5,
                    minHeight: 82,
                    bgcolor: "background.default",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ color: card.key === "gold" ? "warning.main" : "primary.main" }}>
                      {indicatorIcons[card.key]}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {card.label}
                      </Typography>
                      {isLoading ? (
                        <Skeleton variant="text" width={90} height={34} />
                      ) : (
                        <Typography variant="h6" fontWeight={700}>
                          {formatMarketRate(card.value, card.fractionDigits)}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Box>
              </Grid>
            ))}
          </Grid>

          {warning && <Alert severity="warning">{warning}</Alert>}
          {!isLoading && data?.gram_gold_try === null && (
            <Typography variant="caption" color="text.secondary">
              Gram Altın: {data.gold_note}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
