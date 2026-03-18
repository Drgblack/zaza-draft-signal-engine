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
        "flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition",
        isActive ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white/80 hover:text-slate-950",
      )}
    >
      {label}
    </Link>
  );
}
