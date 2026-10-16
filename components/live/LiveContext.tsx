"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { LiveData } from "@/lib/live";

const Ctx = createContext<LiveData | null>(null);

/** Holds the public activity feed and refreshes it every 30 s while the tab is visible. */
export function LiveProvider({ initial, children }: { initial: LiveData; children: React.ReactNode }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.ok && !stopped) setData(await res.json());
      } catch {
        /* offline: keep the last data */
      }
    };
    const t = setInterval(tick, 30_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useLive(): LiveData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}
