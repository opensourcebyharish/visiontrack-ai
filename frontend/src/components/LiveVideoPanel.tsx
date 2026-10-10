import { useState } from "react";
import { MonitorPlay, VideoOff } from "lucide-react";
import { api } from "../services/api";

interface LiveVideoPanelProps {
  sessionId: string | null;
  active: boolean;
  status?: string;
  message?: string | null;
}

export function LiveVideoPanel({ sessionId, active, status, message }: LiveVideoPanelProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-base-700 bg-black">
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
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            {active ? <MonitorPlay size={40} /> : <VideoOff size={40} />}
            <p className="text-sm">
              {active
                ? message || "Waiting for the first annotated frame…"
                : "No active capture. Start a webcam session to see live detections."}
            </p>
            {status && <p className="text-xs text-slate-600">Status: {status}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
