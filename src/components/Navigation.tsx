"use client";

import { Target, CheckCircle, Trophy, User } from "lucide-react";
import { useI18n } from "@/i18n";
import type { TabKey } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------
interface TabConfig {
  key: TabKey;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { key: "predict",     labelKey: "tabs.predict",  Icon: Target },
  { key: "results",     labelKey: "tabs.results",  Icon: CheckCircle },
  { key: "leaderboard", labelKey: "tabs.ranking",  Icon: Trophy },
  { key: "profile",     labelKey: "tabs.profile",  Icon: User },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface NavigationProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const { t } = useI18n();
  return (
    <nav className="sticky bottom-0 pb-safe border-t border-[#EBECEF] bg-white z-10">
      <div className="flex">
        {TABS.map(({ key, labelKey, Icon }) => {
          const label = t(labelKey);
          const isActive = key === activeTab;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors active:scale-95 ${
                isActive ? "text-[#181818]" : "text-[#9BA3AE]"
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-all ${
                  isActive ? "scale-110" : "scale-100"
                }`}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? "font-semibold" : ""
                }`}
              >
                {label}
              </span>
              {isActive && (
                <span className="block w-1 h-1 rounded-full bg-[#181818] mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
