"use client";

import type { ReactNode } from "react";

import { ReactQueryProvider } from "@/lib/react-query/provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <ReactQueryProvider>{children}</ReactQueryProvider>;
}
