"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface AdminReadCounterContextValue {
  readCount: number;
  setReadCount: (count: number) => void;
}

const AdminReadCounterContext = createContext<AdminReadCounterContextValue | null>(null);

export function AdminReadCounterProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [readCount, setReadCount] = useState(0);

  useEffect(() => {
    setReadCount(0);
  }, [pathname]);

  const value = useMemo(() => ({ readCount, setReadCount }), [readCount]);

  return <AdminReadCounterContext.Provider value={value}>{children}</AdminReadCounterContext.Provider>;
}

export function useAdminReadCounter() {
  const context = useContext(AdminReadCounterContext);
  if (!context) {
    throw new Error("useAdminReadCounter must be used within AdminReadCounterProvider");
  }
  return context;
}
