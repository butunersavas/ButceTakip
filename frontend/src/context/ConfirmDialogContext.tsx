import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import ConfirmDialog from "../components/common/ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: "primary" | "warning" | "error";
  irreversible?: boolean;
}

type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const ConfirmDialogContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const pendingRef = useRef<ConfirmRequest | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const nextRequest = { ...options, resolve };
    pendingRef.current = nextRequest;
    setRequest(nextRequest);
  }), []);

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setRequest(null);
    current?.resolve(confirmed);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={Boolean(request)}
        title={request?.title ?? "Onay"}
        message={request?.message}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        severity={request?.severity}
        irreversible={request?.irreversible}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) throw new Error("useConfirmDialog, ConfirmDialogProvider içinde kullanılmalıdır.");
  return context;
}
