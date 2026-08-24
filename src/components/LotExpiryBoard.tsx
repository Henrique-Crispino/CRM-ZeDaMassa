"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, MapPin, Package } from "lucide-react";
import { PageBoard, Pager, usePager } from "@/components/pager";
import { Button, Card, cn } from "@/components/ui";
import { formatDate } from "@/lib/money";
import { expiryLevelLabel, type ExpiryAlert, type ExpiryLevel } from "@/lib/queries";

const GROUPS: { id: ExpiryLevel; title: string; hint: string }[] = [
  { id: "expired", title: "Já venceu", hint: "Não venda. Descarte para baixar o estoque." },
  { id: "today", title: "Vence hoje", hint: "Priorize na venda ou no envio." },
  { id: "soon", title: "Vence em breve", hint: "Ainda dá tempo. Este lote sai primeiro." },
];

function tone(level: ExpiryLevel) {
  if (level === "expired") {
    return {
      chip: "bg-red-600 text-white",
      card: "bg-red-50 ring-red-200",
      text: "text-red-800",
      icon: "text-red-600",
    };
  }
  if (level === "today") {
    return {
      chip: "bg-orange-600 text-white",
      card: "bg-orange-50 ring-orange-200",
      text: "text-orange-900",
      icon: "text-orange-600",
    };
  }
  return {
    chip: "bg-amber-500 text-white",
    card: "bg-amber-50 ring-amber-200",
    text: "text-amber-950",
    icon: "text-amber-600",
  };
}

export function LotExpiryBoard({
  items,
  compact = false,
  canDiscard = false,
  discarding = false,
  onDiscard,
  onDiscardAll,
}: {
  items: ExpiryAlert[];
  compact?: boolean;
  canDiscard?: boolean;
  discarding?: boolean;
  onDiscard?: (item: ExpiryAlert) => void;
  onDiscardAll?: (items: ExpiryAlert[]) => void;
}) {
  const expired = items.filter((item) => item.level === "expired");
  const counts = {
    expired: expired.length,
    today: items.filter((item) => item.level === "today").length,
    soon: items.filter((item) => item.level === "soon").length,
  };
  const expiredUnits = expired.reduce((sum, item) => sum + item.qty, 0);

  return (
    <section className={compact ? "mb-8" : "mb-6"}>
      {!compact ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold text-stone-900">Validade dos lotes</h2>
            <p className="mt-1 max-w-2xl text-lg text-stone-600">
              Só entra aqui o que ainda está no estoque e está vencido ou perto de vencer.
            </p>
          </div>
          {canDiscard && expired.length > 0 ? (
            <Button variant="danger" disabled={discarding} onClick={() => onDiscardAll?.(expired)}>
              {discarding ? "Descartando..." : `Descartar ${expiredUnits} vencidas`}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <SummaryChip label="Vencidos" value={counts.expired} hot={counts.expired > 0} tone="red" />
        <SummaryChip label="Vence hoje" value={counts.today} hot={counts.today > 0} tone="orange" />
        <SummaryChip label="Em breve" value={counts.soon} hot={counts.soon > 0} tone="amber" />
      </div>

      {items.length === 0 ? (
        <Card className="flex items-center gap-3 bg-emerald-50 ring-emerald-200">
          <CheckCircle2 className="size-8 shrink-0 text-emerald-700" />
          <div>
            <p className="text-lg font-extrabold text-emerald-900">Nenhum lote no prazo de alerta</p>
            <p className="text-stone-600">Os perecíveis em estoque ainda estão com validade folgada.</p>
          </div>
        </Card>
      ) : (
        <div className={compact ? "space-y-4" : "space-y-6"}>
          {GROUPS.map((group) => {
            const rows = items.filter((item) => item.level === group.id);
            if (rows.length === 0) return null;
            return (
              <ExpiryGroup
                key={group.id}
                group={group}
                rows={rows}
                compact={compact}
                canDiscard={Boolean(canDiscard)}
                discarding={Boolean(discarding)}
                onDiscard={onDiscard}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ExpiryGroup({
  group,
  rows,
  compact,
  canDiscard,
  discarding,
  onDiscard,
}: {
  group: (typeof GROUPS)[number];
  rows: ExpiryAlert[];
  compact: boolean;
  canDiscard: boolean;
  discarding: boolean;
  onDiscard?: (item: ExpiryAlert) => void;
}) {
  const look = tone(group.id);
  const page = usePager(rows, compact ? 4 : 6, `${group.id}:${rows.length}:${rows[0]?.lotId ?? ""}`);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xl font-extrabold text-stone-900">{group.title}</p>
          <p className="text-stone-600">{group.hint}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-extrabold", look.chip)}>
          {rows.length} {rows.length === 1 ? "lote" : "lotes"}
        </span>
      </div>
      <PageBoard
        ref={page.listRef}
        size={page.size}
        cols={compact ? 1 : 2}
        rowMin={compact ? "9.25rem" : "10.5rem"}
        className={compact ? "mt-0" : undefined}
      >
        {page.rows.map((item) => (
          <article
            key={`${item.locationId}-${item.lotId}`}
            className={cn("rounded-3xl p-4 shadow-sm ring-1", look.card)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-extrabold text-stone-900">{item.label}</p>
                <p className={cn("mt-1 text-sm font-bold", look.text)}>{expiryLevelLabel(item)}</p>
              </div>
              <p className="text-right">
                <span className="block text-2xl font-extrabold text-stone-900">{item.qty}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500">un.</span>
              </p>
            </div>
            <dl className="mt-3 grid gap-2 text-sm font-semibold text-stone-700 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <MapPin className={cn("size-4 shrink-0", look.icon)} />
                {item.locationName}
              </div>
              <div className="flex items-center gap-2">
                <Package className={cn("size-4 shrink-0", look.icon)} />
                Feito {formatDate(item.madeAt)}
              </div>
              <div className="flex items-center gap-2">
                {item.level === "expired" ? (
                  <AlertTriangle className={cn("size-4 shrink-0", look.icon)} />
                ) : (
                  <CalendarClock className={cn("size-4 shrink-0", look.icon)} />
                )}
                Validade {formatDate(item.expiresAt)}
              </div>
            </dl>
            {canDiscard && item.level === "expired" ? (
              <Button
                variant="danger"
                className="mt-4 min-h-11 w-full text-sm"
                disabled={discarding}
                onClick={() => onDiscard?.(item)}
              >
                Descartar este lote
              </Button>
            ) : null}
          </article>
        ))}
      </PageBoard>
      <Pager
        page={page.page}
        pages={page.pages}
        total={page.total}
        onPage={page.setPage}
        word="lotes"
      />
    </div>
  );
}

function SummaryChip({
  label,
  value,
  hot,
  tone,
}: {
  label: string;
  value: number;
  hot: boolean;
  tone: "red" | "orange" | "amber";
}) {
  const active = {
    red: "bg-red-600 text-white",
    orange: "bg-orange-600 text-white",
    amber: "bg-amber-500 text-white",
  }[tone];
  return (
    <div className={cn("rounded-3xl px-4 py-3", hot ? active : "bg-white text-stone-700 ring-1 ring-stone-200")}>
      <p className="text-sm font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-extrabold">{value}</p>
    </div>
  );
}
