import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  content?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: "primary" | "warning" | "error";
  loading?: boolean;
  irreversible?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  content,
  confirmLabel = "Onayla",
  cancelLabel = "İptal",
  severity = "primary",
  loading = false,
  irreversible = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={() => !loading && onCancel()} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {message && <Typography>{message}</Typography>}
          {content}
          {irreversible && (
            <Alert severity="error" variant="outlined">
              <Typography fontWeight={750}>Bu işlem geri alınamaz.</Typography>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={loading} onClick={onCancel}>{cancelLabel}</Button>
        <Button
          variant="contained"
          color={severity}
          disabled={loading}
          onClick={onConfirm}
        >
          {loading ? "İşleniyor…" : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
