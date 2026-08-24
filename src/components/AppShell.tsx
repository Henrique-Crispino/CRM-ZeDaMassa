"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
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
  Coffee,
  Wallet,
  ClipboardCheck,
  ClipboardPen,
  ShoppingBag,
  ScrollText,
  PackageCheck,
} from "lucide-react";
import { useLocationCatalog } from "@/lib/locations";
import { clearLocationId, getLocationId } from "@/lib/session";
import { useReady } from "@/lib/use-ready";
import { BackLink, backTarget } from "./BackLink";
import { NotificationBell } from "./NotificationBell";
import { Button, cn } from "./ui";

const factoryLinks = [
  { href: "/inicio", label: "Painel", icon: Home },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/produzir", label: "Produzir", icon: Factory },
  { href: "/compras", label: "Compras", icon: ShoppingBag },
  { href: "/enviar", label: "Mandar p/ loja", icon: Truck },
  { href: "/receber", label: "Receber", icon: PackageCheck },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/inventario", label: "Inventário", icon: ClipboardPen },
  { href: "/kardex", label: "Kardex", icon: ScrollText },
];

const storeLinks = [
  { href: "/inicio", label: "Painel", icon: Home },
  { href: "/caixa", label: "Caixa", icon: Wallet },
  { href: "/vender", label: "Vender", icon: ShoppingCart },
  { href: "/pedir", label: "Pedir mais", icon: ClipboardList },
  { href: "/receber", label: "Receber", icon: PackageCheck },
  { href: "/sobras", label: "Sobra do dia", icon: Trash2 },
  { href: "/consumo-interno", label: "Consumo interno", icon: Coffee },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/inventario", label: "Inventário", icon: ClipboardPen },
  { href: "/kardex", label: "Kardex", icon: ScrollText },
];

const adminLinks = [
  { href: "/inicio", label: "Painel", icon: BarChart3 },
  { href: "/relatorios", label: "Relatórios", icon: FileDown },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/cadastros", label: "Organização", icon: Settings2 },
  { href: "/producao", label: "Produção", icon: ClipboardCheck },
  { href: "/compras", label: "Compras", icon: ShoppingBag },
  { href: "/receber", label: "Receber", icon: PackageCheck },
  { href: "/estoque", label: "Estoque", icon: Warehouse },
  { href: "/inventario", label: "Inventário", icon: ClipboardPen },
  { href: "/kardex", label: "Kardex", icon: ScrollText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useReady();
  const pathname = usePathname();
  const router = useRouter();
  const { panels } = useLocationCatalog();
  const panelId = ready ? getLocationId() : null;

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
  const links = panel?.type === "admin" ? adminLinks : panel?.type === "factory" ? factoryLinks : storeLinks;
  const wide = panel?.type === "admin";
  const back = backTarget(pathname, panel?.type);

  return (
    <div className="min-h-screen bg-orange-50">
      <header className="sticky top-0 z-20 border-b border-orange-100 bg-white/95 backdrop-blur print:hidden">
        {back ? (
          <div className={cn("mx-auto px-4 pt-3", wide ? "max-w-7xl" : "max-w-6xl")}>
            <BackLink href={back.href} label={back.label} className="w-full justify-center sm:w-auto sm:justify-start" />
          </div>
        ) : null}
        <div className={cn("mx-auto flex items-center justify-between gap-4 px-4 py-3", wide ? "max-w-7xl" : "max-w-6xl")}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-700">
              Controle da fábrica
            </p>
            <p className="text-xl font-extrabold text-stone-900">Painel: {panel?.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {panel?.type === "admin" || panel?.type === "factory" ? (
              <NotificationBell audience={panel.type} />
            ) : null}
            <Button
              variant="ghost"
              className="min-h-12 text-base"
              onClick={() => {
                clearLocationId();
                router.push("/");
              }}
            >
              <LogOut className="size-5" />
              Trocar painel
            </Button>
          </div>
        </div>
        <nav className={cn("mx-auto flex gap-2 overflow-x-auto px-4 pb-3", wide ? "max-w-7xl" : "max-w-6xl")}>
          {links.map((link) => {
            const Icon = link.icon;
            const nested =
              link.href === "/cadastros" &&
              ["/lojas", "/funcionarios", "/promocoes", "/consumo"].some(
                (href) => pathname === href || pathname.startsWith(`${href}/`),
              );
            const active = nested || pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-base font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
                  active ? "bg-orange-600 text-white" : "bg-orange-50 text-stone-800 ring-1 ring-orange-100",
                )}
              >
                <Icon className="size-5" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={cn("mx-auto px-4 py-6", wide ? "max-w-7xl" : "max-w-6xl")}>{children}</main>
    </div>
  );
}
