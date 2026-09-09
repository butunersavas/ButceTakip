import { useEffect, useState } from "react";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useAuthorizedClient from "../../hooks/useAuthorizedClient";
import { formatCurrency } from "../../utils/currency";
import { normalizeUnusedReason, UNUSED_REASON_OPTIONS } from "../../utils/unusedReason";

type Mode = "current_month" | "all_remaining" | "custom" | "reason_only";
type Options = {
  plan_id: number; budget_name?: string | null; total_budget: number; spent_amount: number;
  unused_amount: number; current_month_available: number; total_remaining_available: number;
  unused_reason?: string | null; unused_note?: string | null;
};

export default function UnusedBudgetDialog({ planId, onClose, onSuccess }: {
  planId: number | null; onClose: () => void; onSuccess?: (message: string) => void;
}) {
  const client = useAuthorizedClient();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("current_month");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (planId) { setMode("current_month"); setAmount(""); setReason(""); setNote(""); setError(null); }
  }, [planId]);

  const options = useQuery<Options>({
    queryKey: ["unused-options", planId], enabled: Boolean(planId),
    queryFn: async () => (await client.get(`/plans/${planId}/unused-options`)).data
  });
  const mutation = useMutation({
    mutationFn: () => client.post(`/plans/${planId}/unused-apply`, {
      mode, amount: mode === "custom" ? Number(amount.replace(",", ".")) : undefined,
      reason, note: note.trim() || null
    }),
    onSuccess: () => {
      ["plans", "expenses", "pending-budget-actions", "purchase-pending", "dashboard"].forEach(
        (key) => queryClient.invalidateQueries({ queryKey: [key] })
      );
      onSuccess?.(mode === "reason_only" ? "Kullanılmayacak sebebi ve notu güncellendi." : "Kullanılmayacak bütçe kaydedildi.");
      onClose();
    },
    onError: (e: any) => setError(String(e?.response?.data?.detail ?? "İşlem tamamlanamadı."))
  });
  const data = options.data;
  useEffect(() => {
    if (data) {
      setReason(normalizeUnusedReason(data.unused_reason));
      setNote(data.unused_note ?? "");
      if (data.unused_amount > 0) setMode("reason_only");
    }
  }, [data]);

  const submit = () => {
    if (!reason) { setError("Kullanılmayacak sebebi seçiniz."); return; }
    if (note.length > 500) { setError("Not en fazla 500 karakter olabilir."); return; }
    if (mode === "custom") {
      const value = Number(amount.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) { setError("Kullanılmayacak tutar 0'dan büyük olmalı."); return; }
      if (data && value > data.current_month_available + .005) {
        setError(`Kullanılmayacak tutar kalan kullanılabilir bütçeden fazla olamaz. Maksimum tutar: ${formatCurrency(data.current_month_available)}`); return;
      }
    }
    mutation.mutate();
  };

  return <Dialog open={Boolean(planId)} onClose={() => !mutation.isPending && onClose()} fullWidth maxWidth="sm">
    <DialogTitle>Kullanılmayacak Bütçe</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {options.isLoading ? <CircularProgress size={24} /> : data && <>
        <Stack spacing={.5}>
          <Typography><b>Bütçe Kalemi:</b> {data.budget_name || "-"}</Typography>
          <Typography><b>Toplam Bütçe:</b> {formatCurrency(data.total_budget)}</Typography>
          <Typography><b>Harcanan:</b> {formatCurrency(data.spent_amount)}</Typography>
          <Typography><b>Kullanılmayacak:</b> {formatCurrency(data.unused_amount)}</Typography>
          <Typography><b>Kalan Kullanılabilir:</b> {formatCurrency(data.total_remaining_available)}</Typography>
        </Stack>
        <RadioGroup value={mode} onChange={(e) => { setMode(e.target.value as Mode); setError(null); }}>
          {data.unused_amount > 0 && <FormControlLabel value="reason_only" control={<Radio />} label="Yalnızca kullanılmayacak sebebi ve notu güncelle" />}
          <FormControlLabel value="current_month" control={<Radio />} label={`Bu Ayın Kalanını Kullanılmayacak Yap (${formatCurrency(data.current_month_available)})`} />
          <FormControlLabel value="all_remaining" control={<Radio />} label={`Bütçenin Kalan Tamamını Kullanılmayacak Yap (${formatCurrency(data.total_remaining_available)})`} />
          <FormControlLabel value="custom" control={<Radio />} label="Özel Tutar" />
        </RadioGroup>
        {mode === "custom" && <TextField autoFocus label="Kullanılmayacak Tutar" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} inputProps={{ inputMode: "decimal" }} helperText={`Bu ay için en fazla ${formatCurrency(data.current_month_available)}`} />}
        <TextField select required label="Kullanılmayacak Sebebi" value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }}>
          <MenuItem value=""><em>Seçiniz</em></MenuItem>
          {UNUSED_REASON_OPTIONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField multiline minRows={2} label="Not" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 500 }} helperText={`${note.length}/500 · İsteğe bağlı açıklama ekleyebilirsiniz`} />
      </>}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={mutation.isPending}>Vazgeç</Button><Button variant="contained" onClick={submit} disabled={!data || mutation.isPending}>{mutation.isPending ? <CircularProgress size={18} /> : "Kaydet"}</Button></DialogActions>
  </Dialog>;
}
