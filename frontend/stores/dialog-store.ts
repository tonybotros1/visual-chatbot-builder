import { create } from "zustand";

type DialogBase = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type ConfirmDialogOptions = DialogBase & { tone?: "default" | "danger" };

export type PromptDialogOptions = DialogBase & {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "url";
  /** Return an error message to keep the dialog open, or null to accept the value. */
  validate?: (value: string) => string | null;
};

export type AlertDialogOptions = DialogBase;

export type ActiveDialog =
  | { kind: "confirm"; options: ConfirmDialogOptions; resolve: (result: boolean) => void }
  | { kind: "prompt"; options: PromptDialogOptions; resolve: (result: string | null) => void }
  | { kind: "alert"; options: AlertDialogOptions; resolve: () => void };

type DialogState = {
  queue: ActiveDialog[];
  enqueue: (dialog: ActiveDialog) => void;
  dismiss: () => void;
};

export const useDialogStore = create<DialogState>((set) => ({
  queue: [],
  enqueue: (dialog) => set((state) => ({ queue: [...state.queue, dialog] })),
  dismiss: () => set((state) => ({ queue: state.queue.slice(1) })),
}));

/** Themed, accessible replacement for window.confirm. Resolves true only on explicit confirmation. */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => useDialogStore.getState().enqueue({ kind: "confirm", options, resolve }));
}

/** Themed replacement for window.prompt. Resolves the trimmed value, or null when cancelled. */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => useDialogStore.getState().enqueue({ kind: "prompt", options, resolve }));
}

/** Themed replacement for window.alert. */
export function alertDialog(options: AlertDialogOptions): Promise<void> {
  return new Promise((resolve) => useDialogStore.getState().enqueue({ kind: "alert", options, resolve }));
}

export function confirmNodeDeletion(nodeLabel: string): Promise<boolean> {
  return confirmDialog({
    title: `Delete ${nodeLabel}?`,
    message: "Its connections will be removed too. This action cannot be undone.",
    confirmLabel: "Delete node",
    tone: "danger",
  });
}
