import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./ui";

export type BackTarget = {
  href: string;
  label: string;
};

export function backTarget(pathname: string, panelType?: string): BackTarget | null {
  if (pathname === "/inicio") return null;

  if (pathname === "/produtos/novo" || /^\/produtos\/[^/]+$/.test(pathname)) {
    return { href: "/produtos", label: "Voltar para produtos" };
  }

  if (pathname === "/lojas" || pathname === "/funcionarios" || pathname === "/promocoes" || pathname === "/consumo") {
    return { href: "/cadastros", label: "Voltar para organização" };
  }

  if (pathname === "/notificacoes") {
    return { href: "/inicio", label: "Voltar ao painel" };
  }

  if (pathname === "/produzir" && panelType === "admin") {
    return { href: "/producao", label: "Voltar para o registro" };
  }

  if (pathname === "/producao" && panelType === "factory") {
    return { href: "/produzir", label: "Voltar para produzir" };
  }

  return { href: "/inicio", label: "Voltar ao painel" };
}

export function BackLink({
  href,
  label,
  className,
}: BackTarget & {
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-4 text-base font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200",
        className,
      )}
    >
      <ArrowLeft className="size-5 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
