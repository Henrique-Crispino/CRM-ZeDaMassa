"use client";

import { Children, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button, cn } from "@/components/ui";

export function usePager<T>(items: T[], size = 8, resetKey?: string | number) {
  const [page, setPageState] = useState(1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pages = Math.max(1, Math.ceil(items.length / size));

  useEffect(() => {
    setPageState(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > pages) setPageState(pages);
  }, [page, pages]);

  function setPage(next: number) {
    setPageState(Math.min(pages, Math.max(1, next)));
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return {
    page: current,
    pages,
    size,
    total: items.length,
    setPage,
    listRef,
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

const navBtn =
  "w-10 min-w-8 max-w-12 shrink @[24rem]:w-11 @[52rem]:w-auto @[52rem]:min-w-[7.25rem] @[52rem]:max-w-none @[52rem]:shrink-0 @[52rem]:px-3";
const numBtn = "w-10 min-w-8 max-w-12 shrink @[24rem]:w-11";

export function PageBoard({
  size,
  cols = 1,
  rowMin = "6.5rem",
  className,
  children,
  ref,
}: {
  size: number;
  cols?: 1 | 2;
  rowMin?: string;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const count = Children.count(children);
  const pads = Math.max(0, size - count);
  return (
    <div ref={ref} className={cn("grid w-full scroll-mt-36 gap-3", cols === 2 && "lg:grid-cols-2", className)}>
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
    <nav className="@container mt-4 flex w-full flex-col items-center" aria-label="Paginação">
      <p className="w-full text-center font-semibold text-stone-600">
        {total} {word}. Página {page} de {pages}.
      </p>
      <div className="mx-auto mt-2 flex max-w-full min-w-0 flex-nowrap items-center justify-center gap-0.5 @[24rem]:gap-1">
        <Button
          type="button"
          variant="ghost"
          size="pager"
          className={navBtn}
          disabled={page <= 1}
          title="Primeira página"
          aria-label="Primeira página"
          onClick={() => onPage(1)}
        >
          <ChevronsLeft className="size-4 shrink-0 @[52rem]:size-5" />
          <span className="hidden @[52rem]:inline">Primeira</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="pager"
          className={navBtn}
          disabled={page <= 1}
          title="Página anterior"
          aria-label="Página anterior"
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="size-4 shrink-0 @[52rem]:size-5" />
          <span className="hidden @[52rem]:inline">Anterior</span>
        </Button>
        {pageWindow(page, pages).map((item, index) =>
          item === "gap" ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-11 w-4 shrink-0 items-center justify-center text-sm font-extrabold text-stone-400"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? "primary" : "ghost"}
              size="pager"
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
          size="pager"
          className={navBtn}
          disabled={page >= pages}
          title="Próxima página"
          aria-label="Próxima página"
          onClick={() => onPage(page + 1)}
        >
          <span className="hidden @[52rem]:inline">Próxima</span>
          <ChevronRight className="size-4 shrink-0 @[52rem]:size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="pager"
          className={navBtn}
          disabled={page >= pages}
          title="Última página"
          aria-label="Última página"
          onClick={() => onPage(pages)}
        >
          <span className="hidden @[52rem]:inline">Última</span>
          <ChevronsRight className="size-4 shrink-0 @[52rem]:size-5" />
        </Button>
      </div>
    </nav>
  );
}
