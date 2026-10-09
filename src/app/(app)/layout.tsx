import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { PlatformAgent } from "@/components/agent/platform-agent";
import { getCurrentUser } from "@/lib/auth";

// Authenticated application shell. Server-side auth check (defence in depth on
// top of middleware) — also gives the topbar the real user for the account menu.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      <PlatformAgent />
      <Suspense fallback={<div className="hidden w-56 md:block" />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-14 border-b border-border" />}>
          <Topbar user={{ name: user.name, email: user.email }} />
        </Suspense>
        <main
          id="main-content"
          className="min-w-0 flex-1 flex flex-col"
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col min-h-0 px-4 pb-12 pt-7 md:px-8 lg:pt-9">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
