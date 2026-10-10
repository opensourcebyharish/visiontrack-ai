import { useState } from "react";
import { MonitorPlay, VideoOff } from "lucide-react";
import { api } from "../services/api";

interface LiveVideoPanelProps {
  sessionId: string | null;
  active: boolean;
  status?: string;
  message?: string | null;
}

/** Genuine stream state derived only from real session props. */
function streamState(
  sessionId: string | null,
  active: boolean,
  status: string | undefined,
  errored: boolean,
): { tone: "green" | "amber" | "red" | "slate"; label: string } {
  if (!sessionId) return { tone: "slate", label: "Offline" };
  switch (status) {
    case "failed":
      return { tone: "red", label: "Failed" };
    case "stopped":
    case "cancelled":
    case "completed":
      return { tone: "slate", label: "Stopped" };
    case "created":
    case "queued":
      return { tone: "amber", label: "Starting" };
    case "running":
      if (active && !errored) return { tone: "green", label: "Live" };
      if (active && errored) return { tone: "amber", label: "Reconnecting" };
      return { tone: "slate", label: "Stopped" };
    default:
      return { tone: "slate", label: "Idle" };
  }
}

const dotTone: Record<"green" | "amber" | "red" | "slate", string> = {
  green: "bg-accent-green",
  amber: "bg-accent-amber",
  red: "bg-accent-red",
  slate: "bg-slate-500",
};

export function LiveVideoPanel({ sessionId, active, status, message }: LiveVideoPanelProps) {
  const [errored, setErrored] = useState(false);
  const state = streamState(sessionId, active, status, errored);

  return (
    <div className="relative overflow-hidden rounded-xl border border-base-700/60 bg-black shadow-panel">
      {/* Cinematic HUD chrome — decorative, never intercepts input. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-1 z-10">
        <span className="absolute left-0 top-0 h-4 w-4 rounded-tl-lg border-l-2 border-t-2 border-cyan/70" />
        <span className="absolute right-0 top-0 h-4 w-4 rounded-tr-lg border-r-2 border-t-2 border-cyan/70" />
        <span className="absolute bottom-0 left-0 h-4 w-4 rounded-bl-lg border-b-2 border-l-2 border-cyan/70" />
        <span className="absolute bottom-0 right-0 h-4 w-4 rounded-br-lg border-b-2 border-r-2 border-cyan/70" />
      </div>
      {/* Restrained scanline: transform-only sweep, hidden under reduced motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(to_bottom,rgba(103,232,249,0.4)_0px,rgba(103,232,249,0.4)_2px,transparent_2px)] motion-safe:animate-scanline motion-reduce:hidden"
      />

      <div className="relative aspect-video w-full">
        {sessionId && active && !errored ? (
          <img
            key={sessionId}
            src={api.streamUrl(sessionId)}
            alt="Live annotated detection stream"
            className="h-full w-full object-contain"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-ink-muted">
            {active ? <MonitorPlay size={40} /> : <VideoOff size={40} />}
            <p className="text-sm text-ink-secondary">
              {active
                ? status === "failed"
                  ? "Camera session failed to start."
                  : message || "Waiting for the first annotated frame…"
                : "No active capture. Start a webcam session to see live detections."}
            </p>
            {status && <p className="text-xs text-ink-muted/70">Status: {status}</p>}
          </div>
        )}
      </div>

      {/* Live connection chip — mirrors real session status, aria-hidden (the
          page already exposes status to assistive tech). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-secondary ring-1 ring-inset ring-white/10 backdrop-blur-sm"
      >
        <span
          className={`inline-flex h-1.5 w-1.5 rounded-full ${dotTone[state.tone]}${
            state.tone === "green" ? " animate-pulse" : ""
          }`}
        />
        {state.label}
      </span>
    </div>
  );
}