import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "./providers";
import { cn } from "@/lib/cn";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Inspeções | Lar Cooperativa Agroindustrial",
  description:
    "Painel integrado para gestão de inspeções, manutenção e tratativas de não conformidades da Lar Cooperativa Agroindustrial.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className={cn("app-body antialiased")}>
        <AppProviders>
          <div className="app-shell">
            <div className="page-wrapper">{children}</div>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
