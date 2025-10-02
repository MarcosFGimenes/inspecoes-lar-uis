import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lar Cooperativa Agroindustrial — Sistema de Inspeção de Rotas",
  description:
    "Portal de acesso para os módulos de inspeção, planejamento e controle de manutenção da Lar Cooperativa Agroindustrial.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
