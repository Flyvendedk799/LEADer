import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "LEADer — Lead Intelligence",
  description:
    "Discover, track, evaluate, save and export funded startup work, voucher assignments and tender-like opportunities. Denmark-first, global-ready.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider delayDuration={200}>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <Suspense fallback={<div className="h-14 border-b border-border" />}>
                  <Topbar />
                </Suspense>
                <main className="flex-1 overflow-y-auto scrollbar-thin">
                  <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">{children}</div>
                </main>
              </div>
            </div>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
