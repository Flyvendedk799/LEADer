import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { PlatformAgent } from "@/components/agent/platform-agent";
import { getCurrentUser } from "@/lib/auth";

// Authenticated application shell. Server-side auth check (defence in depth on
// top of middleware) — also gives the topbar the real user for the account menu.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex h-screen overflow-hidden">
      <CommandPalette />
      <PlatformAgent />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-14 border-b border-border" />}>
          <Topbar user={{ name: user.name, email: user.email }} />
        </Suspense>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
