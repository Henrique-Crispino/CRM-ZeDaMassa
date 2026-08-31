"use client";

import { useEffect, type ReactNode } from "react";
import { Search } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { Button, cn } from "./ui";

export function SearchField({
  value,
  onChange,
  placeholder = "Buscar produto...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-stone-300 bg-white py-3.5 pl-12 pr-4 text-lg outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
      />
    </label>
  );
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={value === option.id ? "primary" : "ghost"}
          className="min-h-11 shrink-0 text-base"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function CompactRow({
  title,
  hint,
  selected,
  children,
}: {
  title: string;
  hint?: string;
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-2.5",
        selected && "bg-orange-50",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-extrabold text-stone-900">{title}</p>
        {hint ? <p className="text-sm font-semibold text-stone-500">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function CompactGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="bg-stone-100 px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-stone-500">
        {title}
      </p>
      {children}
    </div>
  );
}

export function CompactList({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200">{children}</div>;
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-100 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur md:left-60 [.shell-turno_&]:bottom-16 md:[.shell-turno_&]:bottom-0">
      <div className="mx-auto max-w-6xl space-y-2">{children}</div>
    </div>
  );
}

export function BottomSheet({
  open,
  title,
  hint,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl bg-white shadow-xl [.shell-turno_&]:bottom-16"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-orange-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="sheet-title" className="text-2xl font-extrabold text-stone-900">
                {title}
              </h2>
              {hint ? <p className="mt-1 text-stone-600">{hint}</p> : null}
            </div>
            <Button type="button" variant="ghost" className="shrink-0 px-3" aria-label="Fechar" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  hint,
  children,
  confirmLabel,
  cancelLabel = "Voltar",
  confirmVariant = "primary",
  confirmDisabled,
  confirmHidden,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  hint?: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "secondary" | "danger";
  confirmDisabled?: boolean;
  confirmHidden?: boolean;
  busy?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-3xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-2xl font-extrabold text-stone-900">{title}</h2>
        {hint ? <p className="mt-1 text-stone-600">{hint}</p> : null}
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex flex-wrap gap-3">
          {!confirmHidden && confirmLabel ? (
            <Button
              className="flex-1"
              variant={confirmVariant}
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
            >
              {busy ? "Salvando..." : confirmLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className={confirmHidden ? "w-full" : "flex-1"}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function matchesSearch(label: string, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

export type PickKind = "todos" | Category | "pedido";

export function pickKindOptions(selectedCount: number): { id: PickKind; label: string }[] {
  return [
    { id: "todos", label: "Tudo" },
    ...CATEGORIES.map((item) => ({ id: item.id, label: item.label })),
    { id: "pedido", label: selectedCount ? `Escolhidos (${selectedCount})` : "Escolhidos" },
  ];
}

export function matchesKind(category: string, kind: PickKind, selected = false) {
  if (kind === "todos") return true;
  if (kind === "pedido") return selected;
  return category === kind;
}
