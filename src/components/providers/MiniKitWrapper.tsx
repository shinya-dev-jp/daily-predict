"use client";

import { type ReactNode, useEffect, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";

export function MiniKitWrapper({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
    if (appId) {
      MiniKit.install(appId);
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

export function useMiniKit() {
  return {
    isInstalled: typeof window !== "undefined" && MiniKit.isInstalled(),
    minikit: MiniKit,
  };
}
