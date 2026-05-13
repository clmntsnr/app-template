// /log — log corgi events as they happen, *or* enter them after the fact.
//
// Naps and outside trips are duration events: they have a start and an end.
// We don't try to track them live with a "start / end" timer — you're not
// always at the laptop while it happens. Instead every kind opens the same
// add/edit dialog so you can enter the real times after the fact (or "now"
// for instant events).
//
// The dialog (components/event-dialog.tsx) handles both insert and update;
// the row's pencil icon reopens it for any past event.

import { Button } from "@package-ui/shadcn/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@package-ui/shadcn/components/card";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Cookie, Dog, Droplet, Moon, Pencil, Plus, Trash2, TreePine } from "lucide-react";
import { useMemo, useState } from "react";
import { EventDialog, type EventDialogTarget } from "../components/event-dialog";
import { type CorgiEvent, type EventKind, eventsCollection, hasDuration, KIND_LABELS } from "../db";

export const Route = createFileRoute("/log")({
  component: LogComponent,
});

// Lucide icon per kind. Labels live in db.ts so they're shared with the dialog.
const KIND_ICONS: Record<EventKind, typeof Moon> = {
  nap: Moon,
  outside: TreePine,
  poop: Dog,
  pee: Droplet,
  meal: Cookie,
};

function LogComponent() {
  const { queryClient } = Route.useRouteContext();
  const events = useMemo(() => eventsCollection(queryClient), [queryClient]);

  // Newest first — the log reads top-to-bottom as "what just happened".
  const { data: recent = [] } = useLiveQuery((q) =>
    q.from({ e: events }).orderBy(({ e }) => e.startedAt, "desc"),
  );

  // Dialog state. `null` closed, `"new"` blank-add, an event for edit.
  // `seedKind` lets the quick buttons pre-select a type when opening.
  const [editing, setEditing] = useState<EventDialogTarget>(null);
  const [seedKind, setSeedKind] = useState<EventKind | undefined>(undefined);

  const openNew = (kind?: EventKind) => {
    setSeedKind(kind);
    setEditing("new");
  };

  // For instant events the natural action is "log now" without a dialog.
  // For duration events the times *must* come from the user, so we always
  // route through the dialog instead.
  const logInstantNow = (kind: "poop" | "pee" | "meal") => {
    events.insert({
      id: Date.now(),
      type: kind,
      startedAt: Date.now(),
      endedAt: null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Log</h1>
        <Button variant="outline" onClick={() => openNew()}>
          <Plus className="mr-2 h-4 w-4" />
          Add entry
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick log</CardTitle>
          <CardDescription>
            Poop / pee / meal log right now in one tap. Naps and outside trips open the entry dialog
            so you can fill in the start and end times.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => openNew("nap")}>
            <Moon className="mr-2 h-4 w-4" />
            Log nap
          </Button>
          <Button onClick={() => openNew("outside")} variant="outline">
            <TreePine className="mr-2 h-4 w-4" />
            Log outside
          </Button>
          <Button onClick={() => logInstantNow("poop")} variant="outline">
            <Dog className="mr-2 h-4 w-4" />
            Log poop
          </Button>
          <Button onClick={() => logInstantNow("pee")} variant="outline">
            <Droplet className="mr-2 h-4 w-4" />
            Log pee
          </Button>
          <Button onClick={() => logInstantNow("meal")} variant="outline">
            <Cookie className="mr-2 h-4 w-4" />
            Log meal
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>
            Most recent first. Use the pencil to edit a time or add notes after the fact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet — use a quick button or "Add entry".
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((e) => {
                const Icon = KIND_ICONS[e.type];
                const durationMin =
                  hasDuration(e.type) && e.endedAt
                    ? Math.round((e.endedAt - e.startedAt) / 60000)
                    : null;
                return (
                  <li key={e.id} className="flex items-center gap-3 py-3 text-sm">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="w-16 shrink-0 font-medium">{KIND_LABELS[e.type]}</span>
                    <span className="flex-1 text-muted-foreground">
                      {format(e.startedAt, "EEE MMM d, HH:mm")}
                      {hasDuration(e.type) && (
                        <>
                          {" — "}
                          {durationMin !== null ? `${durationMin} min` : "no end time"}
                        </>
                      )}
                      {e.notes ? <span className="ml-2 italic">"{e.notes}"</span> : null}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSeedKind(undefined);
                        setEditing(e);
                      }}
                      aria-label="Edit event"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => events.delete(e.id)}
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <EventDialog
        // Remount when the target changes so the form's local state resets
        // cleanly to the new entry's values. Cheaper than syncing via effects.
        key={editing === "new" ? `new-${seedKind ?? "any"}` : (editing?.id ?? "closed")}
        target={editing}
        seed={seedKind ? { type: seedKind } : undefined}
        onClose={() => setEditing(null)}
        onSave={(e) => {
          if (editing === "new") {
            events.insert(e);
          } else if (editing) {
            events.update(editing.id, (draft) => {
              draft.type = e.type;
              draft.startedAt = e.startedAt;
              draft.endedAt = e.endedAt;
              draft.notes = e.notes;
            });
          }
          setEditing(null);
        }}
      />
    </div>
  );
}
