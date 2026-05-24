import {
  type ConnectionLineComponentProps,
  type EdgeProps,
  getBezierPath,
  Position,
} from "@xyflow/react";
import { useSocketColors } from "./context";

// Custom edge: bezier path painted in the source socket's color.
//
// Two visual modes, picked by the socket's `kind` in the colors map:
//   - "value"  (default): a single solid line + a soft glow. Reads as
//                         "data is sitting here, read it whenever".
//   - "signal":           dashed line, animated stroke offset, plus glow.
//                         Reads as "events flow this way; ping-ping-ping".
//
// Same colour for both — the *shape* of the wire is what tells you the
// kind, not the colour.
export function TypedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data?: { socketType?: string } }) {
  const colors = useSocketColors();
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const socketType = data?.socketType;
  const entry = socketType ? colors[socketType] : undefined;
  const color = entry?.hex ?? "#a1a1aa";
  const isSignal = entry?.kind === "signal";
  return (
    <g>
      <path
        id={`${id}-glow`}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 6 : 4}
        strokeOpacity={isSignal ? 0.18 : 0.22}
        strokeLinecap="round"
      />
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.75}
        strokeLinecap="round"
        strokeDasharray={isSignal ? "6 6" : undefined}
        style={isSignal ? { animation: "dn-dash 1.4s linear infinite" } : undefined}
      />
    </g>
  );
}

// In-progress drag line. We don't know the kind from handle id alone, so the
// caller resolves the full socket-type-to-kind via the colors map. We pick
// the same dashed-vs-solid treatment so the drag preview matches the
// committed edge.
export function makeTypedConnectionLine(
  resolveSocketType: (
    handleId: string | undefined,
    sourceNodeId: string | undefined,
  ) => string | undefined,
) {
  return function TypedConnectionLine({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
    fromHandle,
    fromNode,
  }: ConnectionLineComponentProps) {
    const colors = useSocketColors();
    const [path] = getBezierPath({
      sourceX: fromX,
      sourceY: fromY,
      targetX: toX,
      targetY: toY,
      sourcePosition: fromPosition ?? Position.Right,
      targetPosition: toPosition ?? Position.Left,
    });
    const t = resolveSocketType(fromHandle?.id ?? undefined, fromNode?.id);
    const entry = t ? colors[t] : undefined;
    const color = entry?.hex ?? "#a1a1aa";
    const isSignal = entry?.kind === "signal";
    return (
      <g>
        <path d={path} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={5} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={isSignal ? "6 6" : undefined}
        />
      </g>
    );
  };
}
