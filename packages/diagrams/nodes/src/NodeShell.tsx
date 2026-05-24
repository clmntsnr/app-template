import { Handle, type NodeProps, Position, useNodeConnections } from "@xyflow/react";
import { Lock } from "lucide-react";
import { type ReactNode, useId, useMemo } from "react";
import { usePatchNode, useRegistry, useSocketColors } from "./context";
import type { NodeState, Prop, Socket } from "./types";

// Blender-style three-zone node:
//   ┌─────────────────────────┐
//   │  HEADER (kind + lock?)  │
//   ├─────────────────────────┤
//   │  ● output                │
//   ├─────────────────────────┤
//   │ ● label   [ editor ]     │   ← input socket + prop share a row when
//   │   label   [ editor ]     │     they have the same `name`. Otherwise
//   ├─────────────────────────┤     plain editable prop row.
//   │  input  ●                │   ← standalone input (no matching prop)
//   └─────────────────────────┘

export function NodeShell({ id, data, type }: NodeProps) {
  const registry = useRegistry();
  const def = registry[type];
  if (!def) return null;
  const Icon = def.icon;
  const title = def.title ? def.title(data) : def.label;
  const subtitle = def.subtitle ? def.subtitle(data) : null;
  const schema = def.schema;
  const locked = def.locked ? def.locked(data) : false;

  // All incoming connections to this node — used to decide whether the
  // node is "draft" (a required input is missing) vs "ready" vs "live".
  // `useNodeConnections` reads the host node id from xyflow context, so
  // calling it without an id targets this node.
  const incoming = useNodeConnections({ handleType: "target" });
  const connectedTargets = useMemo(
    () => new Set(incoming.map((c) => c.targetHandle).filter((h): h is string => !!h)),
    [incoming],
  );

  // Default lifecycle:
  //   live  = the kind says it's locked (a real-world effect happened)
  //   draft = some required input has no incident wire
  //   ready = otherwise
  // The kind can override via `state?`.
  let state: NodeState;
  if (def.state) {
    state = def.state(data, { inputConnected: (n) => connectedTargets.has(n) });
  } else if (locked) {
    state = "live";
  } else {
    const missingRequired = schema.inputs.some(
      (s) => !s.optional && !connectedTargets.has(s.name),
    );
    state = missingRequired ? "draft" : "ready";
  }

  // Sockets that share a `name` with a prop render on the same row as that
  // prop: an input handle pins to the row's left edge, an output handle to
  // its right edge. This lets a field be driven by a wire *and* expose its
  // value on an output — useful when the field's semantics are the same on
  // both sides (e.g. a directory that can be supplied or read back).
  const propByName = new Map((schema.props ?? []).map((p) => [p.name, p]));
  const inlineInputs = schema.inputs.filter((s) => propByName.has(s.name));
  const standaloneInputs = schema.inputs.filter((s) => !propByName.has(s.name));
  const inlineOutputs = schema.outputs.filter((s) => propByName.has(s.name));
  const standaloneOutputs = schema.outputs.filter((s) => !propByName.has(s.name));
  const inlineInputByName = new Map(inlineInputs.map((s) => [s.name, s]));
  const inlineOutputByName = new Map(inlineOutputs.map((s) => [s.name, s]));

  // Per-state container styling. Three distinct looks so a quick glance
  // at the graph tells you which nodes are placeholders, which are armed
  // and waiting, and which are "really running".
  //   draft: dashed muted border, lower opacity, subdued body text
  //   ready: solid border, hover lifts to the primary accent
  //   live:  solid primary border, no hover (it's already at its peak)
  const containerClass =
    state === "live"
      ? "w-[220px] rounded-md border border-primary/60 bg-card text-card-foreground transition-colors"
      : state === "draft"
        ? "w-[220px] rounded-md border border-dashed border-border/50 bg-card/60 text-card-foreground/80 opacity-90 transition-colors"
        : "w-[220px] rounded-md border border-border/70 bg-card text-card-foreground transition-colors hover:border-primary/50";
  const headerClass =
    state === "live"
      ? "flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-primary"
      : state === "draft"
        ? "flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground/60"
        : "flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground/80";
  // Tiny state dot. Visually quieter than a badge but readable when you
  // scan a busy graph. Live → primary; ready → muted-foreground; draft →
  // outlined ring (empty).
  const stateDotClass =
    state === "live"
      ? "h-1.5 w-1.5 rounded-full bg-primary"
      : state === "ready"
        ? "h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
        : "h-1.5 w-1.5 rounded-full border border-muted-foreground/50";

  return (
    <div className={containerClass} data-kind={def.category}>
      <div className={headerClass}>
        {Icon ? <Icon className="h-3 w-3" /> : null}
        <span>{def.kind}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className={stateDotClass} aria-label={`state: ${state}`} />
          {state === "live" ? <Lock className="h-3 w-3" /> : null}
        </span>
      </div>
      <div className="px-3 pb-2">
        <div className="truncate font-mono text-sm leading-tight">{title}</div>
        {subtitle ? (
          <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>

      {standaloneOutputs.length > 0 ? (
        <div className="flex flex-col py-0.5">
          {standaloneOutputs.map((s) => (
            <SocketRow key={`out:${s.name}`} socket={s} side="out" />
          ))}
        </div>
      ) : null}

      {schema.props && schema.props.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border/40 px-3 py-2">
          {schema.props.map((p) => (
            <PropRow
              key={`prop:${p.name}`}
              nodeId={id}
              prop={p}
              data={data}
              locked={locked}
              inputSocket={inlineInputByName.get(p.name)}
              outputSocket={inlineOutputByName.get(p.name)}
            />
          ))}
        </div>
      ) : null}

      {standaloneInputs.length > 0 ? (
        <div className="flex flex-col py-0.5">
          {standaloneInputs.map((s) => (
            <SocketRow key={`in:${s.name}`} socket={s} side="in" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// A single pill handle. When the handle has no incident edge we render it
// "hollow" — transparent fill with a 1.5px inset ring in the socket's hex
// color — so it reads as an empty port waiting for a plug. As soon as a
// connection lands, the bg-class fills it solid.
//
// `useNodeConnections` reads the host node id from xyflow context; it works
// inside any descendant of a custom node component.
function SocketHandle({ socket, side }: { socket: Socket; side: "in" | "out" }) {
  const colors = useSocketColors();
  const color = colors[socket.type];
  const handleType = side === "in" ? "target" : "source";
  const connections = useNodeConnections({ handleType, handleId: socket.name });
  const isConnected = connections.length > 0;

  const baseClass = "!h-1.5 !w-4 !rounded-full !border-0";
  // The Tailwind bg-class wins via `!important`. When hollow we drop the
  // bg-class entirely so the inline `background: transparent` takes effect.
  const className = isConnected ? `${baseClass} ${color?.handle ?? ""}` : baseClass;
  const style =
    !isConnected && color?.hex
      ? { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${color.hex}` }
      : undefined;

  return (
    <Handle
      type={handleType}
      position={side === "in" ? Position.Left : Position.Right}
      id={socket.name}
      className={className}
      style={style}
    />
  );
}

function SocketRow({ socket, side }: { socket: Socket; side: "in" | "out" }) {
  return (
    <div className="relative flex items-center px-3 py-1 text-[11px]">
      {side === "in" ? <SocketHandle socket={socket} side="in" /> : null}
      <span className={side === "out" ? "ml-auto text-foreground/70" : "text-foreground/70"}>
        {socket.label}
        {socket.optional ? <span className="ml-1 text-muted-foreground">(opt)</span> : null}
      </span>
      {side === "out" ? <SocketHandle socket={socket} side="out" /> : null}
    </div>
  );
}

// `nodrag` is essential — without it xyflow swallows keystrokes as drags.
// When `locked`, all editable kinds collapse to a static read-only line and
// action buttons hide entirely.
//
// `inputSocket` / `outputSocket` are set when this prop shares a name with
// a socket — the row then doubles as a connection point on that side. The
// handles are always rendered (even when locked) so existing edges stay
// attached.
function PropRow({
  nodeId,
  prop,
  data,
  locked,
  inputSocket,
  outputSocket,
}: {
  nodeId: string;
  prop: Prop;
  data: Record<string, unknown>;
  locked: boolean;
  inputSocket?: Socket;
  outputSocket?: Socket;
}) {
  const patch = usePatchNode();
  const listId = useId();
  const value = data[prop.name];

  if (locked && prop.kind === "action") return null;

  const inputHandle = inputSocket ? <SocketHandle socket={inputSocket} side="in" /> : null;
  const outputHandle = outputSocket ? <SocketHandle socket={outputSocket} side="out" /> : null;

  // Action rows span the full width — the button itself is the label, so a
  // separate left-column label would be redundant. The `-mx-3 px-3` trick
  // makes the row reach the node's outer border so an attached handle lands
  // *on* the border, not inside the prop-zone padding.
  if (prop.kind === "action") {
    return (
      <div className="relative -mx-3 px-3">
        {inputHandle}
        {outputHandle}
        <button
          type="button"
          disabled={prop.disabled ? prop.disabled(data as unknown) : false}
          onClick={() =>
            prop.onClick(nodeId, data as unknown, patch as (id: string, p: unknown) => void)
          }
          className="nodrag w-full rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {prop.label}
        </button>
      </div>
    );
  }

  return (
    <div className="relative -mx-3 flex items-center gap-2 px-3 text-[11px]">
      {inputHandle}
      {outputHandle}
      <span className="w-16 shrink-0 text-muted-foreground">{prop.label}</span>
      {prop.kind === "static" ? (
        <span className="min-w-0 flex-1 truncate font-mono text-foreground/70">
          {prop.render(data as unknown) as ReactNode}
        </span>
      ) : locked ? (
        // Read-only view of an editable prop: just print the value. We don't
        // re-use `static`'s renderer because that's a fixed transform; the
        // honest representation of a `text` field when locked is its raw value.
        <span className="min-w-0 flex-1 truncate font-mono text-foreground/70">
          {prop.kind === "bool"
            ? value
              ? "on"
              : "off"
            : typeof value === "string"
              ? value
              : value == null
                ? "—"
                : String(value)}
        </span>
      ) : prop.kind === "text" ? (
        <>
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => patch(nodeId, { [prop.name]: e.target.value })}
            placeholder={prop.placeholder}
            className="nodrag min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[11px] outline-none focus:border-primary/60"
          />
          {prop.action ? (
            <InlineActionButton action={prop.action} nodeId={nodeId} data={data} />
          ) : null}
        </>
      ) : prop.kind === "bool" ? (
        <button
          type="button"
          onClick={() => patch(nodeId, { [prop.name]: !value })}
          className={
            value
              ? "nodrag rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 transition hover:bg-amber-500/20"
              : "nodrag rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:bg-muted/80"
          }
        >
          {value ? "on" : "off"}
        </button>
      ) : (
        // select
        <>
          <input
            type="text"
            list={listId}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => patch(nodeId, { [prop.name]: e.target.value })}
            placeholder={prop.placeholder}
            className="nodrag min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[11px] outline-none focus:border-primary/60"
          />
          <datalist id={listId}>
            {prop.options.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
          {prop.action ? (
            <InlineActionButton action={prop.action} nodeId={nodeId} data={data} />
          ) : null}
        </>
      )}
    </div>
  );
}

// Trailing action button anchored to the right of a text/select input.
// Visually compact so the input still dominates the row.
function InlineActionButton({
  action,
  nodeId,
  data,
}: {
  action: NonNullable<Extract<Prop, { kind: "text" }>["action"]>;
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const patch = usePatchNode();
  return (
    <button
      type="button"
      disabled={action.disabled ? action.disabled(data as unknown) : false}
      onClick={() =>
        action.onClick(nodeId, data as unknown, patch as (id: string, p: unknown) => void)
      }
      className="nodrag shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {action.label}
    </button>
  );
}
