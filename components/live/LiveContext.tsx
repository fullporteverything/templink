"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { LiveData } from "@/lib/live";

const Ctx = createContext<LiveData | null>(null);

/** Holds the public activity feed and refreshes it every 10 s while the tab is visible. */
export function LiveProvider({ initial, children }: { initial: LiveData; children: React.ReactNode }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    let stopped = false;
    const tick = async (fresh = false) => {
      if (document.visibilityState !== "visible") return;
      try {
        // A unique query skips the short edge cache when we know something just happened.
        const res = await fetch(fresh ? `/api/live?t=${Date.now()}` : "/api/live", { cache: "no-store" });
        if (res.ok && !stopped) setData(await res.json());
      } catch {
        /* offline: keep the last data */
      }
    };
    const t = setInterval(() => tick(), 10_000);
    const soon = () => setTimeout(() => tick(true), 600);
    window.addEventListener("templink:activity", soon);
    return () => {
      stopped = true;
      clearInterval(t);
      window.removeEventListener("templink:activity", soon);
    };
  }, []);
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useLive(): LiveData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}
