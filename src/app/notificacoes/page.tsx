"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { Card, Empty, PageTitle } from "@/components/ui";
import { getPanel } from "@/lib/locations";
import { allNotifications, markNotificationsRead, requestWhen } from "@/lib/requests";
import { getLocationId } from "@/lib/session";
import type { NotificationAudience } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export default function NotificacoesPage() {
  const ready = useReady();
  const panel = ready ? getPanel(getLocationId() ?? "") : undefined;
  const audience = panel?.type === "admin" || panel?.type === "factory" ? (panel.type as NotificationAudience) : null;
  const items = useLiveQuery(
    () => (ready && audience ? allNotifications(audience) : []),
    [ready, audience],
  );

  useEffect(() => {
    if (audience) void markNotificationsRead(audience);
  }, [audience, items?.length]);

  if (panel && !audience) {
    return (
      <AppShell>
        <Empty title="A loja não tem esta tela" hint="Quem recebe aviso é a fábrica e o admin." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle
        title="Avisos"
        hint="Pedido novo da loja, envio e pedido dispensado. Os não lidos entram no sino vermelho."
      />

      {!items?.length ? (
        <Empty title="Nenhum aviso ainda" hint="Quando uma loja pedir produto, o aviso aparece aqui." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={item.readAt ? "" : "ring-2 ring-orange-300"}>
              <p className="text-xl font-extrabold text-stone-900">{item.title}</p>
              <p className="mt-1 text-lg text-stone-700">{item.body}</p>
              <p className="mt-2 text-sm font-semibold text-stone-500">{requestWhen(item.at)}</p>
              {item.type === "store_request" ? (
                <Link href="/pedidos" className="mt-3 inline-block text-base font-bold text-orange-700">
                  Ver pedido →
                </Link>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
