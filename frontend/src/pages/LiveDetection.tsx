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
    try {
      const stopped = await api.stopSession(session.id);
      setSession(stopped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [session]);

  const cudaAvailable = system.data?.cuda_available ?? false;
  const availableCameras = cameras.data?.filter((cam) => cam.available) ?? [];

  return (
    <div className="space-y-5">
      {error && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Webcam feed</h2>
            <StatusIndicator
              tone={active ? "green" : session?.status === "failed" ? "red" : "slate"}
              label={session ? `${session.status}` : "Idle"}
              pulse={!!active}
            />
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

          <div className="flex gap-2">
            <button
              disabled={!!active || starting}
              onClick={() => void start()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-soft disabled:opacity-50"
            >
              <Play size={16} /> {starting ? "Starting…" : "Start capture"}
            </button>
            <button
              disabled={!active}
              onClick={() => void stop()}
              className="inline-flex items-center gap-2 rounded-lg border border-base-700 px-4 py-2 text-sm text-slate-200 hover:bg-base-800 disabled:opacity-50"
            >
              <Square size={15} /> Stop
            </button>
          </div>

          {session?.status === "failed" && (
            <p className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              {session.error ?? "Camera session failed."}
            </p>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Capture configuration">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Camera device
                </label>
                <select
                  value={cameraIndex}
                  disabled={!!active}
                  onChange={(event) => setCameraIndex(Number(event.target.value))}
                  className="w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-sm text-slate-200 disabled:opacity-50"
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

              <ConfidenceSlider value={confidence} onChange={setConfidence} disabled={!!active} />

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">
                  Model
                  <select
                    value={model}
                    disabled={!!active}
                    onChange={(event) => setModel(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-slate-200 disabled:opacity-50"
                  >
                    {(models.data ?? []).map((item) => (
                      <option key={item.name} value={item.name} disabled={!item.available}>
                        {item.name}
                        {!item.available ? " (not downloaded)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Device
                  <select
                    value={device}
                    disabled={!!active}
                    onChange={(event) =>
                      setDevice(event.target.value as "auto" | "cpu" | "cuda")
                    }
                    className="mt-1 w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-slate-200 disabled:opacity-50"
                  >
                    <option value="auto">Auto ({cudaAvailable ? "CUDA" : "CPU"})</option>
                    <option value="cpu">CPU</option>
                    <option value="cuda" disabled={!cudaAvailable}>
                      CUDA {cudaAvailable ? "" : "(unavailable)"}
                    </option>
                  </select>
                </label>
              </div>

              <label className="block text-xs text-slate-400">
                Input size (imgsz)
                <select
                  value={imgsz}
                  disabled={!!active}
                  onChange={(event) => setImgsz(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-slate-200 disabled:opacity-50"
                >
                  {[192, 256, 320, 416, 480, 640, 800, 960, 1280].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-slate-400">
                Frame interval (run inference every N frames)
                <select
                  value={frameInterval}
                  disabled={!!active}
                  onChange={(event) => setFrameInterval(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-slate-200 disabled:opacity-50"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30].map((value) => (
                    <option key={value} value={value}>
                      {value === 1 ? "1 (every frame)" : value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={tracking}
                  disabled={!!active}
                  onChange={(event) => setTracking(event.target.checked)}
                  className="accent-accent"
                />
                Enable object tracking (ByteTrack IDs)
              </label>

              <ClassFilter
                classes={classOptions}
                selected={classes}
                onChange={setClasses}
                disabled={!!active}
              />
            </div>
          </Card>

          <Card title="Live detections">
            {live.data ? (
              <DetectionOverlay detections={live.data.detections} />
            ) : (
              <p className="rounded-lg border border-dashed border-base-700 px-3 py-6 text-center text-xs text-slate-500">
                Start a capture to see detections.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
