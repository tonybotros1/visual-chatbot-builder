"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  input?: { label: string; type?: "text" | "password"; minLength?: number };
  select?: { label: string; options: { value: string; label: string }[] };
};

type Pending = { options: ConfirmOptions; resolve: (value: boolean | string) => void };

/** Promise-based themed dialog. Resolves false on cancel, true on plain confirm, or the entered/selected value. */
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
    <dialog ref={dialogRef} className={`app-dialog${pending.options.danger ? " is-danger" : ""}`} onCancel={(event) => { event.preventDefault(); finish(false); }} onClick={(event) => { if (event.target === dialogRef.current) finish(false); }}>
      <form className="app-dialog-panel" onSubmit={submit}>
        <h2>{pending.options.title}</h2>
        {pending.options.message ? <p className="muted">{pending.options.message}</p> : null}
        {pending.options.input ? (
          <label>{pending.options.input.label}<input autoFocus required type={pending.options.input.type ?? "text"} minLength={pending.options.input.minLength} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        ) : null}
        {pending.options.select ? (
          <label>{pending.options.select.label}
            <select autoFocus value={value} onChange={(event) => setValue(event.target.value)}>
              {pending.options.select.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
        <div className="form-actions">
          <button type="button" className="secondary-button" autoFocus={pending.options.danger} onClick={() => finish(false)}>Cancel</button>
          <button type="submit" className={pending.options.danger ? "danger-button" : "primary-button"}>{pending.options.confirmLabel ?? "Confirm"}</button>
        </div>
      </form>
    </dialog>
  ) : null;

  return { confirm, dialog };
}
