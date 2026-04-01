"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/applications/new", label: "New Application" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#f8fafc] text-[#1e293b]">
      <aside className="flex w-56 shrink-0 flex-col bg-[#1e3a5f] text-white shadow-lg">
        <div className="border-b border-white/10 px-4 py-5">
          <Link
            href="/dashboard"
            className="text-lg font-bold tracking-tight text-white transition-colors duration-150 hover:text-white/90"
          >
            OCI Platform
          </Link>
          <p className="mt-1 text-xs text-white/60">Application helper</p>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {navItems.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard" || pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
