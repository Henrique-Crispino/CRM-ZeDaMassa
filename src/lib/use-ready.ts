"use client";

import { useEffect, useState } from "react";
import { refreshLocations } from "./locations";
import { ensureDemoData } from "./seed";

export function useReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureDemoData()
      .then(() => refreshLocations())
      .catch(() => undefined)
      .finally(() => {
        if (!alive) return;
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return ready;
}
