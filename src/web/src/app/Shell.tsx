import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import type { Role } from "@dogfood/core";
import { cx } from "../lib/format";
import { useNotifications } from "../lib/queries";
import { useLogout, useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
import { TourMenu } from "../tour/TourLauncher";
import { Avatar, Button, Dialog, Icon, IconButton, LinkButton, Menu, PageLoader, RoleBadge, type IconName } from "../ui";
import { Logo } from "./Logo";

interface Destination {
  to: string;
  label: string;
  icon: IconName;
  roles?: Role[];
  end?: boolean;
}

const DESTINATIONS: Destination[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/events", label: "Events", icon: "event" },
  { to: "/dashboard", label: "My hub", icon: "space_dashboard", roles: ["participant", "visitor"] },
  { to: "/judge", label: "Judging", icon: "gavel", roles: ["judge"] },
  { to: "/organize", label: "Organize", icon: "dashboard", roles: ["organizer", "admin"] },
  { to: "/admin", label: "Admin", icon: "admin_panel_settings", roles: ["admin"] },
];

function useDestinations() {
  const { role } = useSession();
  return DESTINATIONS.filter((d) => !d.roles || (role && d.roles.includes(role)));
}

function RailItem({ d }: { d: Destination }) {
  return (
    <NavLink to={d.to} end={d.end} className="group focus-ring flex w-full flex-col items-center gap-1 rounded-lg py-1">
      {({ isActive }) => (
        <>
          <span
            className={cx(
              "state-layer grid h-8 w-14 place-items-center rounded-full transition-[background-color,width] duration-300 ease-[var(--ease-spring-fast)]",
              isActive ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
            )}
          >
            <Icon name={d.icon} filled={isActive} size={24} className="relative z-[1]" />
          </span>
          <span className={cx("type-label-md", isActive ? "text-on-surface" : "text-on-surface-variant")}>{d.label}</span>
        </>
      )}
    </NavLink>
  );
}

function ContextFab() {
  const { role } = useSession();
  if (role === "organizer" || role === "admin") {
    return (
      <Link to="/organize/new" aria-label="Create event" title="Create event" data-tour="context-fab" className="state-layer focus-ring grid h-14 w-14 place-items-center rounded-lg bg-tertiary-container text-on-tertiary-container shadow-1 transition-[border-radius] duration-300 ease-[var(--ease-spring-fast)] hover:shadow-2 active:rounded-xl">
        <Icon name="add" size={26} className="relative z-[1]" />
      </Link>
    );
  }
  if (role === "judge") {
    return (
      <Link to="/judge" aria-label="Continue judging" title="Continue judging" data-tour="context-fab" className="state-layer focus-ring grid h-14 w-14 place-items-center rounded-lg bg-tertiary-container text-on-tertiary-container shadow-1 active:rounded-xl">
        <Icon name="rate_review" size={26} className="relative z-[1]" />
      </Link>
    );
  }
  return (
    <Link to="/events" aria-label="Find a hackathon" title="Find a hackathon" data-tour="context-fab" className="state-layer focus-ring grid h-14 w-14 place-items-center rounded-lg bg-tertiary-container text-on-tertiary-container shadow-1 active:rounded-xl">
      <Icon name="rocket_launch" size={26} className="relative z-[1]" />
    </Link>
  );
}

function NotificationBell() {
  const { user } = useSession();
  const navigate = useNavigate();
  const q = useNotifications(Boolean(user));
  if (!user) return null;
  const unread = q.data?.unread ?? 0;
  return (
    <button
      type="button"
      onClick={() => navigate("/notifications")}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      data-tour="notifications"
      className="focus-ring relative grid h-10 w-10 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/8"
    >
      <Icon name="notifications" size={24} />
      {unread ? (
        <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 type-label-sm text-on-error">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  );
}

function UserMenu() {
  const { user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [theme, toggleTheme] = useTheme();
  // Show what a click will switch to: the moon in light mode, the sun in dark mode.
  const themeIcon: IconName = theme === "dark" ? "light_mode" : "dark_mode";
  const themeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  if (!user) {
    return (
      <div className="flex items-center gap-1" data-tour="user-menu">
        <IconButton icon={themeIcon} label={themeLabel} data-tour="theme-toggle" onClick={toggleTheme} />
        <LinkButton to="/login" variant="text" size="sm">
          Sign in
        </LinkButton>
        <LinkButton to="/register" size="sm" className="hidden sm:inline-flex">
          Join
        </LinkButton>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={themeIcon} label={themeLabel} onClick={toggleTheme} />
      <Menu
        trigger={({ toggle, open }) => (
          <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" data-tour="user-menu" className="focus-ring flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-on-surface/8">
            <Avatar name={user.name} size={36} />
            <Icon name="keyboard_arrow_down" size={20} className="text-on-surface-variant" />
          </button>
        )}
        header={
          <div className="flex items-center gap-3 border-b border-outline-variant pb-3">
            <Avatar name={user.name} size={44} />
            <div className="min-w-0">
              <p className="truncate type-title-sm text-on-surface">{user.name}</p>
              <p className="truncate type-body-sm text-on-surface-variant">{user.email}</p>
              <RoleBadge role={user.role} className="mt-1" />
            </div>
          </div>
        }
        items={[
          { label: "My profile", icon: "account_circle", onSelect: () => navigate("/profile") },
          { label: "Settings & API tokens", icon: "settings", onSelect: () => navigate("/settings") },
          { label: "My certificates", icon: "workspace_premium", onSelect: () => navigate("/dashboard#records") },
          { label: "API reference", icon: "api", onSelect: () => navigate("/api-docs") },
          {
            label: "Sign out",
            icon: "logout",
            danger: true,
            onSelect: () => setConfirmSignOut(true),
          },
        ]}
      />
      <Dialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out?"
        icon="logout"
        actions={
          <>
            <Button variant="text" onClick={() => setConfirmSignOut(false)}>Cancel</Button>
            <Button variant="danger" loading={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button>
          </>
        }
      >
        You'll be signed out of {user.email} on this device. Unsaved changes will be lost.
      </Dialog>
    </div>
  );
}

export function Shell() {
  const destinations = useDestinations();
  const location = useLocation();
  const bottom = destinations.slice(0, 5);
  return (
    <div className="min-h-dvh bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary">
        Skip to content
      </a>
      {/* Navigation rail (≥ 840px) */}
      <nav aria-label="Primary" data-tour="nav-rail" className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-6 bg-surface-container pb-6 pt-4 medium:flex">
        <Link to="/" aria-label="Dogfood home" className="focus-ring rounded-lg">
          <Logo size={44} />
        </Link>
        <ContextFab />
        <div className="flex w-full flex-1 flex-col items-center gap-3 px-2">
          {destinations.map((d) => (
            <RailItem key={d.to} d={d} />
          ))}
        </div>
        <TourMenu />
        <NavLink to="/api-docs" className="focus-ring flex flex-col items-center gap-1 rounded-lg text-on-surface-variant">
          <Icon name="api" size={22} />
          <span className="type-label-sm">API</span>
        </NavLink>
      </nav>

      <div className="medium:pl-24">
        <header data-tour="topbar" className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-surface/85 px-4 backdrop-blur-md medium:px-8">
          <Link to="/" className="flex items-center gap-2 medium:hidden" aria-label="Dogfood home">
            <Logo size={32} />
          </Link>
          <Link to="/" className="hidden items-baseline gap-2 medium:flex">
            <span className="font-rounded type-title-lg type-emphasized text-on-surface">Dogfood</span>
            <span className="type-label-md text-on-surface-variant">hackathon platform</span>
          </Link>
          <div className="flex-1" />
          <span data-tour="offline-badge" className="hidden items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 type-label-md text-on-surface-variant lg:inline-flex" title="Everything runs locally; no external services">
            <Icon name="cloud_off" size={16} /> Offline-first
          </span>
          <NotificationBell />
          <UserMenu />
        </header>
        <main id="main" key={location.pathname.split("/").slice(0, 3).join("/")} className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-2 medium:px-8 medium:pb-12">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Navigation bar (< 840px) */}
      <nav aria-label="Primary" data-tour="nav-bottom" className="fixed inset-x-0 bottom-0 z-30 flex h-20 items-stretch justify-around bg-surface-container px-2 medium:hidden">
        {bottom.map((d) => (
          <NavLink key={d.to} to={d.to} end={d.end} className="focus-ring flex flex-1 flex-col items-center justify-center gap-1 rounded-lg">
            {({ isActive }) => (
              <>
                <span className={cx("grid h-8 w-16 place-items-center rounded-full transition-colors", isActive ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant")}>
                  <Icon name={d.icon} filled={isActive} size={24} />
                </span>
                <span className={cx("type-label-md", isActive ? "text-on-surface" : "text-on-surface-variant")}>{d.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
