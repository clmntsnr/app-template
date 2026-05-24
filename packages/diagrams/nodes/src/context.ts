import { createContext, useContext } from "react";
import type { NodeRegistry } from "./registry";

// Per-node prop editors patch back into the canvas state without prop
// drilling through xyflow's renderer tree.
export type PatchFn = (id: string, patch: Record<string, unknown>) => void;
export const PatchNodeContext = createContext<PatchFn>(() => {});
export function usePatchNode(): PatchFn {
  return useContext(PatchNodeContext);
}

// Per-canvas socket-type color map (Tailwind class for handles, hex for
// SVG edges). Stored in context so SocketRow / TypedEdge can read it
// without each node renderer threading it through.
// `kind` distinguishes the two flavours of wire we draw:
//   - "value"  (default): solid line, the socket carries data
//   - "signal":           dashed + animated, the socket carries an event ping
// The visual difference is the framework's main affordance for "wait, that's
// not a value, that's a doorbell" — readers shouldn't have to remember which
// colour means what.
export type SocketColorMap<TSocketType extends string> = Record<
  TSocketType,
  { handle: string; hex: string; kind?: "value" | "signal" }
>;

// biome-ignore lint/suspicious/noExplicitAny: context type is socket-set-agnostic at runtime
export const SocketColorContext = createContext<SocketColorMap<any> | null>(null);
export function useSocketColors<TSocketType extends string>(): SocketColorMap<TSocketType> {
  const v = useContext(SocketColorContext);
  if (!v) throw new Error("SocketColorContext missing — wrap in <NodeCanvas>");
  return v as SocketColorMap<TSocketType>;
}

// biome-ignore lint/suspicious/noExplicitAny: registry is heterogeneous
export const RegistryContext = createContext<NodeRegistry<any> | null>(null);
export function useRegistry<TSocketType extends string>(): NodeRegistry<TSocketType> {
  const v = useContext(RegistryContext);
  if (!v) throw new Error("RegistryContext missing — wrap in <NodeCanvas>");
  return v as NodeRegistry<TSocketType>;
}
