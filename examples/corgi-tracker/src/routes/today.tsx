// /today — single-day timeline view.
//
// Two things make this view different from the dashboard:
//
//   1. A 24-hour horizontal timeline with absolute-positioned, color-coded
//      spans for duration events (naps, outside) and dots for instant events
//      (poop, pee, meal). Every glyph is clickable → opens the shared edit
//      dialog with the event pre-loaded. This is the "what did they do
//      today" picture I open in the morning to course-correct the rest of
//      the day.
//
//   2. Aggregates that matter for the day, not the week: hours slept vs.
//      awake, outside total, pee/poop times listed out, meal schedule with
//      one-click "log at scheduled time" for slots that haven't happened
//      yet (so you can confirm a meal that just happened without typing a
//      time).

import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@package-ui/shadcn/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@package-ui/shadcn/components/card";
import { endOfDay, format, parse, startOfDay } from "date-fns";
import { Check, Cookie, Moon, Pencil, Plus, TreePine } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EventDialog,
  type EventDialogTarget,
} from "../components/event-dialog";
import {
  type CorgiEvent,
  KIND_COLORS,
  KIND_LABELS,
  eventsCollection,
  hasDuration,
  profileCollection,
} from "../db";

export const Route = createFileRoute("/today")({
  component: TodayComponent,
});

const DAY_MS = 24 * 60 * 60 * 1000;
// Percentage of the day at timestamp `ts`, clamped to [0, 100]. Used to
// position spans/dots on the 24-hour timeline.
const pct = (ts: number, dayStart: number) =>
  Math.max(0, Math.min(100, ((ts - dayStart) / DAY_MS) * 100));

function TodayComponent() {
  const { queryClient } = Route.useRouteContext();
  const events = useMemo(() => eventsCollection(queryClient), [queryClient]);
  const profile = useMemo(() => profileCollection(queryClient), [queryClient]);

  const { data: allEvents = [] } = useLiveQuery((q) =>
    q.from({ e: events }).orderBy(({ e }) => e.startedAt),
  );
  const { data: profileRows = [] } = useLiveQuery((q) => q.from({ p: profile }));
  const corgi = profileRows[0];

  const [editing, setEditing] = useState<EventDialogTarget>(null);
  // Seed values for "new" mode — quick-add buttons (e.g., "Add nap") use this
  // to pre-select the type so the user doesn't have to change the dropdown.
  const [seed, setSeed] = useState<Partial<CorgiEvent> | undefined>(undefined);
  const openNew = (s?: Partial<CorgiEvent>) => {
    setSeed(s);
    setEditing("new");
  };
  const openEdit = (e: CorgiEvent) => {
    setSeed(undefined);
    setEditing(e);
  };

  // We compute everything off `now` once per render. `useLiveQuery` re-runs
  // on every mutation so this keeps recalculating without a setInterval.
  const now = Date.now();
  const dayStart = startOfDay(new Date(now)).getTime();
  const dayEnd = endOfDay(new Date(now)).getTime();

  const todaysEvents = useMemo(
    () =>
      allEvents
        .filter((e) => {
          // An event "belongs to today" if it started today. For an in-progress
          // span that started yesterday we'd lose visibility; in practice naps
          // don't cross midnight so this simplification is safe and keeps the
          // timeline math one-dimensional.
          const start = e.startedAt;
          return start >= dayStart && start <= dayEnd;
        })
        .sort((a, b) => a.startedAt - b.startedAt),
    [allEvents, dayStart, dayEnd],
  );

  // Aggregates. One pass, separated lists so the per-time rows below can
  // show them in chronological order without sorting again.
  const agg = useMemo(() => {
    let sleepMs = 0;
    let outsideMs = 0;
    const naps: CorgiEvent[] = [];
    const outings: CorgiEvent[] = [];
    const pees: CorgiEvent[] = [];
    const poops: CorgiEvent[] = [];
    const meals: CorgiEvent[] = [];

    for (const e of todaysEvents) {
      if (hasDuration(e.type)) {
        // Open spans contribute up to "now" so the awake/sleep totals reflect
        // a running nap. Closed spans use their actual end.
        const end = e.endedAt ?? now;
        const ms = Math.max(0, end - e.startedAt);
        if (e.type === "nap") {
          sleepMs += ms;
          naps.push(e);
        } else if (e.type === "outside") {
          outsideMs += ms;
          outings.push(e);
        }
      } else if (e.type === "pee") pees.push(e);
      else if (e.type === "poop") poops.push(e);
      else if (e.type === "meal") meals.push(e);
    }

    // Awake time = elapsed wall time since 00:00 minus sleep. Capped at 0
    // in case data is inconsistent (a stray very-old nap, etc.).
    const elapsedMs = Math.min(now - dayStart, DAY_MS);
    const awakeMs = Math.max(0, elapsedMs - sleepMs);

    return { sleepMs, awakeMs, outsideMs, naps, outings, pees, poops, meals };
  }, [todaysEvents, dayStart, now]);

  // Match each scheduled meal slot ("HH:mm") to today's actual meal events
  // by nearest time. A slot is "eaten" if any meal event falls within ±90
  // minutes of it. Close enough — the dialog is one click away to correct
  // any false match.
  const mealSchedule = corgi?.mealSchedule ?? [];
  const mealSlots = useMemo(() => {
    return mealSchedule.map((hhmm) => {
      const slotDate = parse(hhmm, "HH:mm", new Date(now));
      const slotTs = slotDate.getTime();
      const matchedMeal =
        agg.meals.find((m) => Math.abs(m.startedAt - slotTs) < 90 * 60 * 1000) ??
        null;
      return { hhmm, slotTs, matchedMeal };
    });
  }, [mealSchedule, agg.meals, now]);

  const logMealAt = (ts: number) => {
    events.insert({
      id: Date.now(),
      type: "meal",
      startedAt: ts,
      endedAt: null,
    });
  };

  // Close an ongoing duration event with "now" as the end. Used by both the
  // Nap and Outside sections — same shape, same flow.
  const endNow = (e: CorgiEvent) => {
    events.update(e.id, (draft) => {
      draft.endedAt = Date.now();
    });
  };

  // Instant insert at the current time. Used by the "Log pee/poop/meal now"
  // buttons in each card — they record the most common case (it just
  // happened) in one tap. Off-time entries still go through the dialog via
  // openNew() or the pencil icon.
  const logInstantNow = (kind: "pee" | "poop" | "meal") => {
    events.insert({
      id: Date.now(),
      type: kind,
      startedAt: Date.now(),
      endedAt: null,
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold">
          Today
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {format(now, "EEEE, MMM d")}
          </span>
        </h1>
        <p className="text-muted-foreground">
          Click any span or dot on the timeline to edit it. The "Add entry"
          button on /log works for retroactive logging.
        </p>
      </section>

      <Timeline
        events={todaysEvents}
        dayStart={dayStart}
        now={now}
        onPick={openEdit}
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <StatCard title="Sleeping" value={formatHm(agg.sleepMs)} accent={KIND_COLORS.nap} />
        <StatCard title="Awake" value={formatHm(agg.awakeMs)} />
        <StatCard title="Outside" value={formatHm(agg.outsideMs)} accent={KIND_COLORS.outside} />
        <StatCard
          title="Pees / Poops"
          value={`${agg.pees.length} / ${agg.poops.length}`}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <TimesCard
          title="Pees"
          items={agg.pees}
          color={KIND_COLORS.pee}
          onPick={openEdit}
          onAddNow={() => logInstantNow("pee")}
          onAddAt={() => openNew({ type: "pee", startedAt: Date.now(), endedAt: null })}
          addLabel="Log pee now"
        />
        <TimesCard
          title="Poops"
          items={agg.poops}
          color={KIND_COLORS.poop}
          onPick={openEdit}
          onAddNow={() => logInstantNow("poop")}
          onAddAt={() => openNew({ type: "poop", startedAt: Date.now(), endedAt: null })}
          addLabel="Log poop now"
        />
      </section>

      <DurationCard
        title="Naps"
        description={
          'Log a nap when it starts, then set the end time when they wake up. ' +
          'An ongoing nap shows an "End now" button so you can close it in one ' +
          'tap without opening the editor.'
        }
        kind="nap"
        Icon={Moon}
        items={agg.naps}
        now={now}
        addLabel="Add nap"
        emptyLabel="No naps today yet."
        onEndNow={endNow}
        onEdit={openEdit}
        onAdd={() =>
          openNew({ type: "nap", startedAt: Date.now(), endedAt: null })
        }
      />

      <DurationCard
        title="Outside"
        description={
          'Same idea as naps — start the outside trip, end it when they come ' +
          'back in. Useful for tracking how much time they actually spend ' +
          'outdoors per day.'
        }
        kind="outside"
        Icon={TreePine}
        items={agg.outings}
        now={now}
        addLabel="Add outside"
        emptyLabel="No outside trips today yet."
        onEndNow={endNow}
        onEdit={openEdit}
        onAdd={() =>
          openNew({ type: "outside", startedAt: Date.now(), endedAt: null })
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Meals</CardTitle>
          <CardDescription>
            Scheduled times come from your profile. Slots in the future show a
            one-click "log at scheduled time" so you don't have to type a
            timestamp when a meal happened right on time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mealSlots.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No meal schedule set — add one on /profile.
            </p>
          )}
          {mealSlots.map(({ hhmm, slotTs, matchedMeal }) => (
            <div
              key={hhmm}
              className="flex items-center gap-3 rounded border p-3 text-sm"
            >
              <Cookie
                className="h-4 w-4 shrink-0"
                style={{ color: KIND_COLORS.meal }}
              />
              <span className="w-16 font-medium">{hhmm}</span>
              {matchedMeal ? (
                <>
                  <span className="flex-1 text-muted-foreground">
                    <Check className="mr-1 inline h-3 w-3 text-green-600" />
                    Eaten at {format(matchedMeal.startedAt, "HH:mm")}
                    {matchedMeal.notes ? (
                      <span className="ml-2 italic">"{matchedMeal.notes}"</span>
                    ) : null}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(matchedMeal)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-muted-foreground">
                    Not logged yet
                  </span>
                  <Button size="sm" onClick={() => logMealAt(slotTs)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Log at {hhmm}
                  </Button>
                </>
              )}
            </div>
          ))}
          {/* Any meal logged that didn't match a scheduled slot — extra meals,
              treats, or just times that drifted far from the schedule. */}
          {agg.meals
            .filter((m) => !mealSlots.some((s) => s.matchedMeal?.id === m.id))
            .map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded border border-dashed p-3 text-sm"
              >
                <Cookie
                  className="h-4 w-4 shrink-0"
                  style={{ color: KIND_COLORS.meal }}
                />
                <span className="w-16 font-medium">
                  {format(m.startedAt, "HH:mm")}
                </span>
                <span className="flex-1 text-muted-foreground">
                  Extra meal
                  {m.notes ? <span className="ml-2 italic">"{m.notes}"</span> : null}
                </span>
                <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => logInstantNow("meal")}>
              <Plus className="mr-1 h-3 w-3" />
              Log meal now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openNew({ type: "meal", startedAt: Date.now(), endedAt: null })
              }
            >
              Pick time…
            </Button>
          </div>
        </CardContent>
      </Card>

      <EventDialog
        // Include the seed's type in the remount key so toggling between
        // different quick-add buttons properly resets the form.
        key={
          editing === "new"
            ? `new-${seed?.type ?? "any"}-${seed?.startedAt ?? ""}`
            : (editing?.id ?? "closed")
        }
        target={editing}
        seed={seed}
        onClose={() => {
          setEditing(null);
          setSeed(undefined);
        }}
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

// ─── Timeline ──────────────────────────────────────────────────────────────

function Timeline({
  events,
  dayStart,
  now,
  onPick,
}: {
  events: CorgiEvent[];
  dayStart: number;
  now: number;
  onPick: (e: CorgiEvent) => void;
}) {
  // Render an even grid of 24 hour columns behind the events. Splitting
  // into a separate background layer keeps event z-order clean.
  const hourTicks = Array.from({ length: 25 }, (_, h) => h);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Day timeline</CardTitle>
        <CardDescription>
          Spans show naps and outside trips; dots show meals, pees, and poops.
          The vertical line marks "now".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative h-16 w-full overflow-hidden rounded border bg-muted/30">
          {/* hour grid */}
          {hourTicks.map((h) => (
            <div
              key={h}
              className="absolute top-0 bottom-0 border-l border-border/40"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
          {/* "now" indicator */}
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/70"
            style={{ left: `${pct(now, dayStart)}%` }}
            aria-label="now"
          />
          {/* spans (duration events) */}
          {events
            .filter((e) => hasDuration(e.type))
            .map((e) => {
              const left = pct(e.startedAt, dayStart);
              const right = pct(e.endedAt ?? now, dayStart);
              const width = Math.max(0.4, right - left);
              const ongoing = e.endedAt === null;
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => onPick(e)}
                  className="absolute top-2 bottom-2 cursor-pointer rounded transition-opacity hover:opacity-80"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: KIND_COLORS[e.type],
                    opacity: ongoing ? 0.65 : 0.9,
                  }}
                  // Native title gives a no-deps hover tooltip — overkill to
                  // pull in Radix Tooltip just for a timeline.
                  title={`${KIND_LABELS[e.type]} ${format(e.startedAt, "HH:mm")}${
                    e.endedAt ? `–${format(e.endedAt, "HH:mm")}` : " (ongoing)"
                  }`}
                />
              );
            })}
          {/* dots (instant events) */}
          {events
            .filter((e) => !hasDuration(e.type))
            .map((e) => (
              <button
                type="button"
                key={e.id}
                onClick={() => onPick(e)}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full ring-2 ring-background transition-transform hover:scale-125"
                style={{
                  left: `${pct(e.startedAt, dayStart)}%`,
                  backgroundColor: KIND_COLORS[e.type],
                }}
                title={`${KIND_LABELS[e.type]} ${format(e.startedAt, "HH:mm")}`}
              />
            ))}
        </div>
        {/* hour labels — sparse so they don't pile up on narrow screens */}
        <div className="relative h-4 w-full text-xs text-muted-foreground">
          {[0, 4, 8, 12, 16, 20, 24].map((h) => (
            <div
              key={h}
              className="absolute -translate-x-1/2"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>
        <Legend />
      </CardContent>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {(["nap", "outside", "meal", "pee", "poop"] as const).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ backgroundColor: KIND_COLORS[k] }}
          />
          {KIND_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

// ─── Small presentational helpers ──────────────────────────────────────────

function formatHm(ms: number) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function StatCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  // Optional accent stripe — visually ties the card to its color on the
  // timeline (e.g., the "Sleeping" card matches the nap span color).
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          {accent && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
          )}
          {title}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

// ─── DurationCard ──────────────────────────────────────────────────────────
//
// Used for both Naps and Outside since they share the same shape: a list of
// completed/ongoing duration events with a quick "End now" on the open one
// and an "Add" button that opens the dialog pre-seeded.

function DurationCard({
  title,
  description,
  kind,
  Icon,
  items,
  now,
  addLabel,
  emptyLabel,
  onEndNow,
  onEdit,
  onAdd,
}: {
  title: string;
  description: string;
  kind: "nap" | "outside";
  Icon: typeof Moon;
  items: CorgiEvent[];
  now: number;
  addLabel: string;
  emptyLabel: string;
  onEndNow: (e: CorgiEvent) => void;
  onEdit: (e: CorgiEvent) => void;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
        {items.map((ev) => {
          const ongoing = ev.endedAt === null;
          const durationMin = Math.round(
            ((ev.endedAt ?? now) - ev.startedAt) / 60000,
          );
          return (
            <div
              key={ev.id}
              // Ongoing rows get a dashed border — same visual language as
              // the "extra meal" rows so "needs your attention" reads
              // consistently across the page.
              className={`flex items-center gap-3 rounded border p-3 text-sm ${
                ongoing ? "border-dashed" : ""
              }`}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: KIND_COLORS[kind] }}
              />
              <span className="w-32 font-medium">
                {format(ev.startedAt, "HH:mm")}
                {ev.endedAt ? ` – ${format(ev.endedAt, "HH:mm")}` : ""}
              </span>
              <span className="flex-1 text-muted-foreground">
                {ongoing
                  ? `Ongoing — ${durationMin} min so far`
                  : `${durationMin} min`}
                {ev.notes ? (
                  <span className="ml-2 italic">"{ev.notes}"</span>
                ) : null}
              </span>
              {ongoing && (
                <Button size="sm" onClick={() => onEndNow(ev)}>
                  End now
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(ev)}
                aria-label={`Edit ${kind}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function TimesCard({
  title,
  items,
  color,
  onPick,
  onAddNow,
  onAddAt,
  addLabel,
}: {
  title: string;
  items: CorgiEvent[];
  color: string;
  onPick: (e: CorgiEvent) => void;
  // Quick-add: insert a row at the current time in one tap. Covers the most
  // common case ("it just happened").
  onAddNow?: () => void;
  // Backdated add: open the dialog seeded with this kind so the user can
  // pick a different time. Surfaced as a secondary button next to "Log now".
  onAddAt?: () => void;
  addLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          {title}
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet today.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((e) => (
              <li key={e.id}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onPick(e)}
                  title="Edit"
                >
                  {format(e.startedAt, "HH:mm")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {(onAddNow || onAddAt) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {onAddNow && (
              <Button size="sm" onClick={onAddNow}>
                <Plus className="mr-1 h-3 w-3" />
                {addLabel ?? "Log now"}
              </Button>
            )}
            {onAddAt && (
              <Button size="sm" variant="outline" onClick={onAddAt}>
                Pick time…
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
