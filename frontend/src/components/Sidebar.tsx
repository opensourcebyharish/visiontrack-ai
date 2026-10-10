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
      className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-base-700 bg-base-900 transition-transform lg:static lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-base-700 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
          <Activity size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">VisionTrack AI</p>
          <p className="text-[11px] text-slate-500">Realtime Vision Suite</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-accent/15 text-accent-soft"
                  : "text-slate-400 hover:bg-base-800 hover:text-slate-200"
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-base-700 p-4 text-[11px] leading-relaxed text-slate-500">
        Webcam and uploaded video are processed locally on this machine.
      </div>
    </aside>
  );
}
