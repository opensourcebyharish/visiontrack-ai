import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileVideo, Square, UploadCloud } from "lucide-react";
import { api } from "../services/api";
import type { UploadResponse, UserSettings, VideoStatusResponse } from "../types";
import { formatBytes, formatDuration, formatNumber } from "../utils/format";

interface UploadPanelProps {
  settings: UserSettings;
  onFinished?: (sessionId: string) => void;
}

const TERMINAL = new Set(["completed", "cancelled", "failed", "stopped"]);

const fieldClass =
  "mt-1 w-full rounded-lg border border-base-700/60 bg-space-800/70 px-2 py-1.5 text-sm text-ink-primary transition-colors focus:border-cyan/50 focus:outline-none focus:ring-2 focus:ring-cyan/20";

export function UploadPanel({ settings, onFinished }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [status, setStatus] = useState<VideoStatusResponse | null>(null);
  const [confidence, setConfidence] = useState(settings.confidence);
  const [frameInterval, setFrameInterval] = useState(settings.frame_interval);
  const [useTracking, setUseTracking] = useState(settings.tracking_enabled);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfidence(settings.confidence);
    setFrameInterval(settings.frame_interval);
    setUseTracking(settings.tracking_enabled);
  }, [settings]);

  const videoId = upload?.video_id ?? null;
  const finished = status ? TERMINAL.has(status.session.status) : false;

  useEffect(() => {
    if (!videoId || finished) return;
    let active = true;
    const poll = async () => {
      try {
        const next = await api.videoStatus(videoId);
        if (active) setStatus(next);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void poll();
    const timer = window.setInterval(poll, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [videoId, finished]);

  const maxBytes = settings.max_upload_mb * 1024 * 1024;

  const applyFile = useCallback(
    (next: File | null) => {
      setFile(next);
      if (!next) {
        setValidation(null);
        return;
      }
      if (next.type && !next.type.startsWith("video/")) {
        setValidation(
          `"${next.name}" isn't a video file (detected ${next.type}). Supported: MP4, AVI, MOV, MKV, WEBM.`,
        );
      } else if (maxBytes > 0 && next.size > maxBytes) {
        setValidation(
          `"${next.name}" is ${formatBytes(next.size)} — larger than the ${settings.max_upload_mb} MB limit.`,
        );
      } else {
        setValidation(null);
      }
    },
    [maxBytes, settings.max_upload_mb],
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setStatus(null);
    try {
      const response = await api.uploadVideo(file, {
        confidence: String(confidence),
        frame_interval: String(frameInterval),
        tracking_enabled: String(useTracking),
      });
      setUpload(response);
      setStatus({
        session: response.session,
        progress: response.session.progress,
        output_available: response.session.output_available,
        download_url: response.session.download_url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }, [file, confidence, frameInterval, useTracking]);

  const handleCancel = useCallback(async () => {
    if (!videoId) return;
    try {
      await api.stopSession(videoId);
      const next = await api.videoStatus(videoId);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [videoId]);

  useEffect(() => {
    if (finished && videoId && onFinished) onFinished(videoId);
  }, [finished, videoId, onFinished]);

  const progress = status ? Math.round(status.session.progress * 100) : 0;
  const session = status?.session;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          applyFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-cyan/70 bg-cyan-dim/40 shadow-glow-soft"
            : "border-base-700/60 bg-space-850/40 hover:border-base-600"
        }`}
      >
        <UploadCloud size={30} className={dragging ? "text-cyan-soft" : "text-cyan-soft/70"} />
        <p className="mt-2 text-sm text-ink-secondary">
          Drag &amp; drop a video here, or{" "}
          <button
            className="font-medium text-cyan-soft underline decoration-cyan/40 underline-offset-2 transition-colors hover:text-cyan"
            onClick={() => inputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Supported: MP4, AVI, MOV, MKV, WEBM · max {settings.max_upload_mb} MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            applyFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        {file && (
          <span className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-cyan/30 bg-cyan-dim px-3 py-1.5 text-xs text-cyan-soft">
            <FileVideo size={14} className="shrink-0" />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 font-mono text-cyan-soft/70">{formatBytes(file.size)}</span>
          </span>
        )}
      </div>

      {validation && (
        <p className="inline-flex items-start gap-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-xs text-accent-amber">
          <AlertCircle size={14} className="mt-px shrink-0" /> {validation}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-ink-secondary">
          Confidence
          <input
            type="number"
            min={0.05}
            max={0.95}
            step={0.05}
            value={confidence}
            onChange={(event) => setConfidence(Number(event.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-medium text-ink-secondary">
          Frame interval
          <input
            type="number"
            min={1}
            max={30}
            value={frameInterval}
            onChange={(event) => setFrameInterval(Number(event.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="flex items-center gap-2 pt-5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={useTracking}
            onChange={(event) => setUseTracking(event.target.checked)}
            className="accent-cyan size-3.5"
          />
          Enable tracking IDs
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={!file || uploading || !!validation}
          onClick={() => void handleUpload()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-space-950 shadow-glow-soft transition-colors hover:bg-cyan-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <UploadCloud size={16} />
          {uploading ? "Uploading…" : "Upload & process"}
        </button>
        {videoId && !finished && (
          <button
            onClick={() => void handleCancel()}
            className="inline-flex items-center gap-2 rounded-lg border border-base-700/60 bg-space-800/70 px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-white/5 hover:text-accent-red"
          >
            <Square size={14} /> Cancel
          </button>
        )}
      </div>

      {error && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          <AlertCircle size={14} /> {error}
        </p>
      )}

      {session && (
        <div className="space-y-4 rounded-xl border border-base-700/60 bg-space-850/50 p-4 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink-primary">
              {session.status === "completed" ? (
                <CheckCircle2 size={16} className="shrink-0 text-accent-green" />
              ) : session.status === "failed" ? (
                <AlertCircle size={16} className="shrink-0 text-accent-red" />
              ) : session.status === "cancelled" || session.status === "stopped" ? (
                <Square size={16} className="shrink-0 text-ink-muted" />
              ) : (
                <UploadCloud size={16} className="shrink-0 text-accent-amber" />
              )}
              <span className="truncate">{session.name}</span>
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                session.status === "completed"
                  ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
                  : session.status === "failed"
                    ? "border-accent-red/40 bg-accent-red/10 text-accent-red"
                    : session.status === "cancelled" || session.status === "stopped"
                      ? "border-base-700/60 bg-space-800/60 text-ink-muted"
                      : "border-accent-amber/40 bg-accent-amber/10 text-accent-amber"
              }`}
            >
              {session.status}
            </span>
          </div>

          {session.message && !finished && (
            <p className="text-xs text-ink-muted">{session.message}</p>
          )}

          {!finished && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-space-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan to-violet transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {progress}% · {formatNumber(session.processed_frames)} /{" "}
                {formatNumber(session.total_frames)} frames
              </p>
            </div>
          )}

          {upload?.metadata && (
            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat
                label="Resolution"
                value={`${String(upload.metadata.width)}×${String(upload.metadata.height)}`}
              />
              <Stat label="Source FPS" value={String(upload.metadata.fps ?? "—")} />
              <Stat label="Duration" value={formatDuration(Number(upload.metadata.duration_s))} />
              <Stat label="Frames" value={formatNumber(Number(upload.metadata.frame_count))} />
            </dl>
          )}

          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Processed" value={formatNumber(session.processed_frames)} />
            <Stat label="Unique tracks" value={formatNumber(session.unique_tracks)} />
            <Stat label="Events" value={formatNumber(session.event_count)} />
            <Stat
              label="Avg FPS"
              value={session.avg_fps !== null ? session.avg_fps.toFixed(1) : "—"}
            />
          </dl>

          {session.error && (
            <p className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              {session.error}
            </p>
          )}

          {status?.output_available && videoId && (
            <div className="space-y-2">
              <video
                controls
                preload="metadata"
                src={api.downloadUrl(videoId)}
                aria-label="Annotated video preview"
                className="w-full rounded-lg border border-base-700/60 bg-black"
              />
              <a
                href={api.downloadUrl(videoId)}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-green/15 px-3 py-2 text-sm font-medium text-accent-green ring-1 ring-inset ring-accent-green/30 transition-colors hover:bg-accent-green/25"
              >
                <Download size={15} /> Download annotated video
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700/60 bg-space-800/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="font-mono text-sm text-ink-primary">{value}</dd>
    </div>
  );
}