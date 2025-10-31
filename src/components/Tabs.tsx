"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, activeKey, onChange }: TabsProps) {
  return (
    <div className="flex gap-2 border-b border-gray-200 pb-2">
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              isActive
                ? "bg-blue-600 text-white shadow"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
            aria-pressed={isActive}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
