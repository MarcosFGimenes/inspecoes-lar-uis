import type { ReactNode } from "react";
import HomeNavigation from "./_components/home-navigation";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen text-[var(--text)]">
      <div className="pb-24">{children}</div>
      <HomeNavigation />
    </div>
  );
}
