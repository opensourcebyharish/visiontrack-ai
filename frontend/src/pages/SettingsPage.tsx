import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Card } from "../components/Card";
import { ClassFilter } from "../components/ClassFilter";
import { ConfidenceSlider } from "../components/ConfidenceSlider";
import { useAsync } from "../hooks/useApi";
import { api } from "../services/api";
import type { ClassInfo, SystemInfo, UserSettings } from "../types";
import { formatBytes } from "../utils/format";

export function SettingsPage() {
  const settingsState = useAsync<UserSettings>(() => api.settings());
  const system = useAsync<SystemInfo>(() => api.systemInfo());
  const models = useAsync(() => api.models());

  const [draft, setDraft] = useState<UserSettings | null>(null);
  const [classOptions, setClassOptions] = useState<ClassInfo[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    if (settingsState.data) setDraft(settingsState.data);
  }, [settingsState.data]);

  useEffect(() => {
    if (!draft) return;
    api
      .modelClasses(draft.model)
      .then((result) => setClassOptions(result.classes))
      .catch(() => setClassOptions([]));
  }, [draft?.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    if (!draft) return;
    setStatus(null);
    setError(null);
    try {
      const saved = await api.updateSettings(draft);
      setDraft(saved);
      setStatus("Settings saved and applied to new sessions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset all settings to their defaults?")) return;
    try {
      const resetSettings = await api.resetSettings();
      setDraft(resetSettings);
      setStatus("Settings reset to defaults.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cleanup = async () => {
    setCleanupResult(null);
    setError(null);
    try {
      const result = await api.cleanup();
      setCleanupResult(
        `Removed ${result.deleted_sessions ?? 0} session(s) and ${
          result.deleted_events ?? 0
        } event(s) older than ${result.retention_days ?? 0} day(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!draft) {
    return <Card title="Settings">Loading settings…</Card>;
  }

  return (
    <div className="space-y-5">
      {status && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
          <CheckCircle2 size={15} /> {status}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          {error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Detection" subtitle="Applies to new live and video sessions">
          <div className="space-y-4">
            <ConfidenceSlider value={draft.confidence} onChange={(v) => update("confidence", v)} />
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">IoU threshold</label>
                <span className="font-mono text-xs text-accent-soft">{draft.iou.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={draft.iou}
                onChange={(event) => update("iou", Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-base-700 accent-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Model">
                <select
                  value={draft.model}
                  onChange={(event) => update("model", event.target.value)}
                  className="field"
                >
                  {(models.data ?? []).map((item) => (
                    <option key={item.name} value={item.name} disabled={!item.available}>
                      {item.name}
                      {!item.available ? " (missing)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Input size">
                <select
                  value={draft.imgsz}
                  onChange={(event) => update("imgsz", Number(event.target.value))}
                  className="field"
                >
                  {[192, 256, 320, 416, 480, 640, 800, 960, 1280].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Device">
                <select
                  value={draft.device}
                  onChange={(event) =>
                    update("device", event.target.value as UserSettings["device"])
                  }
                  className="field"
                >
                  <option value="auto">Auto ({system.data?.cuda_available ? "CUDA" : "CPU"})</option>
                  <option value="cpu">CPU</option>
                  <option value="cuda" disabled={!system.data?.cuda_available}>
                    CUDA {system.data?.cuda_available ? "" : "(unavailable)"}
                  </option>
                </select>
              </Field>
              <Field label="Tracker">
                <select
                  value={draft.tracker}
                  onChange={(event) => update("tracker", event.target.value)}
                  className="field"
                >
                  <option value="bytetrack.yaml">ByteTrack</option>
                  <option value="botsort.yaml">BoT-SORT</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={draft.tracking_enabled}
                onChange={(event) => update("tracking_enabled", event.target.checked)}
                className="accent-accent"
              />
              Enable object tracking (persistent IDs)
            </label>

            <ClassFilter
              classes={classOptions}
              selected={draft.classes}
              onChange={(value) => update("classes", value)}
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Processing" subtitle="Performance and resource controls">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frame interval">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.frame_interval}
                  onChange={(event) => update("frame_interval", Number(event.target.value))}
                  className="field"
                />
              </Field>
              <Field label="Max upload (MB)">
                <input
                  type="number"
                  min={1}
                  max={4096}
                  value={draft.max_upload_mb}
                  onChange={(event) => update("max_upload_mb", Number(event.target.value))}
                  className="field"
                />
              </Field>
              <Field label="JPEG quality">
                <input
                  type="number"
                  min={20}
                  max={100}
                  value={draft.jpeg_quality}
                  onChange={(event) => update("jpeg_quality", Number(event.target.value))}
                  className="field"
                />
              </Field>
              <Field label="Stream FPS">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.stream_fps}
                  onChange={(event) => update("stream_fps", Number(event.target.value))}
                  className="field"
                />
              </Field>
              <Field label="Default camera index">
                <input
                  type="number"
                  min={0}
                  max={16}
                  value={draft.default_camera_index}
                  onChange={(event) => update("default_camera_index", Number(event.target.value))}
                  className="field"
                />
              </Field>
              <Field label="Capture width (0 = native)">
                <input
                  type="number"
                  min={0}
                  max={3840}
                  step={2}
                  value={draft.camera_width}
                  onChange={(event) => update("camera_width", Number(event.target.value))}
                  className="field"
                />
              </Field>
              <Field label="Capture height (0 = native)">
                <input
                  type="number"
                  min={0}
                  max={2160}
                  step={2}
                  value={draft.camera_height}
                  onChange={(event) => update("camera_height", Number(event.target.value))}
                  className="field"
                />
              </Field>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Lower capture resolution and a higher frame interval reduce live CPU load.
              Camera capture size is best-effort and may be ignored by some drivers.
            </p>
          </Card>

          <Card title="Event logging" subtitle="Avoid storing a row for every frame">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={draft.event_logging_enabled}
                  onChange={(event) => update("event_logging_enabled", event.target.checked)}
                  className="accent-accent"
                />
                Enable event logging
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={draft.log_all_detections}
                  onChange={(event) => update("log_all_detections", event.target.checked)}
                  className="accent-accent"
                />
                Log every detection (no sampling)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sample interval (frames)">
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={draft.event_sample_interval}
                    onChange={(event) =>
                      update("event_sample_interval", Number(event.target.value))
                    }
                    className="field"
                  />
                </Field>
                <Field label="Min event confidence">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.min_event_confidence}
                    onChange={(event) =>
                      update("min_event_confidence", Number(event.target.value))
                    }
                    className="field"
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Line crossing" subtitle="Optional virtual line counter">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={draft.line_crossing_enabled}
                  onChange={(event) => update("line_crossing_enabled", event.target.checked)}
                  className="accent-accent"
                />
                Enable line-crossing counts
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Orientation">
                  <select
                    value={draft.line_orientation}
                    onChange={(event) =>
                      update("line_orientation", event.target.value as "horizontal" | "vertical")
                    }
                    className="field"
                  >
                    <option value="vertical">Vertical</option>
                    <option value="horizontal">Horizontal</option>
                  </select>
                </Field>
                <Field label="Position (0-1)">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.line_position}
                    onChange={(event) => update("line_position", Number(event.target.value))}
                    className="field"
                  />
                </Field>
                <Field label="Direction">
                  <select
                    value={draft.line_direction}
                    onChange={(event) =>
                      update(
                        "line_direction",
                        event.target.value as "both" | "positive" | "negative",
                      )
                    }
                    className="field"
                  >
                    <option value="both">Both</option>
                    <option value="positive">Positive</option>
                    <option value="negative">Negative</option>
                  </select>
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Data retention">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Retention (days, 0 = keep)">
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={draft.data_retention_days}
                  onChange={(event) => update("data_retention_days", Number(event.target.value))}
                  className="field w-36"
                />
              </Field>
              <button
                onClick={() => void cleanup()}
                className="inline-flex items-center gap-2 rounded-lg border border-base-700 px-3 py-2 text-xs text-slate-300 hover:bg-base-800"
              >
                <Trash2 size={14} /> Run cleanup now
              </button>
            </div>
            {cleanupResult && (
              <p className="mt-3 text-xs text-slate-400">{cleanupResult}</p>
            )}
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-soft"
        >
          <Save size={16} /> Save settings
        </button>
        <button
          onClick={() => void reset()}
          className="inline-flex items-center gap-2 rounded-lg border border-base-700 px-4 py-2 text-sm text-slate-200 hover:bg-base-800"
        >
          <RotateCcw size={15} /> Reset to defaults
        </button>
      </div>

      <Card title="Environment" subtitle="Detected runtime and inference device">
        {system.data ? (
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Info label="App version" value={system.data.version} />
            <Info label="Python" value={system.data.python_version} />
            <Info label="PyTorch" value={system.data.torch_version} />
            <Info label="OpenCV" value={system.data.opencv_version} />
            <Info label="Ultralytics" value={system.data.ultralytics_version} />
            <Info
              label="Device"
              value={
                system.data.cuda_available
                  ? `CUDA · ${system.data.cuda_device_name}`
                  : "CPU"
              }
            />
            <Info label="Data directory" value={system.data.data_dir} />
            <Info
              label="Database size"
              value={formatBytes(Number((system.data.details as Record<string, unknown>)?.db_bytes ?? 0))}
            />
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Loading environment…</p>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-800/60 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="truncate font-mono text-xs text-slate-200" title={value}>
        {value}
      </dd>
    </div>
  );
}
