"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, Card, Empty, PageTitle, cn } from "@/components/ui";
import {
  cashPeriodLabel,
  currentCashSession,
  lastClosedSession,
  listCashSessions,
  listEmployees,
  sessionLedger,
} from "@/lib/cash";
import { getPanel, useLocationCatalog } from "@/lib/locations";
import { formatTime } from "@/lib/money";
import { getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";

const STORE_KEY = "gp-cash-store";

const CASH_PATHS = [
  { href: "/caixa", label: "Turno" },
  { href: "/caixa/sangria", label: "Sangria e troco" },
  { href: "/caixa/fechar", label: "Fechar o caixa" },
] as const;

type CashWorkspaceValue = {
  ready: boolean;
  isAdminPanel: boolean;
  storeName: string;
  locationId: string | null;
  sessionPending: boolean;
  employees: Awaited<ReturnType<typeof listEmployees>> | undefined;
  session: Awaited<ReturnType<typeof currentCashSession>> | undefined;
  history: Awaited<ReturnType<typeof listCashSessions>> | undefined;
  ledger: Awaited<ReturnType<typeof sessionLedger>> | null | undefined;
  previous: Awaited<ReturnType<typeof lastClosedSession>> | undefined;
};

const CashWorkspaceContext = createContext<CashWorkspaceValue | null>(null);

export function useCashWorkspace() {
  const value = useContext(CashWorkspaceContext);
  if (!value) throw new Error("useCashWorkspace precisa do caixa.");
  return value;
}

function readStoredStore() {
  try {
    return sessionStorage.getItem(STORE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function CashWorkspace({ children }: { children: ReactNode }) {
  const ready = useReady();
  const pathname = usePathname();
  const panelId = ready ? getLocationId() : null;
  const panel = panelId ? getPanel(panelId) : undefined;
  const isAdminPanel = panel?.type === "admin";
  const { stores } = useLocationCatalog();
  const [pickedStore, setPickedStore] = useState("");

  useEffect(() => {
    if (!isAdminPanel) return;
    const stored = readStoredStore();
    const first = stores[0]?.id ?? "";
    const next = stores.some((store) => store.id === stored) ? stored : first;
    if (next && next !== pickedStore) setPickedStore(next);
  }, [isAdminPanel, stores, pickedStore]);

  const locationId = isAdminPanel ? pickedStore || stores[0]?.id || null : panelId;
  const storeName = stores.find((store) => store.id === locationId)?.name ?? panel?.name ?? "loja";

  const employees = useLiveQuery(
    () => (ready && locationId ? listEmployees(locationId) : undefined),
    [ready, locationId],
  );
  const session = useLiveQuery(
    () => (ready && locationId ? currentCashSession(locationId) : undefined),
    [ready, locationId],
  );
  const history = useLiveQuery(
    () => (ready && locationId ? listCashSessions(locationId) : undefined),
    [ready, locationId],
  );
  const ledger = useLiveQuery(
    () => (ready && session ? sessionLedger(session.id) : null),
    [ready, session?.id, session?.closedAt, session?.reopenedAt],
  );
  const previous = useLiveQuery(
    () => (ready && locationId && session === null ? lastClosedSession(locationId) : undefined),
    [ready, locationId, session === null],
  );
  const sessionPending = session === undefined;

  return (
    <CashWorkspaceContext.Provider
      value={{
        ready,
        isAdminPanel,
        storeName,
        locationId,
        sessionPending,
        employees,
        session,
        history,
        ledger,
        previous,
      }}
    >
      <PageTitle
        title={isAdminPanel ? "Caixa das lojas" : `Caixa da ${storeName}`}
        hint={
          isAdminPanel
            ? "A loja opera o turno. Se o apurado saiu errado, a administração reabre o caixa do dia — sem inventar sangria."
            : "Três caminhos: o turno, tirar ou pôr dinheiro, e fechar o caixa."
        }
      />

      {isAdminPanel ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {stores.map((store) => (
            <Button
              key={store.id}
              type="button"
              variant={locationId === store.id ? "primary" : "ghost"}
              onClick={() => {
                setPickedStore(store.id);
                try {
                  sessionStorage.setItem(STORE_KEY, store.id);
                } catch {
                  /* ignore */
                }
              }}
            >
              {store.name}
            </Button>
          ))}
        </div>
      ) : null}

      <nav className="mb-6 grid gap-2 sm:grid-cols-3" aria-label="Caminhos do caixa">
        {(isAdminPanel && session ? CASH_PATHS.filter((item) => item.href === "/caixa") : CASH_PATHS).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-14 items-center justify-center rounded-2xl px-4 text-center text-lg font-extrabold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
                active ? "bg-orange-600 text-white" : "bg-white text-stone-800 ring-1 ring-stone-300",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </CashWorkspaceContext.Provider>
  );
}

export function CashLoading() {
  return (
    <Card className="mb-6">
      <p className="text-lg font-bold text-stone-600">Carregando o caixa...</p>
    </Card>
  );
}

export function CashClosed({ title, hint }: { title: string; hint: string }) {
  return (
    <Empty
      title={title}
      hint={hint}
      action={
        <Link
          href="/caixa"
          className="inline-flex min-h-14 items-center rounded-2xl bg-orange-600 px-5 text-lg font-extrabold text-white"
        >
          Ir para o turno
        </Link>
      }
    />
  );
}

export function OpenSessionCard() {
  const { session, ledger } = useCashWorkspace();
  if (!session) return null;
  if (!ledger) {
    return (
      <Card className="mb-6">
        <p className="text-lg font-bold text-stone-600">Carregando o movimento do caixa...</p>
      </Card>
    );
  }

  return (
    <Card className="mb-6 space-y-2 bg-emerald-50 ring-emerald-200">
      <p className="text-sm font-bold uppercase text-emerald-800">Caixa aberto</p>
      <p className="text-2xl font-extrabold text-stone-900">
        {cashPeriodLabel(session.period)} · {session.employeeName}
      </p>
      <p className="text-stone-700">
        Aberto {formatTime(session.openedAt)} · {ledger.salesCount} {ledger.salesCount === 1 ? "venda" : "vendas"}
      </p>
      {session.reopenedAt ? (
        <p className="font-semibold text-orange-800">
          Reaberto
          {session.reopenNote ? ` · ${session.reopenNote}` : ""}
          {session.reopenCount && session.reopenCount > 1 ? ` · ${session.reopenCount}×` : ""}
        </p>
      ) : null}
    </Card>
  );
}

export function CashMetric({
  label,
  hint,
  value,
  accent,
}: {
  label: string;
  hint: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "bg-orange-50 ring-orange-200" : undefined}>
      <p className="text-sm font-bold text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-stone-900">{value}</p>
      <p className="text-sm font-semibold text-stone-500">{hint}</p>
    </Card>
  );
}
