"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional second line under the label. */
  hint?: string;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** Accessible name; also used for the listbox label. */
  ariaLabel: string;
  id?: string;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  /** Compact trigger for toolbars and table rows. */
  size?: "md" | "sm";
  /** Adds a filter box at the top of the menu. Defaults to on for long lists. */
  searchable?: boolean;
  className?: string;
};

const SEARCHABLE_FROM = 10;

/**
 * The app's own dropdown, used everywhere a native <select> would be. Keyboard: Space/Enter/ArrowDown
 * open, arrows move, Enter picks, Escape closes, typing filters when the list is searchable. The menu
 * opens upward when there is not enough room below the trigger.
 */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  placeholder = "Choose an option",
  disabled = false,
  size = "md",
  searchable,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value) ?? null;
  const canSearch = searchable ?? options.length >= SEARCHABLE_FROM;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle));
  }, [options, query]);

  // Reset the filter and highlight the current value each time the menu opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    setActive(index);
    if (canSearch) searchInput.current?.focus();
  }, [canSearch, open, options, value]);

  // Close on outside pointer down (capture, so canvases that stop propagation cannot keep it open).
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [open]);

  // Flip upward when the menu would run past the bottom of the viewport.
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    const needed = Math.min(300, 44 * Math.min(visible.length, 6) + (canSearch ? 60 : 16));
    setOpensUp(rect.bottom + needed > window.innerHeight && rect.top > needed);
  }, [canSearch, open, visible.length]);

  // Keep the highlighted option in view while moving with the keyboard.
  useEffect(() => {
    if (!open) return;
    const node = menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const move = (delta: number) => {
    if (!visible.length) return;
    let next = active;
    for (let step = 0; step < visible.length; step += 1) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next]?.disabled) break;
    }
    setActive(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(Math.max(0, visible.length - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (visible[active]) pick(visible[active]);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  // When the filter changes, keep the highlight on something visible.
  useEffect(() => {
    if (active >= visible.length) setActive(0);
  }, [active, visible.length]);

  const classes = ["spaghetti-select", size === "sm" ? "is-sm" : "", open ? "is-open" : "", opensUp ? "opens-up" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        className="spaghetti-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "is-placeholder"}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="spaghetti-select-menu" ref={menu}>
          {canSearch ? (
            <label className="spaghetti-select-search">
              <Search size={13} aria-hidden="true" />
              <input
                ref={searchInput}
                value={query}
                placeholder="Type to filter…"
                aria-label={`Filter ${ariaLabel} options`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </label>
          ) : null}
          <div className="spaghetti-select-list" role="listbox" id={listId} aria-label={`${ariaLabel} options`}>
            {visible.length === 0 ? <p className="spaghetti-select-empty">No matches</p> : null}
            {visible.map((option, index) => (
              <button
                className={`spaghetti-select-option${index === active ? " is-active" : ""}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-index={index}
                title={option.label}
                key={`${option.value}-${index}`}
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option)}
              >
                <span>
                  {option.label}
                  {option.hint ? <small>{option.hint}</small> : null}
                </span>
                {option.value === value ? <Check size={14} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
