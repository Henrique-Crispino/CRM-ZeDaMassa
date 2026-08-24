"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button, cn } from "@/components/ui";

export function usePager<T>(items: T[], size = 8, resetKey?: string | number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return {
    page: current,
    pages,
    size,
    total: items.length,
    setPage,
    rows: items.slice(start, start + size),
  };
}

function pageWindow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const picks = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) {
    picks.add(2);
    picks.add(3);
    picks.add(4);
  }
  if (page >= pages - 2) {
    picks.add(pages - 3);
    picks.add(pages - 2);
    picks.add(pages - 1);
  }

  const sorted = [...picks].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (typeof last === "number" && n - last > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

function numberSlots(page: number, pages: number): Array<number | "gap" | null> {
  const win = pageWindow(page, pages);
  const slots: Array<number | "gap" | null> = [...win];
  while (slots.length < 7) slots.push(null);
  return slots;
}

const btnBox = "h-12 min-h-12 max-h-12 shrink-0 px-0 text-sm sm:text-base";
const navBtn = cn(btnBox, "w-[8.75rem] min-w-[8.75rem] max-w-[8.75rem]");
const numBtn = cn(btnBox, "w-12 min-w-12 max-w-12");

export function PageBoard({
  size,
  cols = 1,
  rowMin = "6.5rem",
  className,
  children,
}: {
  size: number;
  cols?: 1 | 2;
  rowMin?: string;
  className?: string;
  children: ReactNode;
}) {
  const count = Children.count(children);
  const pads = Math.max(0, size - count);
  return (
    <div className={cn("grid w-full gap-3", cols === 2 && "lg:grid-cols-2", className)}>
      {children}
      {Array.from({ length: pads }, (_, index) => (
        <div
          key={`pad-${index}`}
          aria-hidden
          className="pointer-events-none invisible rounded-3xl ring-1 ring-transparent"
          style={{ minHeight: rowMin }}
        />
      ))}
    </div>
  );
}

export function Pager({
  page,
  pages,
  total,
  onPage,
  word = "itens",
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  word?: string;
}) {
  if (total <= 0 || pages <= 1) return null;
  return (
    <nav
      className="mt-4 flex min-h-12 w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Paginação"
    >
      <p className="min-w-[12rem] font-semibold text-stone-600">
        {total} {word}. Página {page} de {pages}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className={navBtn}
          disabled={page <= 1}
          aria-label="Primeira página"
          onClick={() => onPage(1)}
        >
          <ChevronsLeft className="size-5 shrink-0" />
          Primeira
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={navBtn}
          disabled={page <= 1}
          aria-label="Página anterior"
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-5 shrink-0" />
          Anterior
        </Button>
        {numberSlots(page, pages).map((item, index) =>
          item === "gap" ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center font-extrabold text-stone-400"
            >
              …
            </span>
          ) : item == null ? (
            <span key={`empty-${index}`} className="inline-flex h-12 w-12 shrink-0" aria-hidden />
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "primary" : "ghost"}
              className={numBtn}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Página ${item}`}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="ghost"
          className={navBtn}
          disabled={page >= pages}
          aria-label="Próxima página"
          onClick={() => onPage(page + 1)}
        >
          Próxima
          <ChevronRight className="size-5 shrink-0" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={navBtn}
          disabled={page >= pages}
          aria-label="Última página"
          onClick={() => onPage(pages)}
        >
          Última
          <ChevronsRight className="size-5 shrink-0" />
        </Button>
      </div>
    </nav>
  );
}
