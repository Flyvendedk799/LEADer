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
  CheckSquare2,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary (Denmark) navigation — shared by the desktop sidebar and mobile drawer. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/inbox", label: "Review leads", icon: Inbox },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/deals", label: "Deals", icon: BriefcaseBusiness },
  { href: "/tasks", label: "Tasks", icon: CheckSquare2 },
  { href: "/accounts", label: "Accounts", icon: Building2 },
];

export const TOOLS_NAV: NavItem[] = [
  { href: "/workflows", label: "Automations", icon: Compass },
  { href: "/sources", label: "Sources", icon: Radar },
  { href: "/import", label: "Community import", icon: ClipboardPaste },
];

/** Separate "Global" workspace, kept distinct from the Danish pipeline. */
export const GLOBAL_NAV: NavItem = {
  href: "/global",
  label: "International",
  icon: Globe2,
};

export const SETTINGS_NAV: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};

/** Dashboard ("/") matches only exactly; every other route matches on prefix. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/deals" && pathname === "/board") return true;
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}
