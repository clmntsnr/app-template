import type { ComponentType, ReactNode } from "react";

// A socket type is just a string tag. The canvas is parameterized by the
// concrete union the consumer cares about ("git" | "chat" | "mcp", or
// "number" | "string", etc.) and a color map keyed on it.
export type Socket<TSocketType extends string = string> = {
  name: string;
  label: string;
  type: TSocketType;
  optional?: boolean;
  // Multi-input socket: input accepts more than one edge. Single-input
  // sockets replace the existing wire on reconnect. Has no effect on
  // output sockets (a single source can fan out either way).
  multi?: boolean;
};

// Property descriptors render inline editors in the node body. No handle.
// Bound to `node.data[name]` and edited via the canvas's patch fn.
//
//   - text   : single-line text input
//   - bool   : on/off toggle pill
//   - static : read-only computed display (no editor)
//   - select : combobox — free typing + a dropdown of suggestions
//   - action : a button on its own full-width row. Use for actions that
//              don't conceptually belong to a single input field.
//
// `text` and `select` also accept an optional `action` — a small trailing
// button rendered on the same row, after the input. Use for commit-style
// affordances ("Set", "Save", "Apply") where the button belongs to the
// field, not to the node.
export type InlineAction<TData = unknown> = {
  label: string;
  onClick: (id: string, data: TData, patch: (id: string, patch: Partial<TData>) => void) => void;
  disabled?: (data: TData) => boolean;
};

export type Prop<TData = unknown> =
  | {
      name: string;
      label: string;
      kind: "text";
      placeholder?: string;
      action?: InlineAction<TData>;
    }
  | { name: string; label: string; kind: "bool" }
  | { name: string; label: string; kind: "static"; render: (data: TData) => string }
  | {
      name: string;
      label: string;
      kind: "select";
      options: readonly string[];
      placeholder?: string;
      action?: InlineAction<TData>;
    }
  | {
      name: string;
      label: string;
      kind: "action";
      onClick: (
        id: string,
        data: TData,
        patch: (id: string, patch: Partial<TData>) => void,
      ) => void;
      disabled?: (data: TData) => boolean;
    };

export type NodeSchema<TData, TSocketType extends string> = {
  inputs: Socket<TSocketType>[];
  outputs: Socket<TSocketType>[];
  props?: Prop<TData>[];
};

// Body renderer: optional override for the small summary line below the
// header. By default we render the kind name + a static title pulled from
// the kind def.
export type NodeBodyProps<TData> = {
  id: string;
  data: TData;
};

export type NodeKindDef<TKind extends string, TData, TSocketType extends string> = {
  kind: TKind;
  label: string;
  description?: string;
  // Broad role used for theming and palette grouping. The shadcn CSS rebinds
  // `--accent-*` per category (`[data-kind="source"]` → amber, etc.), so a
  // kind setting `category: "source"` automatically gets the source palette.
  category?: "source" | "operation" | "signal" | "sink";
  icon?: ComponentType<{ className?: string }>;
  schema: NodeSchema<TData, TSocketType>;
  // Initial data for a freshly-dropped node. Receives the new node id in
  // case the caller wants to seed e.g. a deterministic name from it.
  defaultData: (id: string) => TData;
  // What to show under the kind label in the node body. If omitted, we
  // fall back to the kind name. Receives node data for dynamic titles.
  title?: (data: TData) => string;
  subtitle?: (data: TData) => ReactNode;
  // Whether this kind shows up in the drag palette. Leaves like a "branch"
  // root might be omitted (you seed them programmatically).
  palette?: boolean;
  // Lifecycle: a kind can compute a lock state from its data. When locked,
  // NodeShell switches editable props to read-only, hides action buttons,
  // and paints a lock indicator + accent border. The kind is responsible
  // for any "unlock" affordance — typically in a sidebar.
  locked?: (data: TData) => boolean;
  // Optional explicit lifecycle override. The default is good for most kinds
  // (live = locked, draft = a required input is missing, otherwise ready),
  // but a source node with no inputs may want to be `draft` until its prop
  // is set — only the kind knows that.
  //   - draft: missing requirements; the node is a placeholder for now
  //   - ready: configured and ready to be started, but not started
  //   - live:  running / materialised / has produced a real-world effect
  state?: (
    data: TData,
    ctx: { inputConnected: (socketName: string) => boolean },
  ) => "draft" | "ready" | "live";
};

export type NodeState = "draft" | "ready" | "live";

export type AnyNodeKindDef<TSocketType extends string = string> = NodeKindDef<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry
  any,
  TSocketType
>;
