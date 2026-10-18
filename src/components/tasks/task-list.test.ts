import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { TaskList, type TaskItem } from "./task-list";

describe("TaskList component", () => {
  it("renders empty state when tasks array is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(TaskList, { tasks: [] }),
    );
    expect(html).toContain("You’re all caught up");
    expect(html).toContain("Add task");
  });

  it("displays distinct visual priority badges for URGENT, HIGH, and LOW tasks", () => {
    const tasks: TaskItem[] = [
      {
        id: "task-1",
        title: "Submit RFP Proposal",
        status: "OPEN",
        priority: "URGENT",
        dueAt: new Date("2026-11-20"),
      },
      {
        id: "task-2",
        title: "Call CEO",
        status: "OPEN",
        priority: "HIGH",
        dueAt: new Date("2026-11-21"),
      },
      {
        id: "task-3",
        title: "Review Notes",
        status: "OPEN",
        priority: "LOW",
        dueAt: new Date("2026-11-22"),
      },
      {
        id: "task-4",
        title: "Normal Task",
        status: "OPEN",
        priority: "MEDIUM",
        dueAt: new Date("2026-11-23"),
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(TaskList, { tasks }),
    );

    // Urgent badge (destructive styling)
    expect(html).toContain("Urgent");
    expect(html).toContain("text-destructive");

    // High badge (warning styling)
    expect(html).toContain("High");
    expect(html).toContain("text-warning");

    // Low badge (muted styling)
    expect(html).toContain("Low");
    expect(html).toContain("text-muted-foreground");

    // Medium priority does not render a priority badge
    expect(html).not.toContain("Medium");
  });

  it("maintains overdue styling when dueAt is in the past", () => {
    const pastDate = new Date(Date.now() - 86400000 * 2);
    const tasks: TaskItem[] = [
      {
        id: "task-overdue",
        title: "Overdue Client Followup",
        status: "OPEN",
        priority: "HIGH",
        dueAt: pastDate,
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(TaskList, { tasks }),
    );

    expect(html).toContain("Overdue ·");
    expect(html).toContain("text-destructive");
    expect(html).toContain("High");
    expect(html).toContain('title="Reschedule task"');
  });
});
