import type { AnyNodeKindDef } from "./types";

// Native HTML5 drag source — xyflow's reference pattern. The mime
// `application/node-kind` is read in NodeCanvas's onDrop.
export const NODE_KIND_MIME = "application/node-kind";

export function Palette({ kinds, title = "Palette" }: { kinds: AnyNodeKindDef[]; title?: string }) {
  const draggable = kinds.filter((k) => k.palette !== false);
  return (
    <aside className="flex w-60 flex-col gap-2 overflow-y-auto border-r border-border/60 bg-card/40 p-3 backdrop-blur">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <span className="text-[9px] text-muted-foreground/70">drag to canvas</span>
      </div>
      {draggable.map((it) => {
        const Icon = it.icon;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: native HTML5 drag source
          <div
            key={it.kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NODE_KIND_MIME, it.kind);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="group flex cursor-grab items-start gap-2.5 rounded-lg border border-border/50 bg-card/80 p-2.5 text-left transition-all hover:-translate-y-px hover:border-primary/50 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] active:translate-y-0 active:cursor-grabbing"
          >
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-muted/50 text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium leading-tight">{it.label}</span>
              {it.description ? (
                <span className="truncate text-[10px] text-muted-foreground">{it.description}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
