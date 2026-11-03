"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Select } from "@/components/ui/Select";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  input?: { label: string; type?: "text" | "password"; minLength?: number };
  select?: { label: string; options: { value: string; label: string }[] };
};

type Pending = { options: ConfirmOptions; resolve: (value: boolean | string) => void };

/** Promise-based themed dialog for the admin console: false on cancel, true on confirm, or the entered/selected value. */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean | string>((resolve) => {
    setValue(options.select?.options[0]?.value ?? "");
    setPending({ options, resolve });
  }), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  const finish = (accepted: boolean) => {
    if (!pending) return;
    const { options, resolve } = pending;
    if (!accepted) resolve(false);
    else if (options.input || options.select) resolve(value);
    else resolve(true);
    setPending(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    finish(true);
  };

  const dialog: ReactNode = pending ? (
    <dialog
      ref={dialogRef}
      className={`app-dialog${pending.options.danger ? " is-danger" : ""}`}
      onCancel={(event) => { event.preventDefault(); finish(false); }}
      onClick={(event) => { if (event.target === dialogRef.current) finish(false); }}
    >
      <form className="app-dialog-panel" onSubmit={submit}>
        <div className="app-dialog-heading"><h2>{pending.options.title}</h2></div>
        {pending.options.message ? <p className="app-dialog-message">{pending.options.message}</p> : null}
        {pending.options.input ? (
          <label className="app-dialog-field">{pending.options.input.label}<input autoFocus required type={pending.options.input.type ?? "text"} minLength={pending.options.input.minLength} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        ) : null}
        {pending.options.select ? (
          <label className="app-dialog-field">{pending.options.select.label}
            <Select ariaLabel={pending.options.select.label} value={value} options={pending.options.select.options} onChange={setValue} />
          </label>
        ) : null}
        <div className="app-dialog-actions">
          <button type="button" className="secondary-button" autoFocus={pending.options.danger} onClick={() => finish(false)}>Cancel</button>
          <button type="submit" className={pending.options.danger ? "app-dialog-danger" : "primary-button"}>{pending.options.confirmLabel ?? "Confirm"}</button>
        </div>
      </form>
    </dialog>
  ) : null;

  return { confirm, dialog };
}
