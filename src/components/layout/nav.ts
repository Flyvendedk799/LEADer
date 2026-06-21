import {
  ClipboardPaste,
  Building2,
  BriefcaseBusiness,
  Compass,
  Globe2,
  LayoutDashboard,
  Search,
  Radar,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary (Denmark) navigation — shared by the desktop sidebar and mobile drawer. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/workflows", label: "Workflows", icon: Compass },
  { href: "/", label: "Cockpit", icon: LayoutDashboard },
  { href: "/deals", label: "Deals", icon: BriefcaseBusiness },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/sources", label: "Sources", icon: Radar },
  { href: "/import", label: "Community import", icon: ClipboardPaste },
];

/** Separate "Global" workspace, kept distinct from the Danish pipeline. */
export const GLOBAL_NAV: NavItem = { href: "/global", label: "International", icon: Globe2 };

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Dashboard ("/") matches only exactly; every other route matches on prefix. */
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
