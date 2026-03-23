import Link from "next/link";
import Image from "next/image";
import { PanelLeftClose } from "lucide-react";

import { EnvStatus } from "@/components/layout/env-status";
import { NavLink } from "@/components/layout/nav-link";
import { NAV_GROUPS } from "@/lib/constants";

export function AppShell({
  appName,
  isAirtableConfigured,
  children,
}: {
  appName: string;
  isAirtableConfigured: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-black/6 bg-[color:var(--panel-strong)] px-5 py-5 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
          <div className="flex items-center justify-between lg:items-start">
            <div className="space-y-2">
              <div className="inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm">
                <Image
                  src="/Z%20Logo.png"
                  alt="Zaza Draft logo"
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Internal Tool</p>
                <h1 className="mt-2 text-xl font-semibold text-slate-950">{appName}</h1>
                <p className="mt-2 max-w-[14rem] text-sm leading-6 text-slate-600">
                  Signal intake, review, planning, and publishing memory in one calm operator workspace.
                </p>
              </div>
            </div>
            <PanelLeftClose className="h-5 w-5 text-slate-300 lg:hidden" />
          </div>

          <nav className="mt-7 space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                  {group.label}
                </p>
                <div className="mt-3 grid gap-1.5">
                  {group.items.map((item) => (
                    <NavLink key={item.href} href={item.href} label={item.label} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-7 rounded-3xl border border-black/6 bg-white/86 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
            <p className="text-[11px] font-medium tracking-[0.16em] text-slate-500">Environment</p>
            <div className="mt-3">
              <EnvStatus isAirtableConfigured={isAirtableConfigured} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              V1 is intentionally constrained to intake, classification, draft preparation, and clean review.
            </p>
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-20 border-b border-black/6 bg-[color:var(--panel-strong)]/95 backdrop-blur">
            <div className="flex items-center justify-between px-6 py-4 lg:px-10">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm">
                  <Image
                    src="/Z%20Logo.png"
                    alt="Zaza Draft logo"
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Editorial Workflow</p>
                  <p className="mt-1 text-sm text-slate-700">Human-in-the-loop signal interpretation and draft prep.</p>
                </div>
              </div>
              <Link
                href="/signals/new"
                className="rounded-full border border-black/6 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white"
              >
                New intake
              </Link>
            </div>
          </header>

          <main className="px-6 py-6 lg:px-10 lg:py-9">{children}</main>
        </div>
      </div>
    </div>
  );
}
