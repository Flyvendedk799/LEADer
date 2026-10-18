import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUsePathname = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

describe("Sidebar and MobileNav badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("renders Sidebar navigation links with correct labels", () => {
    const html = renderToStaticMarkup(React.createElement(Sidebar));
    expect(html).toContain("Review leads");
    expect(html).toContain("Tasks");
    expect(html).toContain("Discover");
    expect(html).toContain("Deals");
  });

  it("renders MobileNav with trigger button and links", () => {
    const html = renderToStaticMarkup(React.createElement(MobileNav));
    expect(html).toContain("Open navigation menu");
  });
});
