"use client";

import { type ReactNode, useEffect, useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";

export function MiniKitWrapper({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  // Mount-once initialization: MiniKit.install() must run exactly once on first
  // client render. Empty deps array is intentional — there are no values that
  // would trigger a re-install. ESLint exhaustive-deps is silenced explicitly.
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
    if (appId) {
      MiniKit.install(appId);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
