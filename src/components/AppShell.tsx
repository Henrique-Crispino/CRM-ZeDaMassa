"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState, type ReactNode } from "react";
import {
  Contact,
  Factory,
  Home,
  Menu,
  Package,
  ShoppingCart,
  Truck,
  Warehouse,
  Trash2,
  LogOut,
  BarChart3,
  ClipboardList,
  FileDown,
  Settings2,
  Wallet,
  ClipboardCheck,
  ClipboardPen,
  ShoppingBag,
  ScrollText,
  PackageCheck,
  Undo2,
  Utensils,
  PackageOpen,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocationCatalog } from "@/lib/locations";
import { getDb } from "@/lib/db";
import { leaveOperator, otherOperatorPanels, panelLabel, switchOperatorPanel } from "@/lib/operator";
import { getActorId, getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";
import { BackLink, backTarget } from "./BackLink";
import { ConfirmDialog } from "./pick-flow";
import { NotificationBell } from "./NotificationBell";
import { Button, cn } from "./ui";

type NavItem = { href: string; label: string; short?: string; icon: LucideIcon };

const factoryTurno: NavItem[] = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/produzir", label: "Produzir", icon: Factory },
  { href: "/compras", label: "Compras", icon: ShoppingBag },
  { href: "/enviar", label: "Mandar p/ loja", short: "Mandar", icon: Truck },
  { href: "/receber", label: "Receber", icon: PackageCheck },
];

const factoryRest: NavItem[] = [
  { href: "/devolver", label: "Devoluções", icon: Undo2 },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/clientes", label: "Clientes", icon: Contact },
  { href: "/pacote", label: "Abrir pacote", icon: PackageOpen },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/inventario", label: "Inventário", icon: ClipboardPen },
  { href: "/kardex", label: "Extrato", icon: ScrollText },
];

const storeTurno: NavItem[] = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/caixa", label: "Caixa", icon: Wallet },
  { href: "/vender", label: "Vender", icon: ShoppingCart },
  { href: "/pedir", label: "Pedir mais", short: "Pedir", icon: ClipboardList },
  { href: "/receber", label: "Receber", icon: PackageCheck },
  { href: "/sobras", label: "Sobra do dia", short: "Sobra", icon: Trash2 },
];

const storeRest: NavItem[] = [
  { href: "/devolver", label: "Devolver", icon: Undo2 },
  { href: "/consumo-interno", label: "Consumo interno", icon: Utensils },
  { href: "/pacote", label: "Abrir pacote", icon: PackageOpen },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/inventario", label: "Inventário", icon: ClipboardPen },
  { href: "/kardex", label: "Extrato", icon: ScrollText },
];

const adminLinks: NavItem[] = [
  { href: "/inicio", label: "Início", icon: BarChart3 },
  { href: "/relatorios", label: "Relatórios", icon: FileDown },
  { href: "/caixa", label: "Caixa", icon: Wallet },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/cadastros", label: "Organização", icon: Settings2 },
  { href: "/producao", label: "Produção", icon: ClipboardCheck },
  { href: "/compras", label: "Compras", icon: ShoppingBag },
  { href: "/receber", label: "Receber", icon: PackageCheck },
  { href: "/devolver", label: "Devolver", icon: Undo2 },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/inventario", label: "Inventário", icon: ClipboardPen },
  { href: "/kardex", label: "Extrato", icon: ScrollText },
];

function navClass(active: boolean) {
  return cn(
    "inline-flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
    active ? "bg-orange-600 text-white" : "text-stone-800 hover:bg-orange-50",
  );
}

function linkActive(pathname: string, href: string) {
  const nested =
    href === "/cadastros" &&
    ["/lojas", "/funcionarios", "/promocoes", "/consumo", "/clientes"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  return nested || pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLinks({ links, pathname }: { links: NavItem[]; pathname: string }) {
  return links.map((link) => {
    const Icon = link.icon;
    const active = linkActive(pathname, link.href);
    return (
      <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={navClass(active)}>
        <Icon className="size-5 shrink-0" />
        {link.label}
      </Link>
    );
  });
}

function MenuPanel({
  name,
  who,
  turno,
  rest,
  pathname,
  onLeave,
  onSwitch,
  onClose,
}: {
  name: string;
  who?: string;
  turno: NavItem[];
  rest: NavItem[];
  pathname: string;
  onLeave: () => void;
  onSwitch?: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-orange-100 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Controle da fábrica</p>
          <p className="mt-1 text-lg font-extrabold leading-tight text-stone-900">{name}</p>
          {who ? <p className="mt-1 text-sm font-semibold text-stone-500">{who}</p> : null}
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" className="shrink-0 px-3" aria-label="Fechar menu" onClick={onClose}>
            <X className="size-5" />
          </Button>
        ) : null}
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Menu">
        <SidebarLinks links={turno} pathname={pathname} />
        {rest.length > 0 ? (
          <>
            <div className="my-2 border-t border-orange-100" role="presentation" />
            <SidebarLinks links={rest} pathname={pathname} />
          </>
        ) : null}
      </nav>
      <div className="space-y-2 border-t border-orange-100 p-3">
        {onSwitch ? (
          <Button variant="ghost" className="w-full justify-start" onClick={onSwitch}>
            Ir para outro lugar
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full justify-start" onClick={onLeave}>
          <LogOut className="size-5" />
          Sair
        </Button>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useReady();
  const pathname = usePathname();
  const router = useRouter();
  const { panels } = useLocationCatalog();
  const panelId = ready ? getLocationId() : null;
  const actorId = ready ? getActorId() : null;
  const person = useLiveQuery(() => (actorId ? getDb().employees.get(actorId) : undefined), [actorId]);
  const [leave, setLeave] = useState(false);
  const [switchPlace, setSwitchPlace] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setPlaceTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    if (!getLocationId() || !getActorId()) {
      leaveOperator();
      router.replace("/");
    }
  }, [ready, router]);

  useEffect(() => {
    if (person && person.active === false) {
      leaveOperator();
      router.replace("/");
    }
  }, [person, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  if (!ready || !panelId || !actorId) {
    return (
      <div className="grid min-h-screen place-items-center bg-orange-50 text-xl font-bold text-stone-600">
        Carregando...
      </div>
    );
  }

  const panel = panels.find((item) => item.id === panelId);
  const role = panel?.type;
  const turno = role === "admin" ? adminLinks : role === "factory" ? factoryTurno : storeTurno;
  const rest = role === "admin" ? [] : role === "factory" ? factoryRest : storeRest;
  const back = backTarget(pathname, role);
  const hasBottomNav = role !== "admin";
  const who = person?.name;
  const here =
    role === "store"
      ? `Você está na ${panel?.name}`
      : role === "factory"
        ? "Você está na fábrica"
        : "Você está na administração";
  const switchTargets = person ? otherOperatorPanels(person, panelId) : [];

  return (
    <div className={cn("flex min-h-screen bg-orange-50", hasBottomNav && "shell-turno")}>
      <aside className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col border-r border-orange-100 bg-white md:flex print:hidden">
        <MenuPanel
          name={panel?.name ?? ""}
          who={who}
          turno={turno}
          rest={rest}
          pathname={pathname}
          onLeave={() => setLeave(true)}
          onSwitch={switchTargets.length ? () => setSwitchPlace(true) : undefined}
        />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-[45] md:hidden print:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative flex h-full w-[min(20rem,88vw)] flex-col bg-white shadow-xl">
            <MenuPanel
              name={panel?.name ?? ""}
              who={who}
              turno={turno}
              rest={rest}
              pathname={pathname}
              onLeave={() => {
                setMenuOpen(false);
                setLeave(true);
              }}
              onSwitch={
                switchTargets.length
                  ? () => {
                      setMenuOpen(false);
                      setSwitchPlace(true);
                    }
                  : undefined
              }
              onClose={() => setMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-orange-100 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                className="shrink-0 px-3 md:hidden"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                Menu
              </Button>
              <div className="min-w-0">
                {back ? <BackLink href={back.href} label={back.label} className="mb-2" /> : null}
                <p className="truncate text-xl font-extrabold text-stone-900">{here}</p>
                {who ? <p className="truncate text-sm font-semibold text-stone-500">{who}</p> : null}
              </div>
            </div>
            {role === "admin" || role === "factory" ? <NotificationBell audience={role} /> : null}
          </div>
        </header>
        <main className={cn("px-4 py-6", hasBottomNav ? "pb-24 md:pb-6" : null)}>{children}</main>
      </div>

      {hasBottomNav ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-orange-100 bg-white/95 md:hidden print:hidden"
          aria-label="Turno"
        >
          {turno.map((link) => {
            const Icon = link.icon;
            const active = linkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[11px] font-bold leading-tight",
                  active ? "text-orange-700" : "text-stone-600",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="max-w-full truncate">{link.short ?? link.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <ConfirmDialog
        open={leave}
        title={who ? `Sair da ${who} neste computador?` : "Sair?"}
        hint="Depois escolhe de novo quem opera. Isto não é senha da empresa. Os dados deste computador continuam aqui."
        confirmLabel="Sair"
        confirmVariant="secondary"
        cancelLabel="Ficar aqui"
        onConfirm={() => {
          leaveOperator();
          router.push("/");
        }}
        onCancel={() => setLeave(false)}
      >
        <p className="font-semibold text-stone-700">Agora: {who ? `${who} · ${panel?.name}` : panel?.name}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={switchPlace}
        title="Ir para outro lugar?"
        hint="Só os sítios desta ficha. A Telma não vê a administração aqui."
        confirmLabel="Fechar"
        confirmVariant="secondary"
        cancelLabel="Fechar"
        onConfirm={() => setSwitchPlace(false)}
        onCancel={() => setSwitchPlace(false)}
      >
        <div className="space-y-2">
          {switchTargets.map((id) => (
            <Button
              key={id}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                if (!person) return;
                switchOperatorPanel(person, id);
                setSwitchPlace(false);
                setPlaceTick((tick) => tick + 1);
                router.push("/inicio");
              }}
            >
              {panelLabel(id)}
            </Button>
          ))}
        </div>
      </ConfirmDialog>
    </div>
  );
}

