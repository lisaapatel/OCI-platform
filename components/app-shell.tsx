"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/applications/new", label: "New Application" },
  { href: "/dashboard/archived", label: "Archived apps" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-oci-page text-oci-ink">
      <aside className="flex w-56 shrink-0 flex-col bg-brand text-white shadow-lg">
        <div className="border-b border-white/10 px-3 py-4">
          <Link
            href="/dashboard"
            className="block outline-none ring-offset-2 ring-offset-brand focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <BrandLogo variant="sidebar" />
          </Link>
          <p className="mt-3 px-1 text-xs leading-snug text-white/70">
            Visa servicing
          </p>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard" || pathname === "/"
                : item.href === "/dashboard/archived"
                  ? pathname === "/dashboard/archived" ||
                    pathname.startsWith("/dashboard/archived/")
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-white/10 text-white shadow-sm ring-1 ring-white/20"
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
