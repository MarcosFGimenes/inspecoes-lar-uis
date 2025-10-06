import type { ReactNode } from "react";
import HomeNavigation from "./_components/home-navigation";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="pb-24">{children}</div>
      <HomeNavigation />
    </div>
  );
}
