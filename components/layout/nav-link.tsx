"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2",
        isActive
          ? "border border-[color:var(--accent)]/35 bg-[color:var(--accent)] text-white shadow-[0_12px_28px_rgba(31,77,61,0.22)] hover:text-white"
          : "border border-transparent text-slate-700 hover:border-black/6 hover:bg-white/88 hover:text-slate-950",
      )}
    >
      <span className={cn(isActive ? "text-white" : undefined)}>{label}</span>
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full transition",
          isActive ? "bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.18)]" : "bg-slate-300",
        )}
      />
    </Link>
  );
}
