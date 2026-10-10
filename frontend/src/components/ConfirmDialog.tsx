import { useEffect, useId, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Themed, accessible confirmation dialog. Replaces browser-native
    window.confirm: keyboard-trapped focus, Escape-to-cancel, `alertdialog`
    semantics and focus restored to the trigger on close. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const lastFocused = useRef<HTMLElement | null>(null);
  const onConfirmRef = useRef(onConfirm);
  const onCancelRef = useRef(onCancel);
  onConfirmRef.current = onConfirm;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 bg-black/70"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="panel-glass relative w-full max-w-md rounded-xl p-5 shadow-panel outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold text-ink-primary">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {children}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-base-700/60 bg-space-800/70 px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? "rounded-lg bg-accent-red/15 px-4 py-2 text-sm font-semibold text-accent-red ring-1 ring-inset ring-accent-red/40 transition-colors hover:bg-accent-red/25"
                : "rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-space-950 shadow-glow-soft transition-colors hover:bg-cyan-soft"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}