import { useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { Card } from "../components/Card";
import { EventTable } from "../components/EventTable";
import { SessionTable } from "../components/SessionTable";
import { usePolling } from "../hooks/useApi";
import { api } from "../services/api";

export function History() {
  const sessions = usePolling(() => api.sessions({ limit: 100 }), 5000);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Card
        title="Detection history"
        subtitle="All processing sessions with stored detection events"
        actions={<HistoryIcon size={15} className="text-slate-500" />}
      >
        <SessionTable
          sessions={sessions.data?.items ?? []}
          loading={sessions.loading}
          onSelect={(id) => setSelected(id === selected ? null : id)}
          onStop={async (id) => {
            await api.stopSession(id);
            sessions.refresh();
          }}
          onDelete={async (id) => {
            if (!window.confirm("Delete this session and all of its events?")) return;
            try {
              await api.deleteSession(id);
              if (selected === id) setSelected(null);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : String(err));
            }
            sessions.refresh();
          }}
          emptyMessage="No sessions recorded yet."
        />
      </Card>

      <Card
        title={selected ? "Events for selected session" : "All detection events"}
        subtitle="Filter, review and export detections as CSV"
      >
        <EventTable
          sessions={sessions.data?.items ?? []}
          fixedSessionId={selected ?? undefined}
          pageSize={20}
        />
      </Card>
    </div>
  );
}
