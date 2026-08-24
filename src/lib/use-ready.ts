"use client";

import { useEffect, useState } from "react";
import { refreshLocations } from "./locations";
import { ensureDemoData } from "./seed";

let boot: Promise<void> | null = null;

function ensureAppBoot() {
  if (!boot) {
    boot = ensureDemoData()
      .then(() => refreshLocations())
      .catch((error) => {
        boot = null;
        throw error;
      });
  }
  return boot;
}

export function useReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureAppBoot()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return ready;
}
