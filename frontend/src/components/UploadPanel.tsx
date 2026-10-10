import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileVideo, Square, UploadCloud } from "lucide-react";
import { api } from "../services/api";
import type { UploadResponse, UserSettings, VideoStatusResponse } from "../types";
import { formatBytes, formatDuration, formatNumber } from "../utils/format";

interface UploadPanelProps {
  settings: UserSettings;
  onFinished?: (sessionId: string) => void;
}

const TERMINAL = new Set(["completed", "cancelled", "failed", "stopped"]);

export function UploadPanel({ settings, onFinished }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-base-700 bg-base-850/40"
        }`}
      >
        <UploadCloud className="mb-2 text-slate-400" size={30} />
        <p className="text-sm text-slate-300">
          Drag &amp; drop a video here, or{" "}
          <button
            className="text-accent-soft hover:underline"
            onClick={() => inputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Supported: MP4, AVI, MOV, MKV, WEBM · max {settings.max_upload_mb} MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {file && (
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-300">
            <FileVideo size={14} /> {file.name} · {formatBytes(file.size)}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-400">
          Confidence
          <input
            type="number"
            min={0.05}
            max={0.95}
            step={0.05}
            value={confidence}
            onChange={(event) => setConfidence(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-slate-200"
          />
        </label>
        <label className="text-xs text-slate-400">
          Frame interval
          <input
            type="number"
            min={1}
            max={30}
            value={frameInterval}
            onChange={(event) => setFrameInterval(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-base-700 bg-base-800 px-2 py-1.5 text-slate-200"
          />
        </label>
        <label className="flex items-center gap-2 pt-5 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={useTracking}
            onChange={(event) => setUseTracking(event.target.checked)}
            className="accent-accent"
          />
          Enable tracking IDs
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={!file || uploading}
          onClick={() => void handleUpload()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-soft disabled:opacity-50"
        >
          <UploadCloud size={16} />
          {uploading ? "Uploading…" : "Upload & process"}
        </button>
        {videoId && !finished && (
          <button
            onClick={() => void handleCancel()}
            className="inline-flex items-center gap-2 rounded-lg border border-base-700 px-3 py-2 text-sm text-slate-300 hover:bg-base-800"
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
        <div className="space-y-3 rounded-xl border border-base-700 bg-base-850/60 p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm text-slate-200">
              {session.status === "completed" ? (
                <CheckCircle2 size={16} className="text-accent-green" />
              ) : session.status === "failed" ? (
                <AlertCircle size={16} className="text-accent-red" />
              ) : (
                <UploadCloud size={16} className="text-accent-amber" />
              )}
              {session.name}
            </span>
            <span className="text-xs capitalize text-slate-400">{session.status}</span>
          </div>

          {!finished && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
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
            <a
              href={api.downloadUrl(videoId)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-green/15 px-3 py-2 text-sm text-accent-green hover:bg-accent-green/25"
            >
              Download annotated video
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-800/60 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-sm text-slate-200">{value}</dd>
    </div>
  );
}
