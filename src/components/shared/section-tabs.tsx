"use client";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function SectionTabs({
  sections,
}: {
  sections: { id: string; label: string; content: ReactNode }[];
}) {
  return (
    <Tabs defaultValue={sections[0].id}>
      <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
        {sections.map((section) => (
          <TabsTrigger
            key={section.id}
            value={section.id}
            className="px-4 py-2.5 data-[state=active]:bg-card data-[state=active]:text-primary"
          >
            {section.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {sections.map((section) => (
        <TabsContent key={section.id} value={section.id} className="space-y-5">
          {section.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
