"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { useDialogStore } from "@/stores/dialog-store";

/**
 * Renders queued confirm/prompt/alert dialogs in a native modal <dialog>, which supplies
 * the top layer, focus containment, inert background, and Escape-to-cancel behavior.
 */
export function DialogHost() {
  const active = useDialogStore((state) => state.queue[0]);
  const dismiss = useDialogStore((state) => state.dismiss);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const titleId = useId();
  const messageId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !active) return;
    settled.current = false;
    setValue(active.kind === "prompt" ? active.options.defaultValue ?? "" : "");
    setError("");
    if (!dialog.open) dialog.showModal();
    // Destructive confirmations focus Cancel so a stray Enter never deletes anything.
    requestAnimationFrame(() => {
      if (active.kind === "prompt") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (active.kind === "confirm" && active.options.tone === "danger") {
        cancelRef.current?.focus();
      } else {
        confirmRef.current?.focus();
      }
    });
  }, [active]);

  if (!active) return null;

  const finish = (accepted: boolean) => {
    if (settled.current) return;
    if (active.kind === "prompt" && accepted) {
      const trimmed = value.trim();
      const problem = active.options.validate?.(trimmed) ?? null;
      if (problem) {
        setError(problem);
        inputRef.current?.focus();
        return;
      }
      settled.current = true;
      active.resolve(trimmed);
    } else {
      settled.current = true;
      if (active.kind === "confirm") active.resolve(accepted);
      else if (active.kind === "prompt") active.resolve(null);
      else active.resolve();
    }
    dialogRef.current?.close();
    dismiss();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    finish(true);
  };

  // Keep Escape inside the dialog so drawers and canvases underneath do not also react to it.
  const isolateKeys = (event: KeyboardEvent) => {
    if (event.key === "Escape") event.stopPropagation();
  };

  const { options } = active;
  const danger = active.kind === "confirm" && active.options.tone === "danger";
  const confirmLabel = options.confirmLabel ?? (active.kind === "alert" ? "OK" : active.kind === "prompt" ? "Save" : "Confirm");

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog${danger ? " is-danger" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={options.message ? messageId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
      onKeyDown={isolateKeys}
      onClick={(event) => {
        // A click on the ::backdrop targets the dialog element itself.
        if (event.target === dialogRef.current) finish(false);
      }}
    >
      <form className="app-dialog-panel" onSubmit={submit} noValidate>
        <div className="app-dialog-heading">
          {danger ? (
            <span className="app-dialog-icon" aria-hidden="true">
              <AlertTriangle size={18} strokeWidth={2.2} />
            </span>
          ) : null}
          <h2 id={titleId}>{options.title}</h2>
        </div>
        {options.message ? <p id={messageId} className="app-dialog-message">{options.message}</p> : null}
        {active.kind === "prompt" ? (
          <label className="app-dialog-field">
            <span>{active.options.label}</span>
            <input
              ref={inputRef}
              type={active.options.inputType ?? "text"}
              value={value}
              placeholder={active.options.placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError("");
              }}
            />
            {error ? <span id={errorId} className="app-dialog-error" role="alert">{error}</span> : null}
          </label>
        ) : null}
        <div className="app-dialog-actions">
          {active.kind !== "alert" ? (
            <button ref={cancelRef} type="button" className="secondary-button" onClick={() => finish(false)}>
              {options.cancelLabel ?? "Cancel"}
            </button>
          ) : null}
          <button ref={confirmRef} type="submit" className={danger ? "app-dialog-danger" : "primary-button"}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
