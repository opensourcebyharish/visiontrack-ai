import type { DetectionItem } from "../types";

// Neon-ish cyan/violet-first palette, aligned with the redesign tokens.
const PALETTE = [
  "#22d3ee",
  "#8b5cf6",
  "#31c48d",
  "#f5a524",
  "#f0616d",
  "#67e8f9",
  "#a78bfa",
];

function colorForClass(classId: number): string {
  return PALETTE[classId % PALETTE.length];
}

interface DetectionOverlayProps {
  detections: DetectionItem[];
}

export function DetectionOverlay({ detections }: DetectionOverlayProps) {
  if (detections.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-base-700/60 px-3 py-6 text-center text-xs text-ink-muted">
        No objects detected in the current frame.
      </p>
    );
  }

  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {detections.map((det, index) => (
        <li
          key={`${det.track_id ?? "na"}-${index}`}
          className="flex items-center justify-between rounded-lg border border-base-700/60 bg-space-800/40 px-3 py-1.5 text-xs"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorForClass(det.class_id) }}
            />
            <span className="truncate font-medium text-ink-primary">{det.class_name}</span>
            {det.track_id !== null && (
              <span className="rounded-md bg-cyan/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-soft ring-1 ring-inset ring-cyan/20">
                #{det.track_id}
              </span>
            )}
          </span>
          <span className="ml-2 shrink-0 font-mono text-ink-secondary">
            {det.confidence.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  );
}