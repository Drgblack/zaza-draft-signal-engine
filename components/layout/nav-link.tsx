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
      className={cn(
        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition",
        isActive
          ? "border border-slate-900/90 bg-slate-950 text-slate-50 shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
          : "border border-transparent text-slate-700 hover:border-black/6 hover:bg-white/88 hover:text-slate-950",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full transition",
          isActive ? "bg-white/95 shadow-[0_0_0_4px_rgba(255,255,255,0.14)]" : "bg-slate-300",
        )}
      />
    </Link>
  );
}
