import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import * as XLSX from "xlsx";

import { formatBudgetItemLabel } from "../../utils/budgetLabel";

export interface OverBudgetSummary {
  over_total: number;
  over_item_count: number;
  total_revised_plan: number;
  total_actual: number;
  total_valid_actual: number;
  remaining_total: number;
  remaining_item_count: number;
  saving_total: number;
  saving_item_count: number;
  unused_total?: number;
  unused_item_count?: number;
}

export interface OverBudgetItem {
  budget_item_id: number;
  budget_code: string;
  budget_name: string;
  months: number[];
  capex_opex?: string | null;
  asset_type?: string | null;
  department?: string | null;
  plan: number;
  actual: number;
  over: number;
  over_pct: number;
  unused_amount?: number;
  available_amount?: number;
  reason?: string | null;
  note?: string | null;
  unused_updated_at?: string | null;
  year?: number;
  month?: number | null;
  scenario?: number | null;
}

export interface OverBudgetResponse {
  summary: OverBudgetSummary;
  items: OverBudgetItem[];
  saving_items?: OverBudgetItem[];
  remaining_items?: OverBudgetItem[];
  unused_items?: OverBudgetItem[];
}

export type BudgetStatusCategory = "overrun" | "saving" | "remaining";

type OverBudgetDialogProps = {
  open: boolean;
  onClose: () => void;
  data?: OverBudgetResponse;
  category?: BudgetStatusCategory;
  fileNamePrefix?: string;
  onItemClick?: (item: OverBudgetItem) => void;
};

const monthLabels = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık"
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function formatMonths(months: number[]) {
  return months
    .filter((month) => month >= 1 && month <= 12)
    .map((month) => monthLabels[month - 1])
    .join(", ");
}

function applyWorksheetFormatting(worksheet: XLSX.WorkSheet, rows: Record<string, unknown>[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  worksheet["!cols"] = headers.map((header) => {
    const maxLength = rows.reduce(
      (max, row) => Math.max(max, String(row[header] ?? "").length),
      header.length
    );
    return { wch: Math.min(Math.max(maxLength + 2, 14), 42) };
  });
  headers.forEach((_, index) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = { font: { bold: true } };
    }
  });
  const moneyColumns = new Set(["Toplam Bütçe", "Gerçekleşen Harcama", "Aşım", "Tasarruf", "Kalan Bütçe"]);
  headers.forEach((header, colIndex) => {
    if (!moneyColumns.has(header)) return;
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      if (worksheet[cellRef]) {
        worksheet[cellRef].z = '#,##0.00';
      }
    }
  });
}

const dialogConfig: Record<
  BudgetStatusCategory,
  {
    title: string;
    emptyMessage: string;
    resultLabel: string;
    monthsLabel: string;
    resultColor: string;
    sheetName: string;
    fileNamePrefix: string;
  }
> = {
  overrun: {
    title: "Aşım Yapan Kalemler",
    emptyMessage: "Aşım yapan kalem bulunmuyor.",
    resultLabel: "Aşım",
    monthsLabel: "Ay / Aylar",
    resultColor: "error.main",
    sheetName: "Aşım Yapan Kalemler",
    fileNamePrefix: "asim-yapan-kalemler"
  },
  saving: {
    title: "Tasarruf Edilen Kalemler",
    emptyMessage: "Tasarruf edilen kalem bulunmuyor.",
    resultLabel: "Tasarruf",
    monthsLabel: "Ay / Aylar",
    resultColor: "success.main",
    sheetName: "Tasarruf Edilen Kalemler",
    fileNamePrefix: "tasarruf-edilen-kalemler"
  },
  remaining: {
    title: "Kalan Kullanılabilir Bütçe",
    emptyMessage: "Kullanılabilir kalan bütçe bulunmuyor.",
    resultLabel: "Kalan Bütçe",
    monthsLabel: "Ay / Aylar",
    resultColor: "warning.main",
    sheetName: "Kalan Kullanılabilir",
    fileNamePrefix: "kalan-kullanilabilir-butce"
  }
};

export default function OverBudgetDialog({
  open,
  onClose,
  data,
  category = "overrun",
  fileNamePrefix,
  onItemClick
}: OverBudgetDialogProps) {
  const config = dialogConfig[category];
  const items =
    category === "saving"
      ? data?.saving_items ?? []
      : category === "remaining"
        ? data?.remaining_items ?? []
        : data?.items ?? [];
  const totals = items.reduce(
    (acc, item) => ({
      plan: acc.plan + (Number(item.plan) || 0),
      actual: acc.actual + (Number(item.actual) || 0),
      difference: acc.difference + (Number(item.over) || 0)
    }),
    { plan: 0, actual: 0, difference: 0 }
  );
  const summaryTotals = (() => {
    if (category === "overrun" && data?.summary) {
      return {
        plan: Number(data.summary.total_revised_plan) || totals.plan,
        actual: Number(data.summary.total_actual) || totals.actual,
        difference: Math.max(Number(data.summary.over_total) || 0, 0),
        itemCount: Number(data.summary.over_item_count) || items.length
      };
    }
    if (category === "remaining" && data?.summary) {
      return {
        plan: totals.plan,
        actual: totals.actual,
        difference: Math.max(Number(data.summary.remaining_total) || 0, 0),
        itemCount: Number(data.summary.remaining_item_count) || items.length
      };
    }
    return { ...totals, itemCount: items.length };
  })();

  const handleExport = () => {
    const rows = items.map((item) => ({
      "Bütçe Kalemi": formatBudgetItemLabel({
        code: item.budget_code,
        name: item.budget_name
      }),
      [config.monthsLabel]: formatMonths(item.months),
      "Capex/Opex": item.capex_opex ?? "-",
      Nitelik: item.asset_type ?? "-",
      Departman: item.department ?? "-",
      "Toplam Bütçe": Number(item.plan) || 0,
      "Gerçekleşen Harcama": Number(item.actual) || 0,
      [config.resultLabel]: Number(item.over) || 0
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    applyWorksheetFormatting(worksheet, rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName);
    const resolvedFileName = fileNamePrefix ?? `${config.fileNamePrefix}-${Date.now()}`;
    XLSX.writeFile(workbook, `${resolvedFileName}.xlsx`);
  };

  const summaryItems = [
    {
      label: "Toplam Bütçe",
      value: formatCurrency(summaryTotals.plan)
    },
    {
      label: "Toplam Gerçekleşen Harcama",
      value: formatCurrency(summaryTotals.actual)
    },
    {
      label: `Toplam ${config.resultLabel}`,
      value: formatCurrency(summaryTotals.difference),
      color: config.resultColor
    },
    {
      label: "Kalem sayısı",
      value: String(summaryTotals.itemCount)
    }
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>{config.title}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {summaryItems.map((item) => (
            <Grid item xs={12} sm={6} md={3} key={item.label}>
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.25,
                  height: "100%"
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} color={item.color}>
                  {item.value}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {config.emptyMessage}
          </Typography>
        ) : (
          <Box sx={{ maxHeight: 460, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Bütçe Kalemi</TableCell>
                  <TableCell>{config.monthsLabel}</TableCell>
                  <TableCell>Capex/Opex</TableCell>
                  <TableCell>Nitelik</TableCell>
                  <TableCell>Departman</TableCell>
                  <TableCell align="right">Toplam Bütçe</TableCell>
                  <TableCell align="right">Gerçekleşen Harcama</TableCell>
                  <TableCell align="right">{config.resultLabel}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={`${item.budget_item_id}-${item.scenario ?? "all"}`}
                    hover
                    sx={onItemClick ? { cursor: "pointer" } : undefined}
                    onClick={() => onItemClick?.(item)}
                  >
                    <TableCell>
                      {formatBudgetItemLabel({
                        code: item.budget_code,
                        name: item.budget_name
                      })}
                    </TableCell>
                    <TableCell>{formatMonths(item.months) || "-"}</TableCell>
                    <TableCell>{item.capex_opex ?? "-"}</TableCell>
                    <TableCell>{item.asset_type ?? "-"}</TableCell>
                    <TableCell>{item.department ?? "-"}</TableCell>
                    <TableCell align="right">{formatCurrency(item.plan)}</TableCell>
                    <TableCell align="right">{formatCurrency(item.actual)}</TableCell>
                    <TableCell align="right">
                      <Typography color={config.resultColor} fontWeight={700}>
                        {formatCurrency(item.over)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={handleExport} disabled={items.length === 0}>
          Excel'e Aktar
        </Button>
        <Button onClick={onClose}>Kapat</Button>
      </DialogActions>
    </Dialog>
  );
}
