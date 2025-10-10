import type { ReactNode } from "react";

import AdminSidebar from "./_components/admin-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col md:flex-row md:items-start md:gap-6">
        <AdminSidebar />
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
