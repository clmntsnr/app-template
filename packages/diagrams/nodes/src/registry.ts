import type { AnyNodeKindDef, NodeKindDef } from "./types";

// Identity helper for kind definitions — gives consumers inference without
// having to spell out the type parameters on every kind.
export function defineNodeKind<TKind extends string, TData, TSocketType extends string>(
  def: NodeKindDef<TKind, TData, TSocketType>,
): NodeKindDef<TKind, TData, TSocketType> {
  return def;
}

export type NodeRegistry<TSocketType extends string> = Record<string, AnyNodeKindDef<TSocketType>>;

export function buildRegistry<TSocketType extends string>(
  kinds: AnyNodeKindDef<TSocketType>[],
): NodeRegistry<TSocketType> {
  const reg: NodeRegistry<TSocketType> = {};
  for (const k of kinds) reg[k.kind] = k;
  return reg;
}
