"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell } from "lucide-react";
import { unreadNotifications } from "@/lib/requests";
import type { NotificationAudience } from "@/lib/types";
import { useReady } from "@/lib/use-ready";

export function NotificationBell({ audience }: { audience: NotificationAudience }) {
  const ready = useReady();
  const unread = useLiveQuery(
    () => (ready ? unreadNotifications(audience) : []),
    [ready, audience],
  );
  const count = unread?.length ?? 0;

  return (
    <Link
      href="/notificacoes"
      className="relative inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-4 text-base font-bold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50"
    >
      <Bell className="size-5" />
      Avisos
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-extrabold text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
