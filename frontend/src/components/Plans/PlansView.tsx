import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import Autocomplete, { createFilterOptions, type FilterOptionsState } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import { DataGrid, GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import usePersistentState from "../../hooks/usePersistentState";
import { useAuth } from "../../context/AuthContext";
import { formatBudgetItemLabel, stripBudgetCode } from "../../utils/budgetLabel";
import { formatBudgetItemMeta } from "../../utils/budgetItem";
import FiltersBar from "../Filters/FiltersBar";
import { formatCurrency } from "../../utils/currency";
import { formatUnusedReason, normalizeUnusedReason, UNUSED_REASON_OPTIONS } from "../../utils/unusedReason";
import UnusedBudgetDialog from "../common/UnusedBudgetDialog";
import { useConfirmDialog } from "../../context/ConfirmDialogContext";

interface Scenario {
  id: number;
  name: string;
  year: number;
  is_primary: boolean;
}

interface BudgetItem {
  id: number;
  code: string;
  name: string;
  map_category?: string | null;
  map_attribute?: string | null;
}

type BudgetSelectOption = BudgetItem & {
  isNewBudgetOption?: boolean;
};

interface PlanEntry {
  id: number;
  year: number;
  month: number;
  amount: number;
  scenario_id: number;
  budget_item_id: number;
  department?: string | null;
  department_name?: string | null;
  departmentName?: string | null;
  scenario?: string | null;
  scenario_name?: string | null;
  scenario_year?: number | null;
  is_carryover?: boolean;
  source_year?: number | null;
  scenarioName?: string | null;
  budget_code?: string | null;
  budget_name?: string | null;
  budgetName?: string | null;
  capex_opex?: string | null;
  capexOpex?: string | null;
  asset_type?: string | null;
  assetType?: string | null;
  map_capex_opex?: string | null;
  map_nitelik?: string | null;
  is_form_prepared?: boolean | null;
  purchase_requested?: boolean | null;
  purchase_requested_at?: string | null;
  transfer_in_amount?: number | null;
  transfer_out_amount?: number | null;
  revised_amount?: number | null;
  actual_amount?: number | null;
  unused_amount?: number | null;
  available_amount?: number | null;
  scope_revised_amount?: number | null;
  scope_actual_amount?: number | null;
  scope_unused_amount?: number | null;
  scope_cancelled_amount?: number | null;
  scope_available_amount?: number | null;
  cancelled_amount?: number | null;
  is_cancelled?: boolean | null;
  unused_reason?: string | null;
  unused_note?: string | null;
  unused_updated_at?: string | null;
  budget_item?: BudgetItem | null;
  budgetItem?: BudgetItem | null;
}

type PlanMutationPayload = {
  id?: number;
  year: number;
  month: number;
  amount: number;
  scenario_id: number;
  budget_item_id?: number | null;
  budget_code?: string | null;
  budget_name?: string | null;
  department?: string | null;
  map_category?: string | null;
  map_attribute?: string | null;
  description?: string | null;
  merge_mode?: "merge" | "separate";
  unused_reason?: string | null;
  unused_note?: string | null;
};

interface DeleteDependencyInfo {
  related_file_count: number;
}

type DeletePlanPayload = {
  planId: number;
  deleteRelated: boolean;
};

interface BudgetTransfer {
  id: number;
  source_budget_item_id: number;
  source_year: number;
  source_month: number;
  source_scenario_id: number;
  target_budget_item_id: number;
  target_year: number;
  target_month: number;
  target_scenario_id: number;
  amount: number;
  reason: string;
  created_at?: string | null;
  is_cancelled: boolean;
  source_budget_name?: string | null;
  target_budget_name?: string | null;
}

interface BudgetAvailable {
  revised_amount: number;
  actual_amount: number;
  unused_amount?: number;
  available_amount: number;
}

type PlanUnusedPayload = {
  planId: number;
  amount: number;
  reason?: string | null;
  note?: string | null;
};

type BudgetTransferPayload = {
  source_budget_item_id: number;
  source_year: number;
  source_month: number;
  source_scenario_id: number;
  target_budget_item_id: number;
  target_year: number;
  target_month: number;
  target_scenario_id: number;
  amount: number;
  reason: string;
};

const monthOptions = [
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

const unusedReasonOptions = [
  "Alımdan vazgeçildi",
  "İhtiyaç kalmadı",
  "Proje iptal/ertelendi",
  "Başka bütçeden karşılandı",
  "Diğer"
];

function formatCapexLabel(value?: string | null) {
  if (!value) return null;
  const normalized = value.toString().trim();
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

function parseLocaleNumber(value: FormDataEntryValue | string | null) {
  if (value === null) return NaN;
  const raw = value.toString().trim();
  if (!raw) return NaN;
  let normalized = raw.replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }
  return Number(normalized);
}

export default function PlansView() {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const requestConfirmation = useConfirmDialog();
  const { user } = useAuth();
  const isViewer = ["viewer", "readonly", "read_only"].includes(
    String(user?.role ?? "").toLowerCase()
  );
  const canManagePlans = Boolean(user?.is_admin) && !isViewer;
  const [searchParams, setSearchParams] = useSearchParams();
  type PlanCardFilter = "" | "actual" | "unused" | "available";
  const initialCard = searchParams.get("card") as PlanCardFilter | null;
  const [activeCard, setActiveCard] = useState<PlanCardFilter>(
    initialCard && ["actual", "unused", "available"].includes(initialCard) ? initialCard : ""
  );
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ pageSize: 12, page: 0 });
  useEffect(() => {
    const card = searchParams.get("card") as PlanCardFilter | null;
    const next = card && ["actual", "unused", "available"].includes(card) ? card : "";
    setActiveCard(next);
    setPaginationModel((current) => ({ ...current, page: 0 }));
  }, [searchParams]);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = usePersistentState<number>("plans:year", currentYear);
  const [scenarioId, setScenarioId] = usePersistentState<number | null>("plans:scenarioId", null);
  const [monthFilter, setMonthFilter] = useState<number | "">("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [budgetItemId, setBudgetItemId] = usePersistentState<number | null>("plans:budgetItemId", null);
  const [capexOpex, setCapexOpex] = usePersistentState<"" | "capex" | "opex">("plans:capexOpex", "");
  const explicitScenarioSelectionRef = useRef(false);
  useEffect(() => {
    const requestedYear = Number(searchParams.get("year"));
    const requestedScenario = Number(searchParams.get("scenario_id"));
    if (Number.isInteger(requestedYear) && requestedYear > 0) setYear(requestedYear);
    if (Number.isInteger(requestedScenario) && requestedScenario > 0) {
      explicitScenarioSelectionRef.current = true;
      setScenarioId(requestedScenario);
    }

    if (searchParams.get("source") === "budget-preparation") {
      setBudgetItemId(null);
      setCapexOpex("");
      setMonthFilter("");
      setDepartmentFilter("");
      setActiveCard("");
      setPaginationModel((current) => ({ ...current, page: 0 }));
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("source");
      nextParams.delete("card");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setBudgetItemId, setCapexOpex, setScenarioId, setSearchParams, setYear]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBudgetItemId, setFormBudgetItemId] = useState<number | null>(null);
  const [formBudgetItemText, setFormBudgetItemText] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formMapCategory, setFormMapCategory] = useState("");
  const [formMapAttribute, setFormMapAttribute] = useState("");
  const [formMergeMode, setFormMergeMode] = useState<"merge" | "separate">("merge");
  const [formUnusedReason, setFormUnusedReason] = useState("");
  const [formUnusedNote, setFormUnusedNote] = useState("");
  const [formYear, setFormYear] = useState<number>(year);
  const [formScenarioId, setFormScenarioId] = useState<number | "">(scenarioId ?? "");
  const [isNewBudgetMode, setIsNewBudgetMode] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSourceBudgetItemId, setTransferSourceBudgetItemId] = useState<number | null>(null);
  const [transferSourceYear, setTransferSourceYear] = useState<number>(currentYear);
  const [transferSourceMonth, setTransferSourceMonth] = useState<number>(new Date().getMonth() + 1);
  const [transferSourceScenarioId, setTransferSourceScenarioId] = useState<number | null>(null);
  const [transferTargetBudgetItemId, setTransferTargetBudgetItemId] = useState<number | null>(null);
  const [transferTargetYear, setTransferTargetYear] = useState<number>(currentYear);
  const [transferTargetMonth, setTransferTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [transferTargetScenarioId, setTransferTargetScenarioId] = useState<number | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [unusedDialogPlan, setUnusedDialogPlan] = useState<PlanEntry | null>(null);
  const [purchaseRevertPlan, setPurchaseRevertPlan] = useState<PlanEntry | null>(null);
  const [unusedAmount, setUnusedAmount] = useState("");
  const [unusedReason, setUnusedReason] = useState(unusedReasonOptions[0]);
  const [unusedNote, setUnusedNote] = useState("");
  const [unusedError, setUnusedError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const resolveApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
      const detail =
        (error.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
        (error.response?.data as { detail?: string; message?: string } | undefined)?.message;
      if (detail) {
        return detail;
      }
    }
    return fallback;
  }, []);

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const { data } = await client.get<Scenario[]>("/scenarios");
      return data;
    }
  });

  const scenarioById = useMemo(() => {
    const map = new Map<number, Scenario>();
    (scenarios ?? []).forEach((scenario) => {
      map.set(scenario.id, scenario);
    });
    return map;
  }, [scenarios]);

  const findDefaultScenarioForYear = useCallback(
    (targetYear: number) => {
      const yearScenarios = (scenarios ?? []).filter((scenario) => scenario.year === targetYear);
      return (
        yearScenarios.find((scenario) => scenario.is_primary) ??
        yearScenarios.find((scenario) => scenario.name?.trim().toLowerCase() === "temel") ??
        yearScenarios[0] ??
        null
      );
    },
    [scenarios]
  );

  useEffect(() => {
    if (!scenarios?.length) return;
    setScenarioId((previous) => {
      const previousScenario = previous ? scenarioById.get(previous) : null;
      // A preparation scenario can legitimately own carry-over PlanEntry rows in
      // later years, so its definition year must not clear an explicit selection.
      if (
        previousScenario?.year === year
        && (previousScenario.is_primary || explicitScenarioSelectionRef.current)
      ) {
        return previous;
      }

      explicitScenarioSelectionRef.current = false;
      return findDefaultScenarioForYear(year)?.id ?? null;
    });
  }, [findDefaultScenarioForYear, scenarioById, scenarios, setScenarioId, year]);

  const formScenarioOptions = useMemo(
    () => (scenarios ?? []).filter((scenario) => scenario.year === formYear),
    [formYear, scenarios]
  );
  const formScenarioSelectValue = useMemo(() => {
    if (!formScenarioId) return "";
    return formScenarioOptions.some((scenario) => scenario.id === Number(formScenarioId))
      ? formScenarioId
      : "";
  }, [formScenarioId, formScenarioOptions]);

  useEffect(() => {
    if (!dialogOpen || !scenarios) return;
    setFormScenarioId((previous) => {
      const previousScenario = previous ? scenarioById.get(Number(previous)) : null;
      if (previousScenario?.year === formYear) {
        return previous;
      }
      return findDefaultScenarioForYear(formYear)?.id ?? "";
    });
  }, [dialogOpen, findDefaultScenarioForYear, formYear, scenarioById, scenarios]);

  const ensureScenarioForYear = useCallback(
    async (targetYear: number, candidateId?: number | "") => {
      if (candidateId) {
        const candidate = scenarioById.get(Number(candidateId));
        if (candidate?.year === targetYear) {
          return candidate.id;
        }
      }

      const existing = findDefaultScenarioForYear(targetYear);
      if (existing) {
        return existing.id;
      }

      const { data: latestScenarios } = await client.get<Scenario[]>("/scenarios");
      const latestYearScenarios = latestScenarios.filter((scenario) => scenario.year === targetYear);
      const latestExisting =
        latestYearScenarios.find((scenario) => scenario.is_primary) ??
        latestYearScenarios.find((scenario) => scenario.name?.trim().toLowerCase() === "temel") ??
        latestYearScenarios[0] ??
        null;
      if (latestExisting) {
        queryClient.invalidateQueries({ queryKey: ["scenarios"] });
        return latestExisting.id;
      }

      const { data } = await client.post<Scenario>("/scenarios", {
        name: "Temel",
        year: targetYear,
        description: `${targetYear} temel senaryosu`
      });
      queryClient.invalidateQueries({ queryKey: ["scenarios"] });
      return data.id;
    },
    [client, findDefaultScenarioForYear, queryClient, scenarioById]
  );

  const { data: budgetItems } = useQuery<BudgetItem[]>({
    queryKey: ["budget-items"],
    queryFn: async () => {
      const { data } = await client.get<BudgetItem[]>("/budget-items");
      return data;
    }
  });

  const newBudgetOption = useMemo<BudgetSelectOption>(
    () => ({
      id: -1,
      code: "__new_budget__",
      name: "Yeni Bütçe",
      isNewBudgetOption: true
    }),
    []
  );

  const budgetSelectOptions = useMemo<BudgetSelectOption[]>(
    () => [newBudgetOption, ...((budgetItems ?? []) as BudgetSelectOption[])],
    [budgetItems, newBudgetOption]
  );

  const budgetDialogFilterOptions = useMemo(() => {
    const filter = createFilterOptions<BudgetSelectOption>({
      stringify: (option) => {
        const name = stripBudgetCode(option.name ?? "");
        const meta = option.isNewBudgetOption ? "yeni bütçe yeni plan" : formatBudgetItemMeta(option);
        return `${option.code ?? ""} ${name} ${meta}`;
      }
    });
    return (options: BudgetSelectOption[], params: FilterOptionsState<BudgetSelectOption>) => {
      const filteredOptions = filter(
        options.filter((option) => !option.isNewBudgetOption),
        params
      );
      return [newBudgetOption, ...filteredOptions];
    };
  }, [newBudgetOption]);

  const plansQuery = useQuery<PlanEntry[]>({
    queryKey: [
      "plans",
      year,
      scenarioId,
      budgetItemId,
      monthFilter || "",
      departmentFilter || "",
      capexOpex,
      Boolean(scenarioId && scenarioById.get(scenarioId)?.is_primary)
    ],
    queryFn: async () => {
      const params: Record<string, number | string> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      if (scenarioId && scenarioById.get(scenarioId)?.is_primary) params.effective_primary = "true";
      if (budgetItemId) params.budget_item_id = budgetItemId;
      if (monthFilter !== "") params.month = Number(monthFilter);
      if (departmentFilter) params.department = departmentFilter;
      if (capexOpex) params.capex_opex = capexOpex;
      const { data } = await client.get<PlanEntry[]>("/plans", { params });
      return data;
    }
  });

  const transfersQuery = useQuery<BudgetTransfer[]>({
    queryKey: ["budget-transfers", year, scenarioId],
    queryFn: async () => {
      const params: Record<string, number> = { year };
      if (scenarioId) params.scenario_id = scenarioId;
      const { data } = await client.get<BudgetTransfer[]>("/plans/transfers", { params });
      return data;
    }
  });

  const transferAvailableQuery = useQuery<BudgetAvailable>({
    queryKey: [
      "budget-transfer-available",
      transferSourceBudgetItemId,
      transferSourceYear,
      transferSourceMonth,
      transferSourceScenarioId
    ],
    enabled:
      transferDialogOpen &&
      Boolean(
        transferSourceBudgetItemId &&
          transferSourceYear &&
          transferSourceMonth &&
          transferSourceScenarioId
      ),
    queryFn: async () => {
      const { data } = await client.get<BudgetAvailable>("/plans/transfers/available", {
        params: {
          budget_item_id: transferSourceBudgetItemId,
          year: transferSourceYear,
          month: transferSourceMonth,
          scenario_id: transferSourceScenarioId
        }
      });
      return data;
    }
  });

  useEffect(() => {
    if (plansQuery.isError) {
      const error = plansQuery.error as any;
      const detail = error?.response?.data?.detail ?? "Plan kayıtları alınamadı.";
      setListError(detail);
    }
  }, [plansQuery.error, plansQuery.isError]);

  const mutation = useMutation({
    mutationFn: async (payload: PlanMutationPayload) => {
      if (payload.id) {
        const { id, ...body } = payload;
        const { data } = await client.put<PlanEntry>(`/plans/${id}`, body);
        return data;
      }
      const { data } = await client.post<PlanEntry>("/plans/manual", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      queryClient.invalidateQueries({ queryKey: ["budget-items"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["pending-budget-actions"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-pending"] });
      setDialogOpen(false);
      setFormError(null);
      setToast({ message: "Kayıt kaydedildi.", severity: "success" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ planId, deleteRelated }: DeletePlanPayload) => {
      await client.delete(`/plans/${planId}`, {
        params: { delete_related: deleteRelated }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      setToast({ message: "Kayıt silindi.", severity: "success" });
    },
    onError: (error) => {
      setToast({
        message: resolveApiErrorMessage(error, "Plan kaydı silinemedi."),
        severity: "error"
      });
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (payload: BudgetTransferPayload) => {
      const { data } = await client.post<BudgetTransfer>("/plans/transfers", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      queryClient.invalidateQueries({ queryKey: ["budget-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["budget-transfer-available"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setTransferDialogOpen(false);
      setTransferError(null);
      setToast({ message: "Bütçe aktarımı kaydedildi.", severity: "success" });
    },
    onError: (error) => {
      setTransferError(resolveApiErrorMessage(error, "Bütçe aktarımı kaydedilemedi."));
    }
  });

  const unusedMutation = useMutation({
    mutationFn: async ({ planId, amount, reason, note }: PlanUnusedPayload) => {
      const { data } = await client.post<PlanEntry>(`/plans/${planId}/unused`, {
        amount,
        reason,
        note
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      queryClient.invalidateQueries({ queryKey: ["budget-transfer-available"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setUnusedDialogPlan(null);
      setUnusedError(null);
      setToast({ message: "Kullanılmayacak bütçe kaydedildi.", severity: "success" });
    },
    onError: (error) => {
      setUnusedError(resolveApiErrorMessage(error, "Kullanılmayacak bütçe kaydedilemedi."));
    }
  });

  const clearUnusedMutation = useMutation({
    mutationFn: async (planId: number) => {
      const { data } = await client.delete<PlanEntry>(`/plans/${planId}/unused`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      queryClient.invalidateQueries({ queryKey: ["budget-transfer-available"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setToast({ message: "Kullanılmayacak bütçe bilgisi kaldırıldı.", severity: "success" });
    },
    onError: (error) => {
      setToast({
        message: resolveApiErrorMessage(error, "Kullanılmayacak bütçe bilgisi kaldırılamadı."),
        severity: "error"
      });
    }
  });

  const purchaseRevertMutation = useMutation({
    mutationFn: async (planId: number) => {
      const { data } = await client.patch(`/plan-items/${planId}/purchase-requested`, {
        requested: false
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["pending-budget-actions"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-pending"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setPurchaseRevertPlan(null);
      setToast({ message: "Talep durumu geri alındı.", severity: "success" });
    },
    onError: (error) => {
      setToast({
        message: resolveApiErrorMessage(error, "Talep durumu geri alınamadı."),
        severity: "error"
      });
    }
  });

  const cancelTransferMutation = useMutation({
    mutationFn: async (transferId: number) => {
      const { data } = await client.delete<BudgetTransfer>(`/plans/transfers/${transferId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-aggregate"] });
      queryClient.invalidateQueries({ queryKey: ["budget-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["budget-transfer-available"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setToast({ message: "Bütçe aktarımı iptal edildi.", severity: "success" });
    },
    onError: (error) => {
      setTransferError(resolveApiErrorMessage(error, "Bütçe aktarımı iptal edilemedi."));
    }
  });

  const findDepartmentForBudgetItem = useCallback(
    (itemId?: number | null) => {
      if (!itemId) return "";
      const matchingPlan = plansQuery.data?.find((plan) => {
        const department = plan.department ?? plan.department_name ?? plan.departmentName;
        return plan.budget_item_id === itemId && Boolean(department?.trim());
      });
      return matchingPlan?.department ?? matchingPlan?.department_name ?? matchingPlan?.departmentName ?? "";
    },
    [plansQuery.data]
  );

  const applyFormBudgetItem = useCallback((item: BudgetItem | null) => {
    setIsNewBudgetMode(false);
    setFormBudgetItemId(item?.id ?? null);
    setFormBudgetItemText(item ? stripBudgetCode(item.name ?? "") : "");
    setFormDepartment(item ? findDepartmentForBudgetItem(item.id) : "");
    setFormMapCategory((item?.map_category ?? "").toLowerCase());
    setFormMapAttribute(item?.map_attribute ?? "");
  }, [findDepartmentForBudgetItem]);

  const handleCreate = useCallback(() => {
    setEditingPlan(null);
    const selectedItem = budgetItems?.find((item) => item.id === budgetItemId) ?? null;
    setFormYear(year);
    setFormScenarioId(findDefaultScenarioForYear(year)?.id ?? "");
    setIsNewBudgetMode(false);
    applyFormBudgetItem(selectedItem);
    setFormMergeMode("merge");
    setFormUnusedReason("");
    setFormUnusedNote("");
    setDialogOpen(true);
    setFormError(null);
  }, [applyFormBudgetItem, budgetItemId, budgetItems, findDefaultScenarioForYear, year]);

  const handleEdit = useCallback((plan: PlanEntry) => {
    const item = budgetItems?.find((budgetItem) => budgetItem.id === plan.budget_item_id) ?? null;
    const budgetItemText =
      stripBudgetCode(plan.budget_name ?? "") ||
      (item ? stripBudgetCode(item.name ?? "") : "") ||
      plan.budget_code ||
      "";
    setEditingPlan(plan);
    setFormYear(plan.year);
    setFormScenarioId(plan.scenario_id ?? "");
    setIsNewBudgetMode(false);
    setFormBudgetItemId(plan.budget_item_id ?? null);
    setFormBudgetItemText(budgetItemText);
    setFormDepartment(plan.department ?? plan.department_name ?? plan.departmentName ?? "");
    setFormMapCategory((plan.map_capex_opex ?? plan.capex_opex ?? "").toLowerCase());
    setFormMapAttribute(plan.map_nitelik ?? plan.asset_type ?? "");
    setFormMergeMode("merge");
    setFormUnusedReason(normalizeUnusedReason(plan.unused_reason));
    setFormUnusedNote(plan.unused_note ?? "");
    setDialogOpen(true);
    setFormError(null);
  }, [budgetItems]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const amount = parseLocaleNumber(formData.get("amount"));
    const formYearValue = Number(formData.get("year"));
    const formMonth = Number(formData.get("month"));
    const selectedScenarioId = formScenarioId ? Number(formScenarioId) : "";
    const budgetItemName = formBudgetItemText.trim();
    const departmentValue = formDepartment.trim();
    const mapCategoryValue = formMapCategory.trim();
    const mapAttributeValue = formMapAttribute.trim();

    if (!budgetItemName) {
      setFormError("Bütçe kalemi boş olamaz.");
      return;
    }
    if (editingPlan && !formBudgetItemId) {
      setFormError("Güncelleme için mevcut bir bütçe kalemi seçmelisiniz.");
      return;
    }
    if (!Number.isFinite(formYearValue) || formYearValue <= 0) {
      setFormError("Yıl alanı boş olamaz.");
      return;
    }
    if (!Number.isFinite(formMonth) || formMonth < 1 || formMonth > 12) {
      setFormError("Ay alanı boş olamaz.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Tutar 0'dan büyük olmalı.");
      return;
    }
    if (!editingPlan && !formBudgetItemId && (!departmentValue || !mapCategoryValue || !mapAttributeValue)) {
      setFormError("Yeni bütçe kalemi için Departman, Capex/Opex ve Nitelik alanları zorunludur.");
      return;
    }

    let resolvedScenarioId: number;
    try {
      resolvedScenarioId = await ensureScenarioForYear(formYearValue, selectedScenarioId);
      setFormScenarioId(resolvedScenarioId);
    } catch (error) {
      setFormError(`Temel (${formYearValue}) senaryosu hazırlanamadı.`);
      return;
    }

    const payload: PlanMutationPayload = {
      id: editingPlan?.id ?? undefined,
      year: formYearValue,
      month: formMonth,
      amount,
      scenario_id: resolvedScenarioId,
      budget_item_id: formBudgetItemId,
      department: departmentValue || null
    };

    if (editingPlan && Number(editingPlan.unused_amount ?? 0) > 0) {
      payload.unused_reason = formUnusedReason || null;
      payload.unused_note = formUnusedNote.trim() || null;
    }

    if (!editingPlan) {
      payload.budget_name = budgetItemName;
      payload.map_category = mapCategoryValue || null;
      payload.map_attribute = mapAttributeValue || null;
      payload.description = (formData.get("description") || "").toString().trim() || null;
      payload.merge_mode = (formData.get("merge_mode") || "merge") as "merge" | "separate";
    }

    mutation.mutate(payload, {
      onError: () => {
        setFormError("Plan kaydı kaydedilirken bir sorun oluştu. Yetkinizi ve alanları kontrol edin.");
      }
    });
  };

  const handleDelete = useCallback(async (planId: number) => {
    if (!user?.is_admin) return;
    let relatedFileCount: number | null = null;
    try {
      const { data } = await client.get<DeleteDependencyInfo>(`/plans/${planId}/delete-info`);
      relatedFileCount = data.related_file_count ?? 0;
    } catch (error) {
      console.error(error);
    }

    const confirmMessage =
      relatedFileCount === null
        ? "Bu kaydı silmek istediğinize emin misiniz? Bağlı ek/dosya varsa ekler de silinecek. Devam etmek istiyor musunuz?"
        : relatedFileCount > 0
          ? `Bu kayda bağlı ${relatedFileCount} ek/dosya var. Silerseniz ekler de silinecek. Devam etmek istiyor musunuz?`
          : "Plan kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.";
    const confirmed = await requestConfirmation({
      title: "Plan Kaydını Sil",
      message: confirmMessage,
      confirmLabel: "Plan Kaydını Sil",
      severity: "error",
      irreversible: true,
    });
    if (confirmed) {
      deleteMutation.mutate({
        planId,
        deleteRelated: relatedFileCount === null || relatedFileCount > 0
      });
    }
  }, [client, deleteMutation, requestConfirmation, user?.is_admin]);

  const handleOpenUnusedDialog = useCallback((plan: PlanEntry) => {
    setUnusedDialogPlan(plan);
    setUnusedAmount("");
    setUnusedReason(plan.unused_reason || unusedReasonOptions[0]);
    setUnusedNote(plan.unused_note || "");
    setUnusedError(null);
  }, []);

  const handleUnusedSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!unusedDialogPlan) return;
    const amount = parseLocaleNumber(unusedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setUnusedError("Kullanılmayacak tutar 0'dan büyük olmalı.");
      return;
    }
    const maximum = Number(unusedDialogPlan.unused_amount ?? 0) + Number(
      unusedDialogPlan.scope_available_amount ?? unusedDialogPlan.available_amount ?? 0
    );
    if (amount > maximum + 0.005) {
      setUnusedError(
        `Kullanılmayacak tutar kalan kullanılabilir bütçeden fazla olamaz. Maksimum tutar: ${formatCurrency(maximum)}`
      );
      return;
    }
    unusedMutation.mutate({
      planId: unusedDialogPlan.id,
      amount,
      reason: unusedReason || null,
      note: unusedNote.trim() || null
    });
  }, [unusedAmount, unusedDialogPlan, unusedMutation, unusedNote, unusedReason]);

  const handleClearUnused = useCallback(async (plan: PlanEntry) => {
    if (!user?.is_admin) return;
    const confirmed = await requestConfirmation({
      title: "Kullanılmayacak Bilgisini Kaldır",
      message: "Kullanılmayacak bütçe bilgisi kaldırılacak.",
      confirmLabel: "Bilgiyi Kaldır",
      severity: "warning",
    });
    if (confirmed) {
      clearUnusedMutation.mutate(plan.id);
    }
  }, [clearUnusedMutation, requestConfirmation, user?.is_admin]);

  const handleOpenTransferDialog = useCallback(() => {
    const defaultScenarioId =
      scenarioId ??
      scenarios?.find((scenario) => scenario.year === year)?.id ??
      scenarios?.[0]?.id ??
      null;
    const defaultMonth =
      typeof monthFilter === "number" && monthFilter >= 1 && monthFilter <= 12
        ? monthFilter
        : new Date().getMonth() + 1;

    setTransferSourceBudgetItemId(budgetItemId ?? null);
    setTransferTargetBudgetItemId(null);
    setTransferSourceYear(year);
    setTransferTargetYear(year);
    setTransferSourceMonth(defaultMonth);
    setTransferTargetMonth(defaultMonth);
    setTransferSourceScenarioId(defaultScenarioId);
    setTransferTargetScenarioId(defaultScenarioId);
    setTransferAmount("");
    setTransferReason("");
    setTransferError(null);
    setTransferDialogOpen(true);
  }, [budgetItemId, monthFilter, scenarioId, scenarios, year]);

  const handleTransferSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = parseLocaleNumber(transferAmount);
    if (!transferSourceBudgetItemId) {
      setTransferError("Kaynak bütçe kalemi seçmelisiniz.");
      return;
    }
    if (!transferTargetBudgetItemId) {
      setTransferError("Hedef bütçe kalemi seçmelisiniz.");
      return;
    }
    if (!transferSourceScenarioId || !transferTargetScenarioId) {
      setTransferError("Kaynak ve hedef senaryo seçmelisiniz.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransferError("Aktarım tutarı 0'dan büyük olmalı.");
      return;
    }
    if (!transferReason.trim()) {
      setTransferError("Aktarım nedeni zorunludur.");
      return;
    }
    if (
      transferSourceBudgetItemId === transferTargetBudgetItemId &&
      transferSourceYear === transferTargetYear &&
      transferSourceMonth === transferTargetMonth &&
      transferSourceScenarioId === transferTargetScenarioId
    ) {
      setTransferError("Kaynak ve hedef aynı olamaz.");
      return;
    }
    const availableAmount = transferAvailableQuery.data?.available_amount;
    if (availableAmount !== undefined && amount > availableAmount + 0.005) {
      setTransferError("Aktarım tutarı kaynak kullanılabilir bütçeden fazla olamaz.");
      return;
    }

    const sourceMonthLabel = monthOptions[transferSourceMonth - 1] ?? transferSourceMonth;
    const targetMonthLabel = monthOptions[transferTargetMonth - 1] ?? transferTargetMonth;
    const confirmed = await requestConfirmation({
      title: "Bütçe Aktarımını Onayla",
      message: `${formatCurrency(amount)} tutarı ${transferSourceYear} ${sourceMonthLabel} kaynağından ${transferTargetYear} ${targetMonthLabel} hedefine aktarılacak.`,
      confirmLabel: "Aktarımı Onayla",
      severity: "warning",
    });
    if (!confirmed) return;

    transferMutation.mutate({
      source_budget_item_id: transferSourceBudgetItemId,
      source_year: transferSourceYear,
      source_month: transferSourceMonth,
      source_scenario_id: transferSourceScenarioId,
      target_budget_item_id: transferTargetBudgetItemId,
      target_year: transferTargetYear,
      target_month: transferTargetMonth,
      target_scenario_id: transferTargetScenarioId,
      amount,
      reason: transferReason.trim()
    });
  }, [
    transferAmount,
    transferAvailableQuery.data?.available_amount,
    requestConfirmation,
    transferMutation,
    transferReason,
    transferSourceBudgetItemId,
    transferSourceMonth,
    transferSourceScenarioId,
    transferSourceYear,
    transferTargetBudgetItemId,
    transferTargetMonth,
    transferTargetScenarioId,
    transferTargetYear
  ]);

  const handleCancelTransfer = useCallback(async (transfer: BudgetTransfer) => {
    if (!user?.is_admin) return;
    const confirmed = await requestConfirmation({
      title: "Bütçe Aktarımını İptal Et",
      message: "Bu bütçe aktarımı iptal edilecek.",
      confirmLabel: "Aktarımı İptal Et",
      severity: "error",
    });
    if (confirmed) {
      cancelTransferMutation.mutate(transfer.id);
    }
  }, [cancelTransferMutation, requestConfirmation, user?.is_admin]);

  const baseRows = useMemo(() => {
    const mapped =
      plansQuery.data?.map((plan) => ({
        ...plan,
        amount: Number(plan.amount) || 0,
        transfer_in_amount: Number(plan.transfer_in_amount) || 0,
        transfer_out_amount: Number(plan.transfer_out_amount) || 0,
        revised_amount: Number(plan.revised_amount ?? plan.amount) || 0,
        actual_amount: Number(plan.actual_amount) || 0,
        unused_amount: Number(plan.unused_amount) || 0,
        cancelled_amount: Number(plan.cancelled_amount) || 0,
        is_cancelled: Boolean(plan.is_cancelled),
        available_amount: Number(plan.available_amount) || 0,
        scope_revised_amount: Number(plan.scope_revised_amount ?? plan.revised_amount ?? plan.amount) || 0,
        scope_actual_amount: Number(plan.scope_actual_amount ?? plan.actual_amount) || 0,
        scope_unused_amount: Number(plan.scope_unused_amount ?? plan.unused_amount) || 0,
        scope_cancelled_amount: Number(plan.scope_cancelled_amount ?? plan.cancelled_amount) || 0,
        scope_available_amount: Number(plan.scope_available_amount ?? plan.available_amount) || 0,
        budget_item_id: plan?.budget_item_id ?? null
      })) ?? [];

    if (monthFilter === "" && !departmentFilter) {
      return mapped;
    }

    return mapped.filter((row) => {
      const matchesMonth = monthFilter === "" || row.month === monthFilter;
      const rowDepartment = row.department ?? row.department_name ?? row.departmentName ?? "-";
      const matchesDepartment = !departmentFilter || rowDepartment === departmentFilter;
      return matchesMonth && matchesDepartment;
    });
  }, [departmentFilter, monthFilter, plansQuery.data]);

  const rows = useMemo(() => {
    if (activeCard === "actual") return baseRows.filter((row) => Number(row.scope_actual_amount ?? row.actual_amount) > 0);
    if (activeCard === "unused") return baseRows.filter((row) => Number(row.unused_amount) > 0);
    if (activeCard === "available") return baseRows.filter((row) => Number(row.scope_available_amount ?? row.available_amount) > 0);
    return baseRows;
  }, [activeCard, baseRows]);

  const handleCardFilter = useCallback((card: PlanCardFilter) => {
    const next = activeCard === card ? "" : card;
    setActiveCard(next);
    setPaginationModel((current) => ({ ...current, page: 0 }));
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set("card", next); else nextParams.delete("card");
    setSearchParams(nextParams);
  }, [activeCard, searchParams, setSearchParams]);

  const budgetFilterOptions = useMemo(
    () =>
      createFilterOptions<BudgetItem>({
        stringify: (option) => {
          const name = stripBudgetCode(option.name ?? "");
          const meta = formatBudgetItemMeta(option);
          return `${option.code ?? ""} ${name} ${meta}`;
        }
      }),
    []
  );

  const budgetItemById = useMemo(() => {
    const map = new Map<number, BudgetItem>();
    (budgetItems ?? []).forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [budgetItems]);

  const budgetItemByCode = useMemo(() => {
    const map = new Map<string, BudgetItem>();
    (budgetItems ?? []).forEach((item) => {
      const normalized = stripBudgetCode(item.code ?? "").toLowerCase();
      if (normalized) {
        map.set(normalized, item);
      }
    });
    return map;
  }, [budgetItems]);

  const findBudgetItem = useCallback(
    (row?: PlanEntry | null) => {
      if (!row) return null;
      if (row.budget_item_id) {
        return budgetItemById.get(row.budget_item_id) ?? null;
      }
      const code = stripBudgetCode(row.budget_code ?? "").toLowerCase();
      if (code) {
        return budgetItemByCode.get(code) ?? null;
      }
      return null;
    },
    [budgetItemByCode, budgetItemById]
  );

  const getPlanDisplayValues = useCallback(
    (row?: PlanEntry | null) => {
      const fallbackItem =
        row?.budget_item ??
        row?.budgetItem ??
        findBudgetItem(row);
      const scenario =
        row?.scenario_name ??
        row?.scenarioName ??
        (row as any)?.scenario?.name ??
        scenarioById.get(row?.scenario_id ?? -1)?.name ??
        "-";
      const budgetName =
        row?.budget_name ??
        row?.budgetName ??
        (row as any)?.budget_item?.name ??
        (row as any)?.budgetItem?.name ??
        fallbackItem?.name ??
        row?.budget_code ??
        "-";
      const budgetCode = row?.budget_code ?? fallbackItem?.code ?? undefined;
      const budgetLabel =
        budgetName === "-" ? "-" : formatBudgetItemLabel({ code: budgetCode, name: budgetName });
      const capexOpex =
        row?.map_capex_opex ??
        row?.capex_opex ??
        row?.capexOpex ??
        formatCapexLabel(fallbackItem?.map_category) ??
        "-";
      const nitelik =
        row?.map_nitelik ??
        row?.asset_type ??
        row?.assetType ??
        fallbackItem?.map_attribute ??
        "-";
      const department =
        row?.department ??
        row?.department_name ??
        row?.departmentName ??
        "-";
      return { scenario, budgetLabel, capexOpex, nitelik, department };
    },
    [findBudgetItem, scenarioById]
  );

  const departmentOptions = useMemo(() => {
    const options = new Set<string>();
    plansQuery.data?.forEach((plan) => {
      const department = getPlanDisplayValues(plan).department;
      if (department && department !== "-") {
        options.add(department);
      }
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b, "tr"));
  }, [getPlanDisplayValues, plansQuery.data]);

  const MONTH_NAMES_TR = [
    "",
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

  const columns = useMemo<GridColDef[]>(() => {
    return [
      {
        field: "scenario",
        headerName: "Senaryo",
        flex: 1,
        minWidth: 160,
        valueGetter: (_value, row) => {
          const r = row as any;
          const scenario = getPlanDisplayValues(r).scenario;
          return r.is_carryover ? `${scenario} · DEVREDEN ${r.source_year ?? ""}` : scenario;
        }
      },
      {
        field: "budget",
        headerName: "Bütçe Kalemi",
        flex: 1.4,
        minWidth: 260,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getPlanDisplayValues(r).budgetLabel;
        }
      },
      {
        field: "capex_opex",
        headerName: "Capex/Opex",
        width: 180,
        minWidth: 170,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getPlanDisplayValues(r).capexOpex;
        }
      },
      {
        field: "asset_type",
        headerName: "Nitelik",
        width: 210,
        minWidth: 190,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getPlanDisplayValues(r).nitelik;
        }
      },
      {
        field: "department",
        headerName: "Departman",
        width: 200,
        minWidth: 180,
        valueGetter: (_value, row) => {
          const r = row as any;
          return getPlanDisplayValues(r).department;
        },
      },
      { field: "year", headerName: "Yıl", width: 110 },
      {
        field: "month",
        headerName: "Ay",
        width: 120,
        valueGetter: (_value, row) => {
          const r = row as any;
          const raw = r?.month;

          // month zaten sayıysa
          if (typeof raw === "number") {
            if (raw >= 1 && raw <= 12) {
              return raw;
            }
            return 0;
          }

          // string geldiyse sayıya dönüştürmeyi dene
          const num = Number(raw);
          if (Number.isFinite(num) && num >= 1 && num <= 12) {
            return num;
          }

          // Hiçbiri değilse boş bırak
          return 0;
        },
        renderCell: ({ row }) => {
          const monthNumber = Number((row as any)?.month);
          return MONTH_NAMES_TR[monthNumber] ?? "";
        },
      },
      {
        field: "amount",
        headerName: "Orijinal Plan",
        width: 140,
        renderCell: ({ row }) => {
          const raw = row.amount;
          let num: number;

          if (typeof raw === "number") {
            num = raw;
          } else if (typeof raw === "string") {
            const parsed = Number(
              raw
                .toString()
                .replace(/\./g, "") // binlik noktaları sil
                .replace(",", ".") // virgülü noktaya çevir
            );
            num = Number.isFinite(parsed) ? parsed : 0;
          } else {
            num = 0;
          }

          return formatCurrency(num);
        },
      },
      {
        field: "transfer_in_amount",
        headerName: "Gelen Aktarım",
        width: 150,
        renderCell: ({ row }) => formatCurrency(Number((row as any).transfer_in_amount) || 0)
      },
      {
        field: "transfer_out_amount",
        headerName: "Çıkan Aktarım",
        width: 150,
        renderCell: ({ row }) => formatCurrency(Number((row as any).transfer_out_amount) || 0)
      },
      {
        field: "revised_amount",
        headerName: "Toplam Bütçe",
        width: 150,
        renderCell: ({ row }) =>
          formatCurrency(Number((row as any).revised_amount ?? (row as any).amount) || 0)
      },
      {
        field: "actual_amount",
        headerName: "Harcanan",
        width: 150,
        renderCell: ({ row }) =>
          formatCurrency(Number((row as any).scope_actual_amount ?? (row as any).actual_amount) || 0)
      },
      {
        field: "unused_amount",
        headerName: "Kullanılmayacak",
        width: 170,
        renderCell: ({ row }) => {
          const value = Number((row as any).unused_amount) || 0;
          return value > 0 ? (
            <Stack spacing={0.25} alignItems="flex-start">
              <Chip size="small" color="warning" variant="outlined" label={formatCurrency(value)} />
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatUnusedReason((row as any).unused_reason, "Sebep belirtilmemiş")}
              </Typography>
              {(row as any).unused_note ? (
                <Tooltip title={String((row as any).unused_note)}>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
                    Not: {String((row as any).unused_note)}
                  </Typography>
                </Tooltip>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              -
            </Typography>
          );
        }
      },
      {
        field: "available_amount",
        headerName: "Kalan Kullanılabilir",
        width: 190,
        renderCell: ({ row }) => {
          const value = Number((row as any).scope_available_amount ?? (row as any).available_amount) || 0;
          return (
            <Typography
              variant="body2"
              color={value < 0 ? "error.main" : "text.primary"}
              fontWeight={600}
            >
              {formatCurrency(value)}
            </Typography>
          );
        }
      },
      {
        field: "status",
        headerName: "Durum",
        width: 190,
        valueGetter: (_value, row) => {
          const unused = Number((row as any).unused_amount) || 0;
          const available = Number((row as any).scope_available_amount ?? (row as any).available_amount) || 0;
          return unused > 0 && available <= 0.005
            ? "Kullanılmayacak"
            : unused > 0
              ? "Kısmen Kullanılmayacak"
              : "Aktif";
        },
        renderCell: ({ row }) => {
          const unused = Number((row as any).unused_amount) || 0;
          const available = Number((row as any).scope_available_amount ?? (row as any).available_amount) || 0;
          const full = unused > 0 && available <= 0.005;
          const partial = unused > 0 && !full;
          return (
            <Chip
              size="small"
              label={full ? "Kullanılmayacak" : partial ? "Kısmen Kullanılmayacak" : "Aktif"}
              color={full ? "default" : partial ? "warning" : "success"}
              variant={full ? "filled" : "outlined"}
            />
          );
        }
      },
      {
        field: "actions",
        headerName: "İşlemler",
        sortable: false,
        width: 330,
        minWidth: 320,
        align: "center",
        headerAlign: "center",
        filterable: false,
        disableColumnMenu: true,
        cellClassName: "sticky-actions-cell",
        headerClassName: "sticky-actions-header",
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.75} justifyContent="center" sx={{ width: "100%" }}>
            {isViewer ? (
              <Chip size="small" label="Sadece görüntüleme" variant="outlined" />
            ) : (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={() => handleOpenUnusedDialog(row)}
                  disabled={!canManagePlans}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Kullanılmayacak
                </Button>
                {Number((row as any).unused_amount ?? 0) > 0 ? (
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={() => handleClearUnused(row)}
                    disabled={!canManagePlans || clearUnusedMutation.isPending}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Geri Al
                  </Button>
                ) : null}
                {Boolean(row.purchase_requested || row.is_form_prepared) ? (
                  <Tooltip title="Talep oluşturuldu işaretini geri al">
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setPurchaseRevertPlan(row)}
                        disabled={!canManagePlans || purchaseRevertMutation.isPending}
                      >
                        <UndoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                ) : null}
                <Tooltip title="Güncelle">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleEdit(row)}
                      disabled={!canManagePlans}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Sil">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(row.id)}
                      disabled={!canManagePlans}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            )}
          </Stack>
        )
      }
    ];
  }, [
    canManagePlans,
    clearUnusedMutation.isPending,
    getPlanDisplayValues,
    handleClearUnused,
    handleDelete,
    handleEdit,
    handleOpenUnusedDialog,
    isViewer,
    purchaseRevertMutation.isPending
  ]);

  const planTableTotals = useMemo(() => {
    const scopeMap = new Map<
      string,
      {
        amount: number;
        transferIn: number;
        transferOut: number;
        actual: number;
        unused: number;
        cancelled: number;
      }
    >();
    baseRows.forEach((plan) => {
      const key = [
        plan.budget_item_id ?? "none",
        plan.scenario_id ?? "none",
        plan.year,
        plan.month
      ].join("-");
      const current =
        scopeMap.get(key) ??
        {
          amount: 0,
          transferIn: Number(plan.transfer_in_amount) || 0,
          transferOut: Number(plan.transfer_out_amount) || 0,
          actual: Number(plan.scope_actual_amount ?? plan.actual_amount) || 0,
          unused: 0,
          cancelled: Number(plan.scope_cancelled_amount ?? plan.cancelled_amount) || 0
        };
      current.amount += Number(plan.amount) || 0;
      current.unused += Number(plan.unused_amount) || 0;
      scopeMap.set(key, current);
    });

    return Array.from(scopeMap.values()).reduce(
      (totals, scope) => {
        const totalBudget = scope.amount + scope.transferIn - scope.transferOut;
        const available = Math.max(totalBudget - scope.actual - scope.unused - scope.cancelled, 0);
        return {
          totalBudget: totals.totalBudget + totalBudget,
          actual: totals.actual + scope.actual,
          unused: totals.unused + scope.unused,
          cancelled: totals.cancelled + scope.cancelled,
          available: totals.available + available
        };
      },
      { totalBudget: 0, actual: 0, unused: 0, cancelled: 0, available: 0 }
    );
  }, [baseRows]);

  const transferAvailable = transferAvailableQuery.data;
  const recentTransfers = transfersQuery.data?.slice(0, 6) ?? [];

  const handleApplyFilters = () => {
    plansQuery.refetch();
  };

  const handleResetFilters = () => {
    setYear(currentYear);
    setScenarioId(null);
    setMonthFilter("");
    setDepartmentFilter("");
    setBudgetItemId(null);
    setCapexOpex("");
    setActiveCard("");
    setPaginationModel((current) => ({ ...current, page: 0 }));
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("card");
    setSearchParams(nextParams, { replace: true });
    setFormBudgetItemId(null);
    setFormBudgetItemText("");
    setFormDepartment("");
    setFormMapCategory("");
    setFormMapAttribute("");
    setFormYear(currentYear);
    setFormScenarioId("");
    setIsNewBudgetMode(false);
    setTimeout(() => {
      plansQuery.refetch();
    }, 0);
  };

  return (
    <Stack spacing={4}>
      <FiltersBar onApply={handleApplyFilters} onReset={handleResetFilters}>
        <TextField
          label="Yıl"
          type="number"
          size="small"
          value={year}
          onChange={(event) => {
            const value = event.target.value;
            explicitScenarioSelectionRef.current = false;
            setYear(value ? Number(value) : currentYear);
          }}
          sx={{ minWidth: { xs: "100%", sm: 110 }, flex: "0 1 120px", "& .MuiInputBase-root": { height: 40 } }}
        />
        <TextField
          select
          label="Senaryo"
          size="small"
          value={scenarioId ?? ""}
          onChange={(event) => {
            explicitScenarioSelectionRef.current = true;
            setScenarioId(event.target.value ? Number(event.target.value) : null);
          }}
          sx={{ minWidth: { xs: "100%", sm: 240 }, flex: "1 1 240px", "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          {scenarios?.filter((scenario) => scenario.year === year).map((scenario) => (
            <MenuItem key={scenario.id} value={scenario.id}>
              {scenario.name} ({scenario.year}){scenario.is_primary ? " · ANA BÜTÇE" : ""}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Ay"
          size="small"
          value={monthFilter}
          onChange={(event) =>
            setMonthFilter(
              event.target.value ? Number(event.target.value) : ""
            )
          }
          sx={{ minWidth: { xs: "100%", sm: 150 }, flex: "0 1 150px", "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          {monthOptions.map((label, index) => (
            <MenuItem key={index + 1} value={index + 1}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Departman"
          size="small"
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
          sx={{ minWidth: { xs: "100%", sm: 170 }, flex: "0 1 180px", "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          {departmentOptions.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <Autocomplete
          options={budgetItems ?? []}
          value={budgetItems?.find((item) => item.id === budgetItemId) ?? null}
          onChange={(_, value) => setBudgetItemId(value?.id ?? null)}
          getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
          filterOptions={budgetFilterOptions}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          sx={{ minWidth: { xs: "100%", sm: 280 }, flex: "1 1 320px", "& .MuiInputBase-root": { height: 40 } }}
          renderOption={(props, option) => {
            const meta = formatBudgetItemMeta(option);
            return (
              <li {...props} key={option.id}>
                <Stack spacing={0.2}>
                  <Typography variant="body2" fontWeight={600}>
                    {formatBudgetItemLabel(option) || "-"}
                  </Typography>
                  {meta && (
                    <Typography variant="caption" color="text.secondary">
                      {meta}
                    </Typography>
                  )}
                </Stack>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField {...params} label="Bütçe Kalemi" placeholder="Tümü" size="small" />
          )}
        />
        <TextField
          select
          label="Capex/Opex"
          size="small"
          value={capexOpex}
          onChange={(event) => setCapexOpex(event.target.value as "" | "capex" | "opex")}
          sx={{ minWidth: { xs: "100%", sm: 160 }, flex: "0 1 170px", "& .MuiInputBase-root": { height: 40 } }}
        >
          <MenuItem value="">Tümü</MenuItem>
          <MenuItem value="capex">Capex</MenuItem>
          <MenuItem value="opex">Opex</MenuItem>
        </TextField>
      </FiltersBar>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ height: "100%" }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "stretch", sm: "center" }}
                spacing={1.5}
                mb={1.5}
                sx={{ gap: 1.5 }}
              >
                <Typography variant="subtitle1" fontWeight={600}>
                  Plan Kayıtları
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent={{ xs: "flex-start", sm: "flex-end" }}
                  flexWrap="wrap"
                  sx={{
                    rowGap: 1,
                    minWidth: 0,
                    "& .MuiButton-root": { height: 40, whiteSpace: "nowrap" }
                  }}
                >
                  {!isViewer && (
                    <>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<SwapHorizIcon />}
                        onClick={handleOpenTransferDialog}
                        disabled={!canManagePlans}
                      >
                        Bütçe Aktar
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={handleCreate}
                        disabled={!canManagePlans}
                      >
                        Yeni Plan Ekle
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
              <Grid container spacing={1.5} sx={{ mb: 2 }}>
                {[
                  {
                    id: "" as PlanCardFilter,
                    label: "Toplam Bütçe",
                    value: formatCurrency(planTableTotals.totalBudget),
                    color: "primary.main"
                  },
                  {
                    id: "actual" as PlanCardFilter,
                    label: "Harcanan",
                    value: formatCurrency(planTableTotals.actual),
                    color: "success.main"
                  },
                  {
                    id: "unused" as PlanCardFilter,
                    label: "Kullanılmayacak",
                    value: formatCurrency(planTableTotals.unused),
                    color: "warning.main"
                  },
                  {
                    id: "available" as PlanCardFilter,
                    label: "Kalan Kullanılabilir",
                    value: formatCurrency(planTableTotals.available),
                    color: "text.primary"
                  }
                ].map((item) => (
                  <Grid item xs={12} sm={6} md={3} key={item.label}>
                    <CardActionArea onClick={() => handleCardFilter(item.id)} sx={{ borderRadius: 1 }}>
                      <Box
                        sx={{
                          border: "1px solid",
                          borderColor: activeCard === item.id ? "primary.main" : "divider",
                          borderRadius: 1,
                          bgcolor: activeCard === item.id ? "action.selected" : "background.default",
                          p: 1.25,
                          minHeight: 72
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {item.label}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={700} color={item.color}>
                          {item.value}
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Grid>
                ))}
              </Grid>
              <Box sx={{ width: "100%", overflowX: "auto" }}>
                <DataGrid
                  autoHeight
                  rows={rows ?? []}
                  columns={columns}
                  loading={plansQuery.isFetching}
                  getRowId={(row) => row.id ?? `${row.year}-${row.month}-${row.budget_item_id}`}
                  disableRowSelectionOnClick
                  paginationModel={paginationModel}
                  onPaginationModelChange={setPaginationModel}
                  pageSizeOptions={[12, 20, 30, 50, 100]}
                  sx={{
                    minWidth: 2200,
                    border: "none",
                    "& .MuiDataGrid-main": {
                      overflowX: "auto"
                    },
                    "& .MuiDataGrid-virtualScroller": {
                      overflowX: "visible"
                    },
                    "& .MuiDataGrid-virtualScrollerContent": {
                      overflowX: "visible"
                    },
                    "& .sticky-actions-cell, & .sticky-actions-header": {
                      position: "sticky",
                      right: 0,
                      zIndex: 2,
                      backgroundColor: "background.paper",
                      overflow: "visible",
                      boxShadow: "-8px 0 12px -12px rgba(15, 23, 42, 0.45)"
                    },
                    "& .sticky-actions-header": {
                      zIndex: 3
                    }
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingPlan ? "Plan Kaydını Güncelle" : "Yeni Plan Kaydı"}</DialogTitle>
        <form key={editingPlan?.id ?? "new-plan"} onSubmit={handleSubmit}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2.5}>
              {formError && <Alert severity="error">{formError}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Autocomplete<BudgetSelectOption, false, false, true>
                    freeSolo
                    options={budgetSelectOptions}
                    filterOptions={budgetDialogFilterOptions}
                    value={
                      isNewBudgetMode
                        ? newBudgetOption
                        : budgetItems?.find((item) => item.id === formBudgetItemId) ?? null
                    }
                    inputValue={
                      isNewBudgetMode && !formBudgetItemText ? "Yeni Bütçe" : formBudgetItemText
                    }
                    onInputChange={(_, value, reason) => {
                      if (reason === "reset") {
                        return;
                      }
                      setFormBudgetItemText(value);
                      if (reason === "input") {
                        setIsNewBudgetMode(true);
                        setFormBudgetItemId(null);
                        setFormDepartment("");
                        setFormMapCategory("");
                        setFormMapAttribute("");
                      } else if (reason === "clear") {
                        setIsNewBudgetMode(false);
                        setFormBudgetItemId(null);
                        setFormDepartment("");
                        setFormMapCategory("");
                        setFormMapAttribute("");
                      }
                    }}
                    onChange={(_, value) => {
                      if (typeof value === "string") {
                        setIsNewBudgetMode(true);
                        setFormBudgetItemId(null);
                        setFormBudgetItemText(value);
                        setFormDepartment("");
                        setFormMapCategory("");
                        setFormMapAttribute("");
                        return;
                      }
                      if (value?.isNewBudgetOption) {
                        setIsNewBudgetMode(true);
                        setFormBudgetItemId(null);
                        setFormBudgetItemText("");
                        setFormDepartment("");
                        setFormMapCategory("");
                        setFormMapAttribute("");
                        return;
                      }
                      applyFormBudgetItem(value);
                    }}
                    getOptionLabel={(option) =>
                      typeof option === "string"
                        ? option
                        : option.isNewBudgetOption
                          ? "Yeni Bütçe"
                          : stripBudgetCode(option.name ?? "") || formatBudgetItemLabel(option) || ""
                    }
                    isOptionEqualToValue={(option, value) =>
                      typeof value !== "string" && option.id === value.id
                    }
                    renderOption={(props, option) => {
                      if (option.isNewBudgetOption) {
                        return (
                          <li {...props} key={option.id}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <AddIcon fontSize="small" color="primary" />
                              <Stack spacing={0.2}>
                                <Typography variant="body2" fontWeight={700}>
                                  Yeni Bütçe
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Yeni bütçe kalemi oluştur
                                </Typography>
                              </Stack>
                            </Stack>
                          </li>
                        );
                      }
                      const meta = formatBudgetItemMeta(option);
                      return (
                        <li {...props} key={option.id}>
                          <Stack spacing={0.2}>
                            <Typography variant="body2" fontWeight={600}>
                              {formatBudgetItemLabel(option) || "-"}
                            </Typography>
                            {meta && (
                              <Typography variant="caption" color="text.secondary">
                                {meta}
                              </Typography>
                            )}
                          </Stack>
                        </li>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField {...params} label="Bütçe Kalemi / Plan" required fullWidth />
                    )}
                  />
                </Grid>
                {isNewBudgetMode && !editingPlan && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      Yeni bütçe kalemi oluşturulacak. Bütçe adı, departman, Capex/Opex ve nitelik
                      alanlarını doldurun.
                    </Alert>
                  </Grid>
                )}
                {isNewBudgetMode && !editingPlan && (
                  <Grid item xs={12} md={8}>
                    <TextField
                      label="Yeni Bütçe Adı"
                      value={formBudgetItemText}
                      onChange={(event) => setFormBudgetItemText(event.target.value)}
                      required
                      fullWidth
                    />
                  </Grid>
                )}
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Yıl"
                    name="year"
                    type="number"
                    value={formYear}
                    onChange={(event) => {
                      const nextYear = event.target.value ? Number(event.target.value) : currentYear;
                      setFormYear(nextYear);
                      setFormScenarioId(findDefaultScenarioForYear(nextYear)?.id ?? "");
                    }}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Ay"
                    name="month"
                    defaultValue={editingPlan?.month ?? 1}
                    required
                    fullWidth
                  >
                    {monthOptions.map((label, index) => (
                      <MenuItem key={label} value={index + 1}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Senaryo"
                    name="scenario_id"
                    value={formScenarioSelectValue}
                    onChange={(event) =>
                      setFormScenarioId(event.target.value ? Number(event.target.value) : "")
                    }
                    required={formScenarioOptions.length > 0}
                    helperText={
                      formScenarioOptions.length === 0
                        ? `Temel (${formYear}) senaryosu kaydet sırasında oluşturulacak.`
                        : undefined
                    }
                    fullWidth
                  >
                    {formScenarioOptions.length === 0 && (
                      <MenuItem value="" disabled>
                        Temel ({formYear}) oluşturulacak
                      </MenuItem>
                    )}
                    {formScenarioOptions.map((scenario) => (
                      <MenuItem key={scenario.id} value={scenario.id}>
                        {scenario.name} ({scenario.year})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Departman"
                    name="department"
                    value={formDepartment}
                    onChange={(event) => setFormDepartment(event.target.value)}
                    required={!editingPlan && !formBudgetItemId}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Capex/Opex"
                    name="map_category"
                    value={formMapCategory}
                    onChange={(event) => setFormMapCategory(event.target.value)}
                    required={!editingPlan && !formBudgetItemId}
                    disabled={Boolean(editingPlan)}
                    fullWidth
                  >
                    <MenuItem value="">Seçiniz</MenuItem>
                    <MenuItem value="capex">Capex</MenuItem>
                    <MenuItem value="opex">Opex</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Nitelik"
                    name="map_attribute"
                    value={formMapAttribute}
                    onChange={(event) => setFormMapAttribute(event.target.value)}
                    required={!editingPlan && !formBudgetItemId}
                    disabled={Boolean(editingPlan)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Tutar"
                    name="amount"
                    type="text"
                    inputProps={{ inputMode: "decimal" }}
                    fullWidth
                    defaultValue={editingPlan?.amount ?? ""}
                    required
                  />
                </Grid>
                {editingPlan && Number(editingPlan.unused_amount ?? 0) > 0 && (
                  <Grid item xs={12} md={4}>
                    <TextField
                      select
                      label="Kullanılmayacak Sebebi"
                      value={formUnusedReason}
                      onChange={(event) => setFormUnusedReason(event.target.value)}
                      helperText={!formUnusedReason ? "Sebep belirtilmemiş" : undefined}
                      fullWidth
                    >
                      <MenuItem value="">
                        <em>Sebep belirtilmemiş</em>
                      </MenuItem>
                      {UNUSED_REASON_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}
                {editingPlan && Number(editingPlan.unused_amount ?? 0) > 0 && (
                  <Grid item xs={12} md={8}>
                    <TextField
                      label="Kullanılmayacak Notu"
                      value={formUnusedNote}
                      onChange={(event) => setFormUnusedNote(event.target.value)}
                      multiline
                      minRows={2}
                      inputProps={{ maxLength: 500 }}
                      helperText={`${formUnusedNote.length}/500 · İsteğe bağlı açıklama ekleyebilirsiniz`}
                      fullWidth
                    />
                  </Grid>
                )}
                {!editingPlan && (
                  <Grid item xs={12} md={4}>
                    <TextField
                      select
                      label="Aynı plan varsa"
                      name="merge_mode"
                      value={formMergeMode}
                      onChange={(event) =>
                        setFormMergeMode(event.target.value as "merge" | "separate")
                      }
                      fullWidth
                    >
                      <MenuItem value="merge">Mevcut plana ekle</MenuItem>
                      <MenuItem value="separate">Ayrı satır oluştur</MenuItem>
                    </TextField>
                  </Grid>
                )}
                {!editingPlan && (
                  <Grid item xs={12}>
                    <TextField label="Açıklama / Not" name="description" fullWidth />
                  </Grid>
                )}
              </Grid>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
            <Button onClick={() => setDialogOpen(false)}>Vazgeç</Button>
            <Button type="submit" variant="contained" disabled={mutation.isPending}>
              Kaydet
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(purchaseRevertPlan)}
        onClose={() => {
          if (!purchaseRevertMutation.isPending) setPurchaseRevertPlan(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Talep durumu geri alınsın mı?</DialogTitle>
        <DialogContent>
          <Typography>
            Bu bütçe kalemi tekrar Satın Alma Bekleyen durumuna alınacaktır. Harcama ve fatura
            kayıtları etkilenmeyecektir.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPurchaseRevertPlan(null)}
            disabled={purchaseRevertMutation.isPending}
          >
            Vazgeç
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (purchaseRevertPlan) purchaseRevertMutation.mutate(purchaseRevertPlan.id);
            }}
            disabled={!purchaseRevertPlan || purchaseRevertMutation.isPending}
          >
            Talebi Geri Al
          </Button>
        </DialogActions>
      </Dialog>
      <UnusedBudgetDialog
        planId={unusedDialogPlan?.id ?? null}
        onClose={() => setUnusedDialogPlan(null)}
        onSuccess={(message) => setToast({ message, severity: "success" })}
      />
      <Dialog
        open={false}
        onClose={() => setUnusedDialogPlan(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Kullanılmayacak Tutar</DialogTitle>
        <form onSubmit={handleUnusedSubmit}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              {unusedError && <Alert severity="error">{unusedError}</Alert>}
              {unusedDialogPlan && (
                <Alert severity="info">
                  {getPlanDisplayValues(unusedDialogPlan).budgetLabel} ·{" "}
                  {unusedDialogPlan.year} {monthOptions[(unusedDialogPlan.month ?? 1) - 1]}
                </Alert>
              )}
              <Grid container spacing={1.5}>
                {[
                  {
                    label: "Plan Bütçe",
                    value: formatCurrency(Number(unusedDialogPlan?.revised_amount ?? unusedDialogPlan?.amount ?? 0))
                  },
                  {
                    label: "Gerçekleşen Harcama",
                    value: formatCurrency(
                      Number(unusedDialogPlan?.scope_actual_amount ?? unusedDialogPlan?.actual_amount ?? 0)
                    )
                  },
                  {
                    label: "Mevcut Kullanılmayacak",
                    value: formatCurrency(Number(unusedDialogPlan?.unused_amount ?? 0))
                  },
                  {
                    label: "Kalan Kullanılabilir Bütçe",
                    value: formatCurrency(
                      Number(unusedDialogPlan?.scope_available_amount ?? unusedDialogPlan?.available_amount ?? 0)
                    )
                  }
                ].map((item) => (
                  <Grid item xs={12} sm={6} key={item.label}>
                    <Box
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 1.25,
                        bgcolor: "background.default"
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {item.label}
                      </Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {item.value}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <TextField
                label="Kullanılmayacak Tutar"
                type="text"
                inputProps={{ inputMode: "decimal" }}
                value={unusedAmount}
                onChange={(event) => setUnusedAmount(event.target.value)}
                required
                fullWidth
                helperText="Varsayılan olarak kalan kullanılabilir bütçe gelir; daha düşük tutar girebilirsiniz."
              />
              <Button
                variant="outlined"
                onClick={() => {
                  const maximum = Number(unusedDialogPlan?.unused_amount ?? 0) + Number(
                    unusedDialogPlan?.scope_available_amount ?? unusedDialogPlan?.available_amount ?? 0
                  );
                  setUnusedAmount(String(maximum));
                  setUnusedError(null);
                }}
                sx={{ alignSelf: "flex-start" }}
              >
                Tamamı
              </Button>
              <TextField
                select
                label="Sebep"
                value={unusedReason}
                onChange={(event) => setUnusedReason(event.target.value)}
                fullWidth
              >
                {unusedReasonOptions.map((reason) => (
                  <MenuItem key={reason} value={reason}>
                    {reason}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Açıklama"
                value={unusedNote}
                onChange={(event) => setUnusedNote(event.target.value)}
                multiline
                minRows={3}
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
            <Button onClick={() => setUnusedDialogPlan(null)}>Vazgeç</Button>
            <Button type="submit" variant="contained" disabled={unusedMutation.isPending}>
              Kaydet
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Bütçe Aktarımı</DialogTitle>
        <form onSubmit={handleTransferSubmit}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2.5}>
              {transferError && <Alert severity="error">{transferError}</Alert>}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Autocomplete
                    options={budgetItems ?? []}
                    value={budgetItems?.find((item) => item.id === transferSourceBudgetItemId) ?? null}
                    onChange={(_, value) => setTransferSourceBudgetItemId(value?.id ?? null)}
                    getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                    filterOptions={budgetFilterOptions}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    renderInput={(params) => (
                      <TextField {...params} label="Kaynak Bütçe Kalemi" required fullWidth />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Autocomplete
                    options={budgetItems ?? []}
                    value={budgetItems?.find((item) => item.id === transferTargetBudgetItemId) ?? null}
                    onChange={(_, value) => setTransferTargetBudgetItemId(value?.id ?? null)}
                    getOptionLabel={(option) => formatBudgetItemLabel(option) || "-"}
                    filterOptions={budgetFilterOptions}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    renderInput={(params) => (
                      <TextField {...params} label="Hedef Bütçe Kalemi" required fullWidth />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Kaynak Ay"
                    value={transferSourceMonth}
                    onChange={(event) => setTransferSourceMonth(Number(event.target.value))}
                    required
                    fullWidth
                  >
                    {monthOptions.map((label, index) => (
                      <MenuItem key={label} value={index + 1}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Alert severity="info">
                    Kaynak yıl ve kaynak senaryo mevcut Plan Yönetimi filtrelerinden alınır:{" "}
                    {transferSourceYear} / {scenarioById.get(transferSourceScenarioId ?? 0)?.name ?? "-"}
                  </Alert>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Hedef Yıl"
                    type="number"
                    value={transferTargetYear}
                    onChange={(event) => setTransferTargetYear(Number(event.target.value) || currentYear)}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Hedef Ay"
                    value={transferTargetMonth}
                    onChange={(event) => setTransferTargetMonth(Number(event.target.value))}
                    required
                    fullWidth
                  >
                    {monthOptions.map((label, index) => (
                      <MenuItem key={label} value={index + 1}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="Hedef Senaryo"
                    value={transferTargetScenarioId ?? ""}
                    onChange={(event) =>
                      setTransferTargetScenarioId(event.target.value ? Number(event.target.value) : null)
                    }
                    required
                    fullWidth
                  >
                    {scenarios?.map((scenario) => (
                      <MenuItem key={scenario.id} value={scenario.id}>
                        {scenario.name} ({scenario.year})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Aktarım Tutarı"
                    type="text"
                    inputProps={{ inputMode: "decimal" }}
                    value={transferAmount}
                    onChange={(event) => setTransferAmount(event.target.value)}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField
                    label="Aktarım Nedeni"
                    value={transferReason}
                    onChange={(event) => setTransferReason(event.target.value)}
                    required
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12}>
                  <Alert severity="info">
                    Kaynak toplam bütçe: {formatCurrency(transferAvailable?.revised_amount ?? 0)} ·
                    Gerçekleşen: {formatCurrency(transferAvailable?.actual_amount ?? 0)} ·
                    Kullanılmayacak: {formatCurrency(transferAvailable?.unused_amount ?? 0)} ·
                    Kullanılabilir: {formatCurrency(transferAvailable?.available_amount ?? 0)}
                  </Alert>
                </Grid>
              </Grid>

              <Box>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Son Aktarımlar
                </Typography>
                <Stack spacing={1}>
                  {recentTransfers.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Kayıt bulunamadı.
                    </Typography>
                  )}
                  {recentTransfers.map((transfer) => {
                    const sourceName =
                      transfer.source_budget_name ??
                      budgetItemById.get(transfer.source_budget_item_id)?.name ??
                      "-";
                    const targetName =
                      transfer.target_budget_name ??
                      budgetItemById.get(transfer.target_budget_item_id)?.name ??
                      "-";
                    const sourceScenario =
                      scenarioById.get(transfer.source_scenario_id)?.name ?? transfer.source_scenario_id;
                    const targetScenario =
                      scenarioById.get(transfer.target_scenario_id)?.name ?? transfer.target_scenario_id;
                    return (
                      <Box
                        key={transfer.id}
                        sx={{
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1,
                          p: 1.25
                        }}
                      >
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          spacing={1}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {formatCurrency(Number(transfer.amount) || 0)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {stripBudgetCode(sourceName)} ({transfer.source_year} {monthOptions[transfer.source_month - 1]}, {sourceScenario}) →{" "}
                              {stripBudgetCode(targetName)} ({transfer.target_year} {monthOptions[transfer.target_month - 1]}, {targetScenario})
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {transfer.reason}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleCancelTransfer(transfer)}
                            disabled={!user?.is_admin || cancelTransferMutation.isPending}
                          >
                            İptal Et
                          </Button>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
            <Button onClick={() => setTransferDialogOpen(false)}>Vazgeç</Button>
            <Button type="submit" variant="contained" disabled={transferMutation.isPending}>
              Aktar
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Snackbar
        open={Boolean(listError)}
        autoHideDuration={5000}
        onClose={() => setListError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="error" onClose={() => setListError(null)} sx={{ width: "100%" }}>
          {listError}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity={toast?.severity ?? "success"} onClose={() => setToast(null)} sx={{ width: "100%" }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
