import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Boxes, Camera, Clock, Gauge, Hash, Play, Square } from "lucide-react";
import { Card } from "../components/Card";
import { ClassFilter } from "../components/ClassFilter";
import { ConfidenceSlider } from "../components/ConfidenceSlider";
import { DetectionOverlay } from "../components/DetectionOverlay";
import { LiveVideoPanel } from "../components/LiveVideoPanel";
import { MetricCard } from "../components/MetricCard";
import { StatusIndicator } from "../components/StatusIndicator";
import { useAsync, usePolling } from "../hooks/useApi";
import { api } from "../services/api";
import type { ClassInfo, Session, UserSettings } from "../types";
import { formatDecimal, formatNumber } from "../utils/format";

const selectClass =
  "mt-1 w-full rounded-lg border border-base-700/60 bg-space-800/70 px-2 py-1.5 text-sm text-ink-primary transition-colors focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/20 disabled:opacity-50";

export function LiveDetection() {
  const settingsState = useAsync<UserSettings>(() => api.settings());
  const cameras = useAsync(() => api.cameras(true));
  const system = useAsync(() => api.systemInfo());
  const models = useAsync(() => api.models());

  const [cameraIndex, setCameraIndex] = useState(0);
  const [confidence, setConfidence] = useState(0.25);
  const [model, setModel] = useState("yolo11n.pt");
  const [device, setDevice] = useState<"auto" | "cpu" | "cuda">("auto");
  const [imgsz, setImgsz] = useState(640);
  const [frameInterval, setFrameInterval] = useState(1);
  const [tracking, setTracking] = useState(true);
  const [classes, setClasses] = useState<number[] | null>(null);
  const [classOptions, setClassOptions] = useState<ClassInfo[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsState.data) {
      setConfidence(settingsState.data.confidence);
      setModel(settingsState.data.model);
      setDevice(settingsState.data.device);
      setImgsz(settingsState.data.imgsz);
      setFrameInterval(settingsState.data.frame_interval);
      setTracking(settingsState.data.tracking_enabled);
      setClasses(settingsState.data.classes);
      setCameraIndex(settingsState.data.default_camera_index);
    }
  }, [settingsState.data]);

  useEffect(() => {
    api
      .modelClasses(model)
      .then((result) => setClassOptions(result.classes))
      .catch(() => setClassOptions([]));
  }, [model]);

  const active = session && (session.status === "running" || session.status === "queued");
  const live = usePolling(
    () => (session ? api.liveMetrics(session.id) : Promise.resolve(null)),
    800,
    !!active,
  );
  const statusPoll = usePolling(
    () => (session ? api.session(session.id) : Promise.resolve(null)),
    1200,
    !!session,
  );

  useEffect(() => {
    if (statusPoll.data) setSession(statusPoll.data);
  }, [statusPoll.data]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const created = await api.createSession({
        source_type: "webcam",
        camera_index: cameraIndex,
        config: {
          confidence,
          model,
          device,
          imgsz,
          frame_interval: frameInterval,
          tracking_enabled: tracking,
          classes,
        },
      });
      setSession(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [cameraIndex, confidence, model, device, imgsz, frameInterval, tracking, classes]);

  const stop = useCallback(async () => {
    if (!session) return;
    setStopping(true);
    try {
      const stopped = await api.stopSession(session.id);
      setSession(stopped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  }, [session]);

  const cudaAvailable = system.data?.cuda_available ?? false;
  const availableCameras = cameras.data?.filter((cam) => cam.available) ?? [];
  const controlsLocked = !!active || starting || stopping;

  const sessionTone =
    stopping
      ? "amber"
      : active
        ? "green"
        : session?.status === "failed"
          ? "red"
          : session && (session.status === "created" || session.status === "queued")
            ? "amber"
            : "slate";
  const sessionLabel = stopping
    ? "Stopping…"
    : active
      ? "Session running"
      : session
        ? session.status
        : "No active session";

  const cameraTone = cameras.loading && !cameras.data ? "slate" : availableCameras.length > 0 ? "blue" : "amber";
  const cameraLabel =
    cameras.loading && !cameras.data
      ? "Detecting cameras…"
      : availableCameras.length > 0
        ? `${formatNumber(availableCameras.length)} camera(s) available`
        : "No camera detected";

  return (
    <div className="space-y-5">
      {error && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      {/* Page lead */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-soft/80">
            Live camera command center
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-primary">Webcam detection</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Run YOLO inference on a connected webcam with ByteTrack IDs — start a session, tune the
            detector, and watch annotated frames stream back in real time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusIndicator tone={sessionTone} label={sessionLabel} pulse={!!active} />
          <StatusIndicator tone={cameraTone} label={cameraLabel} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Feed + metrics + controls */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink-secondary">Live feed</h3>
            <span className="truncate font-mono text-[11px] text-ink-muted">
              {session ? `${session.name} · ${session.status}` : "No active session"}
            </span>
          </div>
          <LiveVideoPanel
            sessionId={session?.id ?? null}
            active={!!active}
            status={session?.status}
            message={session?.message}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="FPS"
              value={live.data?.fps !== null && live.data?.fps !== undefined ? formatDecimal(live.data.fps, 1) : "—"}
              unit="fps"
              icon={Gauge}
              accent="green"
            />
            <MetricCard
              label="Objects"
              value={live.data ? formatNumber(live.data.object_count) : "—"}
              icon={Boxes}
              accent="blue"
            />
            <MetricCard
              label="Unique tracked"
              value={live.data ? formatNumber(live.data.unique_tracks) : "—"}
              icon={Hash}
              accent="violet"
            />
            <MetricCard
              label="Inference"
              value={live.data?.inference_ms != null ? formatDecimal(live.data.inference_ms, 0) : "—"}
              unit="ms"
              icon={Clock}
              accent="amber"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={controlsLocked}
              onClick={() => void start()}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-space-950 shadow-glow-soft transition-colors hover:bg-cyan-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <Play size={16} /> {starting ? "Starting…" : "Start capture"}
            </button>
            <button
              disabled={!active || stopping}
              onClick={() => void stop()}
              className="inline-flex items-center gap-2 rounded-lg border border-base-700/60 bg-space-800/70 px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Square size={15} /> {stopping ? "Stopping…" : "Stop"}
            </button>
          </div>

          {session?.status === "failed" && (
            <p className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              {session.error ?? "Camera session failed."}
            </p>
          )}
        </div>

        {/* Configuration + detections */}
        <div className="space-y-5">
          <Card title="Capture configuration">
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Source
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">
                    Camera device
                  </label>
                  <select
                    value={cameraIndex}
                    disabled={controlsLocked}
                    onChange={(event) => setCameraIndex(Number(event.target.value))}
                    className={selectClass}
                  >
                    {(cameras.data ?? []).map((cam) => (
                      <option key={cam.index} value={cam.index} disabled={!cam.available}>
                        {cam.name}
                        {cam.available
                          ? cam.width
                            ? ` · ${cam.width}×${cam.height}`
                            : " · available"
                          : " · unavailable"}
                      </option>
                    ))}
                  </select>
                  {cameras.data && availableCameras.length === 0 && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-amber">
                      <Camera size={12} /> No camera detected. Connect a webcam to enable capture.
                    </p>
                  )}
                </div>
              </div>

              <div className="h-px bg-base-700/60" />

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Detector
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-ink-secondary">
                    Model
                    <select
                      value={model}
                      disabled={controlsLocked}
                      onChange={(event) => setModel(event.target.value)}
                      className={selectClass}
                    >
                      {(models.data ?? []).map((item) => (
                        <option key={item.name} value={item.name} disabled={!item.available}>
                          {item.name}
                          {!item.available ? " (not downloaded)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-ink-secondary">
                    Device
                    <select
                      value={device}
                      disabled={controlsLocked}
                      onChange={(event) =>
                        setDevice(event.target.value as "auto" | "cpu" | "cuda")
                      }
                      className={selectClass}
                    >
                      <option value="auto">Auto ({cudaAvailable ? "CUDA" : "CPU"})</option>
                      <option value="cpu">CPU</option>
                      <option value="cuda" disabled={!cudaAvailable}>
                        CUDA {cudaAvailable ? "" : "(unavailable)"}
                      </option>
                    </select>
                  </label>
                </div>

                <label className="mt-3 block text-xs font-medium text-ink-secondary">
                  Input size (imgsz)
                  <select
                    value={imgsz}
                    disabled={controlsLocked}
                    onChange={(event) => setImgsz(Number(event.target.value))}
                    className={selectClass}
                  >
                    {[192, 256, 320, 416, 480, 640, 800, 960, 1280].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block text-xs font-medium text-ink-secondary">
                  Frame interval (run inference every N frames)
                  <select
                    value={frameInterval}
                    disabled={controlsLocked}
                    onChange={(event) => setFrameInterval(Number(event.target.value))}
                    className={selectClass}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30].map((value) => (
                      <option key={value} value={value}>
                        {value === 1 ? "1 (every frame)" : value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={tracking}
                    disabled={controlsLocked}
                    onChange={(event) => setTracking(event.target.checked)}
                    className="accent-cyan size-3.5"
                  />
                  Enable object tracking (ByteTrack IDs)
                </label>
              </div>

              <div className="h-px bg-base-700/60" />

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Confidence &amp; classes
                </p>
                <ConfidenceSlider value={confidence} onChange={setConfidence} disabled={controlsLocked} />
                <div className="mt-4">
                  <ClassFilter
                    classes={classOptions}
                    selected={classes}
                    onChange={setClasses}
                    disabled={controlsLocked}
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Live detections" subtitle={active ? "Current frame detections" : "No active session"}>
            {live.data ? (
              <DetectionOverlay detections={live.data.detections} />
            ) : (
              <p className="rounded-lg border border-dashed border-base-700/60 px-3 py-6 text-center text-xs text-ink-muted">
                Start a capture to see detections.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}