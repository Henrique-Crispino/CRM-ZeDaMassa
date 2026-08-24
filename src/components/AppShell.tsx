"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Factory,
  Home,
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
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useLocationCatalog } from "@/lib/locations";
import { clearLocationId, getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";
import { BackLink, backTarget } from "./BackLink";
import { FACTORY_MORE, FACTORY_MORE_HREFS, STORE_MORE, STORE_MORE_HREFS, moreActive, type MoreItem } from "./nav";
import { ConfirmDialog } from "./pick-flow";
import { NotificationBell } from "./NotificationBell";
import { Button, cn } from "./ui";

const factoryLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/produzir", label: "Produzir", icon: Factory },
  { href: "/compras", label: "Compras", icon: ShoppingBag },
  { href: "/enviar", label: "Mandar p/ loja", icon: Truck },
  { href: "/receber", label: "Receber", icon: PackageCheck },
];

const storeLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/inicio", label: "Início", icon: Home },
  { href: "/caixa", label: "Caixa", icon: Wallet },
  { href: "/vender", label: "Vender", icon: ShoppingCart },
  { href: "/pedir", label: "Pedir mais", icon: ClipboardList },
  { href: "/receber", label: "Receber", icon: PackageCheck },
  { href: "/sobras", label: "Sobra do dia", icon: Trash2 },
];

const adminLinks: { href: string; label: string; icon: LucideIcon }[] = [
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
  { href: "/kardex", label: "Kardex", icon: ScrollText },
];

function navClass(active: boolean) {
  return cn(
    "inline-flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
    active ? "bg-orange-600 text-white" : "text-stone-800 hover:bg-orange-50",
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useReady();
  const pathname = usePathname();
  const router = useRouter();
  const { panels } = useLocationCatalog();
  const panelId = ready ? getLocationId() : null;
  const [leave, setLeave] = useState(false);

  useEffect(() => {
    if (ready && !getLocationId()) router.replace("/");
  }, [ready, router]);

  if (!ready || !panelId) {
    return (
      <div className="grid min-h-screen place-items-center bg-orange-50 text-xl font-bold text-stone-600">
        Carregando...
      </div>
    );
  }

  const panel = panels.find((item) => item.id === panelId);
  const role = panel?.type;
  const links = role === "admin" ? adminLinks : role === "factory" ? factoryLinks : storeLinks;
  const moreItems = role === "factory" ? FACTORY_MORE : STORE_MORE;
  const moreHrefs = role === "factory" ? FACTORY_MORE_HREFS : STORE_MORE_HREFS;
  const showMore = role === "store" || role === "factory";
  const back = backTarget(pathname, role);
  const here =
    role === "store"
      ? `Você está na ${panel?.name}`
      : role === "factory"
        ? "Você está na fábrica"
        : "Você está na administração";

  return (
    <div className="flex min-h-screen bg-orange-50">
      <aside className="sticky top-0 z-30 flex h-screen w-60 shrink-0 flex-col border-r border-orange-100 bg-white print:hidden">
        <div className="border-b border-orange-100 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Controle da fábrica</p>
          <p className="mt-1 text-lg font-extrabold leading-tight text-stone-900">{panel?.name}</p>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Menu">
          {links.map((link) => {
            const Icon = link.icon;
            const nested =
              link.href === "/cadastros" &&
              ["/lojas", "/funcionarios", "/promocoes", "/consumo"].some(
                (href) => pathname === href || pathname.startsWith(`${href}/`),
              );
            const active = nested || pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={navClass(active)}>
                <Icon className="size-5 shrink-0" />
                {link.label}
              </Link>
            );
          })}
          {showMore ? <MaisMenu items={moreItems} active={moreActive(pathname, moreHrefs)} /> : null}
        </nav>
        <div className="border-t border-orange-100 p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setLeave(true)}>
            <LogOut className="size-5" />
            Trocar de lugar
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-orange-100 bg-white/95 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {back ? <BackLink href={back.href} label={back.label} className="mb-2" /> : null}
              <p className="truncate text-xl font-extrabold text-stone-900">{here}</p>
            </div>
            {role === "admin" || role === "factory" ? <NotificationBell audience={role} /> : null}
          </div>
        </header>
        <main className="px-4 py-6">{children}</main>
      </div>

      <ConfirmDialog
        open={leave}
        title={`Sair ${role === "store" ? `da ${panel?.name}` : role === "factory" ? "da fábrica" : "da administração"}?`}
        hint="Você vai escolher outro lugar. Isto não é senha. Os dados deste computador continuam aqui."
        confirmLabel="Trocar de lugar"
        confirmVariant="secondary"
        cancelLabel="Ficar aqui"
        onConfirm={() => {
          clearLocationId();
          router.push("/");
        }}
        onCancel={() => setLeave(false)}
      >
        <p className="font-semibold text-stone-700">Agora: {panel?.name}</p>
      </ConfirmDialog>
    </div>
  );
}

function MaisMenu({ items, active }: { items: MoreItem[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const box = buttonRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!box) return;
      const width = menu?.offsetWidth || 288;
      const height = menu?.offsetHeight || 0;
      let left = box.right + 8;
      let top = box.top;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, box.left - width - 8);
      }
      if (height && top + height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - height - 8);
      }
      setPos({ top, left });
    }
    place();
    const frame = window.requestAnimationFrame(place);
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (buttonRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        className={navClass(active || open)}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="size-5 shrink-0" />
        Mais
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-50 max-h-[calc(100vh-16px)] w-72 overflow-y-auto rounded-2xl bg-white p-2 shadow-xl ring-1 ring-stone-200"
            >
              {items.map((item) => {
                const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={cn(
                      "block rounded-xl px-3 py-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
                      current ? "bg-orange-50" : "hover:bg-stone-50",
                    )}
                  >
                    <p className="font-extrabold text-stone-900">{item.label}</p>
                    <p className="text-sm font-semibold text-stone-500">{item.hint}</p>
                  </Link>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
