"use client";

import { useEffect, useState } from "react";
import { todayDate } from "./money";
import { refreshLocations } from "./locations";
import { ensureDemoData } from "./seed";

let boot: Promise<void> | null = null;
const readyListeners = new Set<() => void>();
let clockStarted = false;

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

function startDemoClock() {
  if (clockStarted || typeof window === "undefined") return;
  clockStarted = true;
  let day = todayDate();
  function tick() {
    const today = todayDate();
    if (today === day) return;
    day = today;
    boot = null;
    readyListeners.forEach((listener) => listener());
  }
  window.setInterval(tick, 20_000);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);
}

export function useReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    function run() {
      setReady(false);
      ensureAppBoot()
        .then(() => {
          if (alive) setReady(true);
        })
        .catch(() => undefined);
    }
    run();
    startDemoClock();
    const listener = () => {
      if (alive) run();
    };
    readyListeners.add(listener);
    return () => {
      alive = false;
      readyListeners.delete(listener);
    };
  }, []);

  return ready;
}
