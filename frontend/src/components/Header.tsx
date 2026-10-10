import { Menu, Server, Cpu, Zap } from "lucide-react";
import { usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import type { HealthResponse, SystemInfo } from "../types";
import { StatusIndicator } from "./StatusIndicator";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenu: () => void;
}

export function Header({ title, subtitle, onMenu }: HeaderProps) {
  const health = usePolling<HealthResponse>(() => api.health(), 5000);
  const system = usePolling<SystemInfo>(() => api.systemInfo(), 15000);

  const connected = !!health.data && !health.error;
  const device = system.data?.device ?? "—";
  const deviceLabel = device.startsWith("cuda")
    ? `GPU · ${system.data?.cuda_device_name ?? "CUDA"}`
    : "CPU";

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-base-700/60 bg-space-900/80 px-4 py-3 backdrop-blur-xl lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg border border-base-700/60 p-2 text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary active:scale-95 lg:hidden"
          aria-label="Toggle navigation"
        >
          <Menu size={18} />
        </button>
        <div>
          <h1 className="text-base font-semibold text-ink-primary">{title}</h1>
          {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusIndicator
          tone={connected ? "green" : "red"}
          label={connected ? "Backend connected" : "Backend offline"}
          pulse={connected}
        />
        <StatusIndicator
          tone={device.startsWith("cuda") ? "violet" : "blue"}
          label={deviceLabel}
        />
        {system.data && (
          <div className="hidden items-center gap-3 rounded-full border border-base-700/60 bg-space-800/70 px-3 py-1 text-xs text-ink-secondary md:flex">
            <span className="inline-flex items-center gap-1">
              <Cpu size={13} className="text-cyan-soft/70" /> {system.data.python_version}
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap size={13} className="text-cyan-soft/70" /> YOLO
            </span>
            <span className="inline-flex items-center gap-1">
              <Server size={13} className="text-cyan-soft/70" /> v{system.data.version}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}