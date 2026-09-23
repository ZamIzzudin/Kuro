"use client";

// Shell aplikasi: sidebar 250px (bisa di-collapse) + topbar — mengikuti pola navigasi design guideline
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Clock,
  Database,
  FileSpreadsheet,
  Home,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ActiveSessionIndicator } from "@/components/active-session";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const FREELANCER_NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Utama",
    items: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/bucket", label: "Task Bucket", icon: Inbox },
      { href: "/my-time", label: "Jam Kerja Saya", icon: Clock },
    ],
  },
  {
    group: "Lainnya",
    items: [
      { href: "/corrections", label: "Koreksi Saya", icon: ClipboardCheck },
    ],
  },
];

const ADMIN_NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Utama",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
      { href: "/admin/tasks", label: "Task", icon: ListChecks },
      { href: "/admin/users", label: "User", icon: Users },
    ],
  },
  {
    group: "Data",
    items: [
      { href: "/admin/masters", label: "Master Data", icon: Database },
      {
        href: "/admin/reports",
        label: "Rekap & Export",
        icon: FileSpreadsheet,
      },
    ],
  },
  {
    group: "Review",
    items: [
      {
        href: "/admin/corrections",
        label: "Review Koreksi",
        icon: ClipboardCheck,
      },
    ],
  },
];

/** Item aktif: cocokkan prefix terpanjang; item `exact` hanya cocok persis */
function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function titleForPath(pathname: string, role: "admin" | "freelancer"): string {
  const nav = role === "admin" ? ADMIN_NAV : FREELANCER_NAV;
  const items = nav.flatMap((g) => g.items);
  // match terpanjang dulu (agar '/admin/tasks' tidak kena '/admin')
  const sorted = [...items].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((i) => isActive(pathname, i))?.label ?? "Notu";
}

const COLLAPSE_KEY = "notu:sidebar-collapsed";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Pulihkan preferensi collapse (hindari hydration mismatch dengan efek)
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const nav = user.role === "admin" ? ADMIN_NAV : FREELANCER_NAV;
  const title = titleForPath(pathname, user.role);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  const sidebar = (mode: "full" | "rail") => {
    const rail = mode === "rail";
    return (
      <nav className="flex h-full flex-col">
        <div
          className={cn(
            "mb-1 flex items-center gap-2",
            rail && "justify-center",
          )}
        >
          <Link
            href={user.role === "admin" ? "/admin" : "/home"}
            className="min-w-0 flex-1"
            onClick={() => setOpen(false)}
            title="Notu"
          >
            {rail ? (
              <Brand compact subtitle="" />
            ) : (
              <Brand subtitle="Time & Task Tracker" />
            )}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {nav.map((group) => (
            <div key={group.group} className="mb-1.5">
              {!rail && (
                <div className="px-2.5 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                  {group.group}
                </div>
              )}
              {rail && <div className="my-2 h-px bg-line-soft" />}
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    title={rail ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "mb-0.5 flex items-center rounded-sm transition",
                      rail
                        ? "justify-center px-2 py-2.5"
                        : "gap-2.5 px-2.5 py-2",
                      "text-[13.5px] font-medium",
                      active
                        ? "bg-brand-soft font-bold text-brand-1"
                        : "text-ink-500 hover:bg-surface-2 hover:text-ink-900",
                    )}
                  >
                    <item.icon
                      className="h-[16px] w-[16px] shrink-0"
                      strokeWidth={2}
                    />
                    {!rail && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {user.role === "freelancer" &&
          (rail ? <ActiveSessionIndicator compact /> : <ActiveSessionIndicator />)}
      </nav>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop — bisa dilipat */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 overflow-y-auto border-r border-line bg-surface py-7 transition-[width,padding] duration-200 lg:block",
          collapsed ? "w-[76px] px-3" : "w-[250px] px-5",
        )}
      >
        {collapsed ? (
          <div className="flex h-full flex-col">
            {sidebar("rail")}
            <button
              onClick={toggleCollapsed}
              title="Buka sidebar"
              aria-label="Buka sidebar"
              className="mt-2 flex items-center justify-center rounded-sm px-2 py-2.5 text-ink-500 transition hover:bg-surface-2 hover:text-ink-900"
            >
              <PanelLeftOpen className="h-[16px] w-[16px]" strokeWidth={2} />
            </button>
          </div>
        ) : (
          sidebar("full")
        )}
      </aside>

      {/* Tombol buka sidebar mobile */}
      <button
        aria-label="Buka menu"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-surface text-ink-700 shadow-md lg:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(20,18,32,0.4)] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-[250px] overflow-y-auto border-r border-line bg-surface px-5 py-7 transition-transform lg:hidden",
          open
            ? "translate-x-0 shadow-[20px_0_50px_rgba(0,0,0,0.15)]"
            : "-translate-x-full",
        )}
      >
        {sidebar("full")}
      </aside>

      {/* Konten */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/80 px-5 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCollapsed}
              title={collapsed ? "Buka sidebar" : "Lipat sidebar"}
              aria-label={collapsed ? "Buka sidebar" : "Lipat sidebar"}
              className="hidden h-8 w-8 items-center justify-center rounded-sm text-ink-500 transition hover:bg-surface-2 hover:text-ink-900 lg:flex"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" strokeWidth={2} />
              ) : (
                <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
            <h2 className="pl-12 text-[15px] font-bold lg:pl-0">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-brand-1">
              {user.role === "admin" ? "Admin" : "Freelancer"}
            </span>
            <span className="hidden text-[13px] font-semibold text-ink-700 sm:block">
              {user.name}
            </span>
            <button
              onClick={logout}
              title="Keluar"
              aria-label="Keluar"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition hover:bg-surface-2"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
