import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Camera,
  Gauge,
  History,
  Settings as SettingsIcon,
  Video,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Overview", icon: Gauge, end: true },
  { to: "/live", label: "Live Detection", icon: Camera },
  { to: "/video", label: "Video Analysis", icon: Video },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/history", label: "Detection History", icon: History },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-base-700/60 bg-space-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:shadow-none ${
        open ? "visible translate-x-0" : "invisible -translate-x-full"
      } lg:visible`}
    >
      <div className="flex items-center gap-3 border-b border-base-700/60 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan/20 to-violet/20 text-cyan-soft shadow-glow-soft ring-1 ring-inset ring-cyan/25">
          <Activity size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-primary">VisionTrack AI</p>
          <p className="text-[11px] text-ink-muted">Realtime Vision Suite</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-gradient-to-r from-cyan/15 via-violet/10 to-transparent text-cyan-soft"
                  : "text-ink-muted hover:bg-white/5 hover:text-ink-secondary"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-soft to-violet shadow-glow-soft"
                  />
                )}
                <Icon size={17} className="shrink-0" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-base-700/60 p-4 text-[11px] leading-relaxed text-ink-muted">
        Webcam and uploaded video are processed locally on this machine.
      </div>
    </aside>
  );
}