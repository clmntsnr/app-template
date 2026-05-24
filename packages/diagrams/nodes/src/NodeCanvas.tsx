import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  PatchNodeContext,
  RegistryContext,
  SocketColorContext,
  type SocketColorMap,
} from "./context";
import { NodeShell } from "./NodeShell";
import { NODE_KIND_MIME, Palette } from "./Palette";
import { buildRegistry, type NodeRegistry } from "./registry";
import { makeTypedConnectionLine, TypedEdge } from "./TypedEdge";
import type { AnyNodeKindDef, Socket } from "./types";

type AnyNode = Node<Record<string, unknown>>;

// Subscribe to the `.dark` class on <html>. We can't use xyflow's
// `colorMode="system"` because that reads `prefers-color-scheme` directly
// and ignores our shadcn-style class toggle on the document element.
//
// useSyncExternalStore + a singleton MutationObserver gives us React-safe,
// SSR-safe subscription with no re-render storms.
function subscribeDarkClass(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => obs.disconnect();
}
function getDarkSnapshot() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
function getServerSnapshot() {
  return "light" as const;
}
function useThemedColorMode(): "light" | "dark" {
  return useSyncExternalStore(subscribeDarkClass, getDarkSnapshot, getServerSnapshot);
}

function getSocketDef<TSocketType extends string>(
  registry: NodeRegistry<TSocketType>,
  node: AnyNode | undefined,
  side: "in" | "out",
  name: string | null | undefined,
): Socket<TSocketType> | undefined {
  if (!node || !node.type || !name) return undefined;
  const def = registry[node.type];
  if (!def) return undefined;
  return (side === "in" ? def.schema.inputs : def.schema.outputs).find((s) => s.name === name);
}

export type NodeCanvasProps<TSocketType extends string> = {
  kinds: AnyNodeKindDef<TSocketType>[];
  socketColors: SocketColorMap<TSocketType>;
  initialNodes?: AnyNode[];
  initialEdges?: Edge[];
  // Render extra UI to the right of the canvas — typically a node-inspector
  // sidebar. Receives the currently-selected node (or null) and a patch fn.
  renderSidebar?: (args: {
    selected: AnyNode | null;
    nodes: AnyNode[];
    edges: Edge[];
    patch: (id: string, patch: Record<string, unknown>) => void;
    remove: (id: string) => void;
    close: () => void;
  }) => ReactNode;
  // Optional empty-state overlay shown when the canvas has no nodes.
  emptyState?: ReactNode;
  className?: string;
  showPalette?: boolean;
  paletteTitle?: string;
  // The xyflow MiniMap is off by default because at the small embed sizes
  // we use in docs/examples it crowds the canvas more than it helps. Opt
  // in on a real "full canvas" page (sandbox-style) where the overview is
  // worth the screen real estate.
  showMinimap?: boolean;
  // Fired on every state change so consumers can persist if they want.
  onChange?: (snapshot: { nodes: AnyNode[]; edges: Edge[] }) => void;
};

// Outer wrapper supplies the React Flow context. The inner component does
// all the interesting work and can call useReactFlow().
export function NodeCanvas<TSocketType extends string>(props: NodeCanvasProps<TSocketType>) {
  return (
    <ReactFlowProvider>
      {/* Inline CSS so the package is self-contained — consumers don't
          need to remember a separate stylesheet. Two jobs:

            1. The edge "flow" animation keyframe.
            2. Rebind xyflow's own CSS variables (`--xy-*`) onto our
               shadcn tokens (`--neutral-*`, `--accent-*`). xyflow ships a
               built-in light/dark switch via `colorMode`, but its defaults
               don't match our palette — handles paint white-on-dark by
               default, the controls panel is pure black/white, etc.
               Since our `--neutral-*` aliases already swap automatically
               with the `.dark` class (Radix dark scales), one binding
               covers both modes. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes dn-dash { to { stroke-dashoffset: -12; } }

.react-flow {
  --xy-background-color: var(--neutral-1);
  --xy-background-color-default: var(--neutral-1);
  --xy-background-pattern-color: var(--neutral-6);
  --xy-background-pattern-color-default: var(--neutral-6);
  --xy-edge-stroke: var(--neutral-7);
  --xy-edge-stroke-default: var(--neutral-7);
  --xy-edge-stroke-selected: var(--accent-9);
  --xy-edge-stroke-selected-default: var(--accent-9);
  --xy-edge-label-color: var(--neutral-12);
  --xy-edge-label-background-color: var(--neutral-1);
  --xy-connectionline-stroke: var(--neutral-8);
  --xy-connectionline-stroke-default: var(--neutral-8);
  --xy-attribution-background-color: transparent;
  --xy-attribution-background-color-default: transparent;
  --xy-selection-background-color: color-mix(in oklab, var(--accent-9) 12%, transparent);
  --xy-selection-background-color-default: color-mix(in oklab, var(--accent-9) 12%, transparent);
  --xy-selection-border: 1px dashed var(--accent-8);
  --xy-selection-border-default: 1px dashed var(--accent-8);
  --xy-handle-background-color: var(--accent-9);
  --xy-handle-background-color-default: var(--accent-9);
  --xy-handle-border-color: var(--neutral-1);
  --xy-handle-border-color-default: var(--neutral-1);
}

/* Controls panel — zoom, fit, lock buttons. */
.react-flow__controls {
  --xy-controls-button-background-color: var(--neutral-2);
  --xy-controls-button-background-color-default: var(--neutral-2);
  --xy-controls-button-background-color-hover: var(--neutral-3);
  --xy-controls-button-background-color-hover-default: var(--neutral-3);
  --xy-controls-button-color: var(--neutral-12);
  --xy-controls-button-color-default: var(--neutral-12);
  --xy-controls-button-color-hover: var(--neutral-12);
  --xy-controls-button-color-hover-default: var(--neutral-12);
  --xy-controls-button-border-color: var(--neutral-6);
  --xy-controls-button-border-color-default: var(--neutral-6);
  --xy-controls-box-shadow: 0 0 0 1px var(--neutral-6);
}

/* MiniMap chrome — opt-in but theme it anyway so showMinimap looks right. */
.react-flow__minimap {
  --xy-minimap-background-color: var(--neutral-2);
  --xy-minimap-background-color-default: var(--neutral-2);
  --xy-minimap-mask-background-color: color-mix(in oklab, var(--neutral-1) 60%, transparent);
  --xy-minimap-mask-background-color-default: color-mix(in oklab, var(--neutral-1) 60%, transparent);
  --xy-minimap-mask-stroke-color: var(--neutral-6);
  --xy-minimap-mask-stroke-color-default: var(--neutral-6);
}
`.trim(),
        }}
      />
      <NodeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function NodeCanvasInner<TSocketType extends string>({
  kinds,
  socketColors,
  initialNodes = [],
  initialEdges = [],
  renderSidebar,
  emptyState,
  className,
  showPalette = true,
  paletteTitle,
  showMinimap = false,
  onChange,
}: NodeCanvasProps<TSocketType>) {
  const registry = useMemo(() => buildRegistry(kinds), [kinds]);
  const colorMode = useThemedColorMode();
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<AnyNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    onChange?.({ nodes, edges });
  }, [nodes, edges, onChange]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns) as AnyNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );

  // Socket-typed validation. A connection is valid iff both endpoints
  // exist, target ≠ source, and the source's output type matches the
  // target's input type.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      const out = getSocketDef(registry, src, "out", c.sourceHandle);
      const inp = getSocketDef(registry, tgt, "in", c.targetHandle);
      return !!(out && inp && out.type === inp.type);
    },
    [nodes, registry],
  );

  // Single-input sockets replace the existing wire on reconnect; multi
  // sockets allow many edges but still reject exact duplicates. Stamp the
  // source socket type onto the edge so TypedEdge can color it without a
  // node lookup.
  const onConnect = useCallback(
    (p: Connection) =>
      setEdges((es) => {
        const tgt = nodes.find((n) => n.id === p.target);
        const inSock = getSocketDef(registry, tgt, "in", p.targetHandle);
        const isMulti = inSock?.multi === true;
        const filtered = isMulti
          ? es.filter(
              (e) =>
                !(
                  e.source === p.source &&
                  e.target === p.target &&
                  e.sourceHandle === p.sourceHandle &&
                  e.targetHandle === p.targetHandle
                ),
            )
          : es.filter((e) => !(e.target === p.target && e.targetHandle === p.targetHandle));
        const src = nodes.find((n) => n.id === p.source);
        const out = getSocketDef(registry, src, "out", p.sourceHandle);
        return addEdge({ ...p, type: "typed", data: { socketType: out?.type } }, filtered);
      }),
    [nodes, registry],
  );

  // Palette → canvas DnD.
  const wrapperRef = useRef<HTMLDivElement>(null);

  const onDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(NODE_KIND_MIME);
      if (!kind) return;
      const def = registry[kind];
      if (!def) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `${kind}:${crypto.randomUUID().slice(0, 8)}`;
      const newNode: AnyNode = {
        id,
        type: kind,
        position,
        data: def.defaultData(id) as Record<string, unknown>,
      };
      setNodes((ns) => [...ns, newNode]);
      setSelectedId(id);
    },
    [registry, screenToFlowPosition],
  );

  const patch = useCallback((id: string, p: Record<string, unknown>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  }, []);

  const remove = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // One renderer per registered kind — they all delegate to NodeShell,
  // which reads the schema/title/subtitle from the registry context.
  const nodeTypes = useMemo(() => {
    const map: Record<string, typeof NodeShell> = {};
    for (const k of kinds) map[k.kind] = NodeShell;
    return map;
  }, [kinds]);

  const edgeTypes = useMemo(() => ({ typed: TypedEdge }), []);

  const ConnectionLine = useMemo(
    () =>
      makeTypedConnectionLine((handleId, sourceNodeId) => {
        const src = nodes.find((n) => n.id === sourceNodeId);
        return getSocketDef(registry, src, "out", handleId)?.type;
      }),
    [nodes, registry],
  );

  return (
    <RegistryContext.Provider value={registry}>
      <SocketColorContext.Provider value={socketColors}>
        <PatchNodeContext.Provider value={patch}>
          <div
            className={`flex h-full w-full min-h-0 bg-background text-foreground ${className ?? ""}`}
          >
            {showPalette ? <Palette kinds={kinds} title={paletteTitle} /> : null}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone */}
            <div
              ref={wrapperRef}
              className="relative min-w-0 flex-1"
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              {nodes.length === 0 && emptyState ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  {emptyState}
                </div>
              ) : null}
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: "typed" }}
                connectionLineComponent={ConnectionLine}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                fitView
                proOptions={{ hideAttribution: true }}
                // Follow the rest of the app: `.dark` on <html> drives the
                // theme. xyflow's built-in `colorMode="system"` reads the
                // `prefers-color-scheme` media query — not our class — so
                // we compute the mode ourselves and pass it explicitly.
                colorMode={colorMode}
              >
                {/* No explicit `color` on Background: that defaults xyflow
                    to its own --xy-background-pattern-color CSS variable,
                    which we rebind onto --neutral-6 in the <style> block
                    at the top of NodeCanvas. A hardcoded color would
                    bypass the theme entirely. */}
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
                <Controls showInteractive={false} />
                {showMinimap ? (
                  <MiniMap
                    pannable
                    zoomable
                    maskColor="rgba(0,0,0,0.55)"
                    nodeColor={(n) => {
                      const def = registry[n.type ?? ""];
                      const first = def?.schema.outputs[0] ?? def?.schema.inputs[0];
                      if (!first) return "#71717a";
                      return socketColors[first.type as TSocketType]?.hex ?? "#71717a";
                    }}
                  />
                ) : null}
              </ReactFlow>
            </div>
            {renderSidebar
              ? renderSidebar({
                  selected,
                  nodes,
                  edges,
                  patch,
                  remove,
                  close: () => setSelectedId(null),
                })
              : null}
          </div>
        </PatchNodeContext.Provider>
      </SocketColorContext.Provider>
    </RegistryContext.Provider>
  );
}
