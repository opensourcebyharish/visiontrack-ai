import type { DetectionItem } from "../types";

const PALETTE = [
  "#4f8cff",
  "#31c48d",
  "#f5a524",
  "#f0616d",
  "#9b7bff",
  "#4dd0e1",
  "#ffb74d",
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
      <p className="rounded-lg border border-dashed border-base-700 px-3 py-6 text-center text-xs text-slate-500">
        No objects detected in the current frame.
      </p>
    );
  }

  return (
    <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {detections.map((det, index) => (
        <li
          key={`${det.track_id ?? "na"}-${index}`}
          className="flex items-center justify-between rounded-lg border border-base-700 bg-base-800/60 px-3 py-1.5 text-xs"
        >
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colorForClass(det.class_id) }}
            />
            <span className="font-medium text-slate-200">{det.class_name}</span>
            {det.track_id !== null && (
              <span className="rounded bg-base-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                #{det.track_id}
              </span>
            )}
          </span>
          <span className="font-mono text-slate-400">{det.confidence.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}
