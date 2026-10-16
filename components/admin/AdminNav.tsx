"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGrid, IconInbox, IconLink, IconSettings, IconUsers } from "../icons";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: IconGrid },
  { href: "/admin/links", label: "Links & files", icon: IconLink },
  { href: "/admin/contacts", label: "CRM", icon: IconUsers },
  { href: "/admin/inbox", label: "Inbox", icon: IconInbox },
  { href: "/admin/settings", label: "Settings", icon: IconSettings },
];

export function AdminNav({ openCount }: { openCount: number }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
      {ITEMS.map((it) => {
        const on = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              on ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <it.icon size={17} />
            {it.label}
            {it.href === "/admin/inbox" && openCount > 0 && (
              <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white tabular-nums">
                {openCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
