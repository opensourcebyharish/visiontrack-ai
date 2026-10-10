import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Card } from "../components/Card";
import { ClassFilter } from "../components/ClassFilter";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ConfidenceSlider } from "../components/ConfidenceSlider";
import { StatusIndicator } from "../components/StatusIndicator";
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
  const [saving, setSaving] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<"reset" | "cleanup" | null>(null);

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
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const saved = await api.updateSettings(draft);
      setDraft(saved);
      setStatus("Settings saved and applied to new sessions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setError(null);
    try {
      const resetSettings = await api.resetSettings();
      setDraft(resetSettings);
      setStatus("Settings reset to defaults.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cleanup = async () => {
    setCleaningUp(true);
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
    } finally {
      setCleaningUp(false);
    }
  };

  const cuda = system.data?.cuda_available ?? false;

  const lead = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-soft/80">
          Configuration &amp; environment
        </p>
        <h2 className="mt-1 text-xl font-semibold text-ink-primary">Settings</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Configure the YOLO detector, processing pipeline and data retention. Changes apply to new
          live and video sessions.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusIndicator
          tone={system.data ? (cuda ? "blue" : "green") : "slate"}
          label={
            system.data
              ? cuda
                ? `CUDA · ${system.data.cuda_device_name}`
                : "CPU inference"
              : "Detecting device…"
          }
        />
        <StatusIndicator
          tone="slate"
          label={system.data ? `v${system.data.version}` : "Loading…"}
        />
      </div>
    </div>
  );

  if (!draft) {
    return (
      <div className="space-y-5">
        {lead}
        <Card title="Settings">
          <p className="py-10 text-center text-sm text-ink-muted">Loading settings…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {lead}

      {status && (
        <p
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/10 px-3 py-2 text-sm text-accent-green"
        >
          <CheckCircle2 size={15} /> {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red"
        >
          {error}
        </p>
      )}

      <Card title="System" subtitle="Detected runtime and inference device">
        {system.data ? (
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Info label="App version" value={system.data.version} />
            <Info label="Python" value={system.data.python_version} />
            <Info label="PyTorch" value={system.data.torch_version} />
            <Info label="OpenCV" value={system.data.opencv_version} />
            <Info label="Ultralytics" value={system.data.ultralytics_version} />
            <Info
              label="Device"
              value={cuda ? `CUDA · ${system.data.cuda_device_name}` : "CPU"}
            />
            <Info label="Data directory" value={system.data.data_dir} />
            <Info
              label="Database size"
              value={formatBytes(
                Number((system.data.details as Record<string, unknown>)?.db_bytes ?? 0),
              )}
            />
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">Loading environment…</p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Detection" subtitle="Applies to new live and video sessions">
          <div className="space-y-5">
            <ConfidenceSlider
              value={draft.confidence}
              onChange={(v) => update("confidence", v)}
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="settings-iou" className="text-xs font-medium text-ink-secondary">
                  IoU threshold
                </label>
                <span className="font-mono text-xs text-cyan-soft">{draft.iou.toFixed(2)}</span>
              </div>
              <input
                id="settings-iou"
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={draft.iou}
                onChange={(event) => update("iou", Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-base-700/70 accent-cyan"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Overlap threshold for suppressing duplicate bounding boxes.
              </p>
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
                  <option value="auto">Auto ({cuda ? "CUDA" : "CPU"})</option>
                  <option value="cpu">CPU</option>
                  <option value="cuda" disabled={!cuda}>
                    CUDA {cuda ? "" : "(unavailable)"}
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
            <p className="-mt-3 text-[11px] leading-relaxed text-ink-muted">
              Weights marked (missing) are downloaded automatically on first use.
            </p>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={draft.tracking_enabled}
                onChange={(event) => update("tracking_enabled", event.target.checked)}
                className="accent-cyan size-3.5"
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
              <NumField
                label="Frame interval"
                value={draft.frame_interval}
                min={1}
                max={30}
                hint="Run inference every N frames."
                onChange={(v) => update("frame_interval", v)}
              />
              <NumField
                label="Max upload (MB)"
                value={draft.max_upload_mb}
                min={1}
                max={4096}
                onChange={(v) => update("max_upload_mb", v)}
              />
              <NumField
                label="JPEG quality"
                value={draft.jpeg_quality}
                min={20}
                max={100}
                onChange={(v) => update("jpeg_quality", v)}
              />
              <NumField
                label="Stream FPS"
                value={draft.stream_fps}
                min={1}
                max={60}
                onChange={(v) => update("stream_fps", v)}
              />
              <NumField
                label="Default camera index"
                value={draft.default_camera_index}
                min={0}
                max={16}
                onChange={(v) => update("default_camera_index", v)}
              />
              <NumField
                label="Capture width (0 = native)"
                value={draft.camera_width}
                min={0}
                max={3840}
                step={2}
                onChange={(v) => update("camera_width", v)}
              />
              <NumField
                label="Capture height (0 = native)"
                value={draft.camera_height}
                min={0}
                max={2160}
                step={2}
                hint="Best effort — some drivers ignore it."
                onChange={(v) => update("camera_height", v)}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
              Lower capture resolution and a higher frame interval reduce live CPU load. Camera
              capture size is best-effort and may be ignored by some drivers.
            </p>
          </Card>

          <Card title="Event logging" subtitle="Avoid storing a row for every frame">
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={draft.event_logging_enabled}
                  onChange={(event) => update("event_logging_enabled", event.target.checked)}
                  className="accent-cyan size-3.5"
                />
                Enable event logging
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={draft.log_all_detections}
                  onChange={(event) => update("log_all_detections", event.target.checked)}
                  className="accent-cyan size-3.5"
                />
                Log every detection (no sampling)
              </label>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <NumField
                  label="Sample interval (frames)"
                  value={draft.event_sample_interval}
                  min={1}
                  max={600}
                  onChange={(v) => update("event_sample_interval", v)}
                />
                <NumField
                  label="Min event confidence"
                  value={draft.min_event_confidence}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => update("min_event_confidence", v)}
                />
              </div>
            </div>
          </Card>

          <Card title="Line crossing" subtitle="Optional virtual line counter">
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={draft.line_crossing_enabled}
                  onChange={(event) => update("line_crossing_enabled", event.target.checked)}
                  className="accent-cyan size-3.5"
                />
                Enable line-crossing counts
              </label>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
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
                <NumField
                  label="Position (0-1)"
                  value={draft.line_position}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => update("line_position", v)}
                />
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

          <Card title="Data retention" subtitle="Automatically deletes old sessions and events">
            <div className="flex flex-wrap items-end gap-3">
              <NumField
                label="Retention (days, 0 = keep)"
                value={draft.data_retention_days}
                min={0}
                max={3650}
                className="w-36"
                onChange={(v) => update("data_retention_days", v)}
              />
              <button
                onClick={() => setConfirmState("cleanup")}
                disabled={cleaningUp}
                className="inline-flex items-center gap-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-xs font-medium text-accent-amber transition-colors hover:bg-accent-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} /> {cleaningUp ? "Cleaning…" : "Run cleanup now"}
              </button>
            </div>
            {cleanupResult && (
              <p className="mt-3 text-xs text-ink-secondary">{cleanupResult}</p>
            )}
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-space-950 shadow-glow-soft transition-colors hover:bg-cyan-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Save size={16} /> {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          onClick={() => setConfirmState("reset")}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-base-700/60 bg-space-800/70 px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={15} /> Reset to defaults
        </button>
      </div>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState === "reset" ? "Reset settings?" : "Run cleanup now?"}
        confirmLabel={confirmState === "reset" ? "Reset" : "Run cleanup"}
        danger={confirmState === "cleanup"}
        onConfirm={() => {
          const action = confirmState;
          setConfirmState(null);
          if (action === "reset") void reset();
          else if (action === "cleanup") void cleanup();
        }}
        onCancel={() => setConfirmState(null)}
      >
        {confirmState === "reset"
          ? "This restores every value on this page to its defaults. Unsaved changes are discarded."
          : `This permanently deletes sessions and events older than ${draft.data_retention_days} day(s) and cannot be undone.`}
      </ConfirmDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ink-secondary">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  className?: string;
  hint?: string;
  onChange: (value: number) => void;
}

function NumField({ label, value, min, max, step, className, hint, onChange }: NumFieldProps) {
  const outOfRange = value < min || value > max;
  return (
    <label className="block text-xs font-medium text-ink-secondary">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-invalid={outOfRange || undefined}
        className={`field mt-1 ${
          outOfRange ? "!border-accent-amber/70 ring-1 ring-accent-amber/30" : ""
        } ${className ?? ""}`}
      />
      {outOfRange ? (
        <span className="mt-1 block text-[10px] text-accent-amber">
          Outside {min}–{max}
        </span>
      ) : (
        hint && <span className="mt-1 block text-[10px] leading-relaxed text-ink-muted">{hint}</span>
      )}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700/60 bg-space-800/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xs text-ink-primary" title={value}>
        {value}
      </dd>
    </div>
  );
}