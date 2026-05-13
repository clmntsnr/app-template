// /  — Home is "today". Hero at top, day-at-a-glance ring chart (new daily
// graph), 24h timeline, today's aggregates, then per-section quick-add cards.
//
// Stack:
//   - TanStack Router file-route (§ Frontend › TanStack Router) — typed
//     `Route.useRouteContext()` gives us the shared QueryClient.
//   - TanStack DB live queries (§ Frontend › TanStack DB) — `useLiveQuery`
//     re-renders only when matching rows change.
//   - shadcn Card / Button / Chart (§ UI › shadcn) for primitives; recharts
//     comes in through the shadcn chart wrapper for the radial graph.
//   - date-fns for day-boundary math and `format`.

import { Button } from "@package-ui/shadcn/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@package-ui/shadcn/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@package-ui/shadcn/components/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { endOfDay, format, parse, startOfDay } from "date-fns";
import { Check, Cookie, Dog, Droplet, Moon, Pencil, Plus, TreePine } from "lucide-react";
import { useMemo, useState } from "react";
import { EventDialog, type EventDialogTarget } from "../components/event-dialog";
import { Hero } from "../components/hero";
import {
  type CorgiEvent,
  eventsCollection,
  hasDuration,
  KIND_COLORS,
  KIND_LABELS,
  profileCollection,
} from "../db";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const DAY_MS = 24 * 60 * 60 * 1000;
// Percentage of the day at timestamp `ts`, clamped to [0, 100]. Used to
// position spans/dots on the 24-hour timeline.
const pct = (ts: number, dayStart: number) =>
  Math.max(0, Math.min(100, ((ts - dayStart) / DAY_MS) * 100));

function HomeComponent() {
  const { queryClient } = Route.useRouteContext();
  const events = useMemo(() => eventsCollection(queryClient), [queryClient]);
  const profile = useMemo(() => profileCollection(queryClient), [queryClient]);

  const { data: allEvents = [] } = useLiveQuery((q) =>
    q.from({ e: events }).orderBy(({ e }) => e.startedAt),
  );
  const { data: profileRows = [] } = useLiveQuery((q) => q.from({ p: profile }));
  const corgi = profileRows[0];

  const [editing, setEditing] = useState<EventDialogTarget>(null);
  const [seed, setSeed] = useState<Partial<CorgiEvent> | undefined>(undefined);
  const openNew = (s?: Partial<CorgiEvent>) => {
    setSeed(s);
    setEditing("new");
  };
  const openEdit = (e: CorgiEvent) => {
    setSeed(undefined);
    setEditing(e);
  };

  // `useLiveQuery` re-runs on every mutation so a render-time `Date.now()` is
  // up-to-date enough for the timeline. Hero owns its own 30s ticker for the
  // clock label.
  const now = Date.now();
  const dayStart = startOfDay(new Date(now)).getTime();
  const dayEnd = endOfDay(new Date(now)).getTime();

  const todaysEvents = useMemo(
    () =>
      allEvents
        .filter((e) => e.startedAt >= dayStart && e.startedAt <= dayEnd)
        .sort((a, b) => a.startedAt - b.startedAt),
    [allEvents, dayStart, dayEnd],
  );

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

    const elapsedMs = Math.min(now - dayStart, DAY_MS);
    const awakeMs = Math.max(0, elapsedMs - sleepMs);
    return { sleepMs, awakeMs, outsideMs, elapsedMs, naps, outings, pees, poops, meals };
  }, [todaysEvents, dayStart, now]);

  const mealSchedule = corgi?.mealSchedule ?? [];
  const mealSlots = useMemo(() => {
    return mealSchedule.map((slot) => {
      const slotDate = parse(slot.time, "HH:mm", new Date(now));
      const slotTs = slotDate.getTime();
      const matchedMeal =
        agg.meals.find((m) => Math.abs(m.startedAt - slotTs) < 90 * 60 * 1000) ?? null;
      return { time: slot.time, label: slot.label, slotTs, matchedMeal };
    });
  }, [mealSchedule, agg.meals, now]);

  // Expand the outside schedule into concrete time-of-day slots for today.
  //   - Fixed slots: use their HH:mm directly.
  //   - "After meal" slots: emit one trip per meal slot, anchored on the
  //     logged meal's actual start time if present, else on the meal slot's
  //     scheduled time. Lets the potty trip slide with the meal in practice.
  // Match against logged `outside` events within ±60 min so a slot flips
  // from "pending" to "done" without exact-time matching.
  const outsideSchedule = corgi?.outsideSchedule ?? [];
  const outsideSlots = useMemo(() => {
    const items: {
      key: string;
      time: string;
      label: string;
      slotTs: number;
      durationMin: number;
      matched: CorgiEvent | null;
    }[] = [];
    for (const slot of outsideSchedule) {
      if (slot.kind === "fixed") {
        const slotTs = parse(slot.time, "HH:mm", new Date(now)).getTime();
        items.push({
          key: `fixed-${slot.time}-${slot.label}`,
          time: slot.time,
          label: slot.label,
          slotTs,
          durationMin: slot.durationMin,
          matched: null,
        });
      } else {
        for (const meal of mealSlots) {
          const baseTs = meal.matchedMeal?.startedAt ?? meal.slotTs;
          const slotTs = baseTs + slot.offsetMin * 60_000;
          items.push({
            key: `after-${meal.time}-${slot.offsetMin}-${slot.label}`,
            time: format(slotTs, "HH:mm"),
            label: slot.label || `After ${meal.label || meal.time}`,
            slotTs,
            durationMin: slot.durationMin,
            matched: null,
          });
        }
      }
    }
    // Resolve matches against logged outside events. Greedy nearest-match —
    // each logged trip can only satisfy one slot.
    const claimed = new Set<number>();
    for (const it of items) {
      const candidate = agg.outings
        .filter((o) => !claimed.has(o.id))
        .find((o) => Math.abs(o.startedAt - it.slotTs) < 60 * 60_000);
      if (candidate) {
        it.matched = candidate;
        claimed.add(candidate.id);
      }
    }
    return items.sort((a, b) => a.slotTs - b.slotTs);
  }, [outsideSchedule, mealSlots, agg.outings, now]);

  // "Expected" projections for the timeline:
  //   - Meals: scheduled slots in the future that haven't been logged yet.
  //   - Outside: scheduled slots in the future that haven't been logged yet.
  //   - Naps: derived from the last 14 days of completed naps (no explicit
  //     schedule for sleep), projected onto today by start time-of-day.
  const expected = useMemo(() => {
    const futureMealSlots = mealSlots
      .filter((s) => !s.matchedMeal && s.slotTs > now)
      .map((s) => ({ ts: s.slotTs, label: s.label || "Meal" }));
    const futureOutsideSlots = outsideSlots
      .filter((s) => !s.matched && s.slotTs > now && s.slotTs < dayEnd)
      .map((s) => ({
        startedAt: s.slotTs,
        endedAt: Math.min(dayEnd, s.slotTs + s.durationMin * 60_000),
        label: s.label,
      }));
    const naps = projectFutureSpans(allEvents, "nap", now, dayStart, dayEnd);
    return { meals: futureMealSlots, naps, outside: futureOutsideSlots };
  }, [mealSlots, outsideSlots, allEvents, now, dayStart, dayEnd]);

  // Log an outside trip with the slot's expected duration. Notes seed from
  // the slot label so "Potty break" / "Morning walk" travels with the event.
  const logOutsideAt = (slotTs: number, durationMin: number, label: string) => {
    events.insert({
      id: Date.now(),
      type: "outside",
      startedAt: slotTs,
      endedAt: slotTs + durationMin * 60_000,
      notes: label.trim() || undefined,
    });
  };

  // Seed the event's `notes` with the slot's label so the owner's recipe
  // ("half kibble / half wet") travels with the meal record.
  const logMealAt = (ts: number, notes?: string) => {
    events.insert({
      id: Date.now(),
      type: "meal",
      startedAt: ts,
      endedAt: null,
      notes: notes?.trim() || undefined,
    });
  };
  const endNow = (e: CorgiEvent) => {
    events.update(e.id, (draft) => {
      draft.endedAt = Date.now();
    });
  };
  const logInstantNow = (kind: "pee" | "poop" | "meal") => {
    events.insert({ id: Date.now(), type: kind, startedAt: Date.now(), endedAt: null });
  };
  // Start a duration event with no end timestamp — same flow as the
  // "Start nap / Start outside" buttons inside DurationCard. Closes via
  // the "End now" action on the home page.
  const startDurationNow = (kind: "nap" | "outside") => {
    events.insert({ id: Date.now(), type: kind, startedAt: Date.now(), endedAt: null });
  };

  // Unified "Coming up" feed: every still-unmatched future event combined
  // and sorted chronologically. Tapping the row's button logs the event at
  // its scheduled time (or starts the duration event, for naps).
  type ComingItem = {
    key: string;
    ts: number;
    kind: "meal" | "outside" | "nap";
    Icon: typeof Cookie;
    label: string;
    sub: string;
    onLog: () => void;
  };
  const comingUp = useMemo<ComingItem[]>(() => {
    const items: ComingItem[] = [];
    for (const s of mealSlots) {
      if (!s.matchedMeal && s.slotTs > now) {
        items.push({
          key: `meal-${s.slotTs}`,
          ts: s.slotTs,
          kind: "meal",
          Icon: Cookie,
          label: s.label || "Meal",
          sub: format(s.slotTs, "HH:mm"),
          onLog: () => logMealAt(s.slotTs, s.label),
        });
      }
    }
    for (const s of outsideSlots) {
      if (!s.matched && s.slotTs > now) {
        items.push({
          key: `outside-${s.key}-${s.slotTs}`,
          ts: s.slotTs,
          kind: "outside",
          Icon: TreePine,
          label: s.label || "Outside",
          sub: `${format(s.slotTs, "HH:mm")} · ~${s.durationMin} min`,
          onLog: () => logOutsideAt(s.slotTs, s.durationMin, s.label),
        });
      }
    }
    for (const n of expected.naps) {
      items.push({
        key: `nap-${n.startedAt}`,
        ts: n.startedAt,
        kind: "nap",
        Icon: Moon,
        label: "Typical nap",
        sub: `${format(n.startedAt, "HH:mm")}–${format(n.endedAt, "HH:mm")}`,
        onLog: () =>
          events.insert({
            id: Date.now(),
            type: "nap",
            startedAt: n.startedAt,
            endedAt: n.endedAt,
          }),
      });
    }
    return items.sort((a, b) => a.ts - b.ts);
  }, [mealSlots, outsideSlots, expected.naps, now, events]);

  return (
    <div className="space-y-6">
      <Hero corgi={corgi} events={allEvents} />

      <Timeline
        events={todaysEvents}
        expected={expected}
        dayStart={dayStart}
        now={now}
        onPick={openEdit}
      />

      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
          <CardDescription>
            Every upcoming scheduled meal, planned outside trip, and typical nap window — sorted
            chronologically. Tap a row to record the event at its scheduled time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {comingUp.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled for the rest of the day.
            </p>
          ) : (
            comingUp.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded border border-dashed p-3 text-sm"
              >
                <item.Icon className="h-4 w-4 shrink-0" style={{ color: KIND_COLORS[item.kind] }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.sub}</div>
                </div>
                <Button size="sm" variant="outline" onClick={item.onLog}>
                  Log
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Sleeping" value={formatHm(agg.sleepMs)} accent={KIND_COLORS.nap} />
        <StatCard title="Awake" value={formatHm(agg.awakeMs)} />
        <StatCard title="Outside" value={formatHm(agg.outsideMs)} accent={KIND_COLORS.outside} />
        <StatCard title="Pees / Poops" value={`${agg.pees.length} / ${agg.poops.length}`} />
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
          "Log a nap when it starts, then set the end time when they wake up. " +
          'An ongoing nap shows an "End now" button so you can close it in one ' +
          "tap without opening the editor."
        }
        kind="nap"
        Icon={Moon}
        items={agg.naps}
        now={now}
        addLabel="Add nap"
        emptyLabel="No naps today yet."
        onEndNow={endNow}
        onEdit={openEdit}
        onAdd={() => openNew({ type: "nap", startedAt: Date.now(), endedAt: null })}
      />

      <DurationCard
        title="Outside"
        description={
          "Same idea as naps — start the outside trip, end it when they come " +
          "back in. Useful for tracking how much time they actually spend " +
          "outdoors per day."
        }
        kind="outside"
        Icon={TreePine}
        items={agg.outings}
        now={now}
        addLabel="Add outside"
        emptyLabel="No outside trips today yet."
        onEndNow={endNow}
        onEdit={openEdit}
        onAdd={() => openNew({ type: "outside", startedAt: Date.now(), endedAt: null })}
      />

      <Card>
        <CardHeader>
          <CardTitle>Meals</CardTitle>
          <CardDescription>
            Scheduled times come from your profile. Slots in the future show a one-click "log at
            scheduled time" so you don't have to type a timestamp when a meal happened right on
            time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mealSlots.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No meal schedule set — add one on /profile.
            </p>
          )}
          {mealSlots.map(({ time, label, slotTs, matchedMeal }) => (
            <div key={time} className="flex items-center gap-3 rounded border p-3 text-sm">
              <Cookie className="h-4 w-4 shrink-0" style={{ color: KIND_COLORS.meal }} />
              <span className="w-16 font-medium">{time}</span>
              <div className="flex-1 text-muted-foreground">
                {label && <div className="font-medium text-foreground">{label}</div>}
                {matchedMeal ? (
                  <span>
                    <Check className="mr-1 inline h-3 w-3 text-green-600" />
                    Eaten at {format(matchedMeal.startedAt, "HH:mm")}
                    {matchedMeal.notes && matchedMeal.notes !== label ? (
                      <span className="ml-2 italic">"{matchedMeal.notes}"</span>
                    ) : null}
                  </span>
                ) : (
                  <span>Not logged yet</span>
                )}
              </div>
              {matchedMeal ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(matchedMeal)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => logMealAt(slotTs, label)}>
                  <Plus className="mr-1 h-3 w-3" />
                  Log at {time}
                </Button>
              )}
            </div>
          ))}
          {agg.meals
            .filter((m) => !mealSlots.some((s) => s.matchedMeal?.id === m.id))
            .map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded border border-dashed p-3 text-sm"
              >
                <Cookie className="h-4 w-4 shrink-0" style={{ color: KIND_COLORS.meal }} />
                <span className="w-16 font-medium">{format(m.startedAt, "HH:mm")}</span>
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
              onClick={() => openNew({ type: "meal", startedAt: Date.now(), endedAt: null })}
            >
              Pick time…
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outside schedule</CardTitle>
          <CardDescription>
            Planned trips from your profile — fixed walk times plus a potty trip a few minutes after
            each meal. Upcoming slots show a one-click "log at HH:mm" button that records the trip
            with the slot's expected duration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {outsideSlots.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No outside slots configured — add some on /profile.
            </p>
          )}
          {outsideSlots.map((s) => (
            <div key={s.key} className="flex items-center gap-3 rounded border p-3 text-sm">
              <TreePine className="h-4 w-4 shrink-0" style={{ color: KIND_COLORS.outside }} />
              <span className="w-16 font-medium">{s.time}</span>
              <div className="flex-1 text-muted-foreground">
                {s.label && <div className="font-medium text-foreground">{s.label}</div>}
                {s.matched ? (
                  <span>
                    <Check className="mr-1 inline h-3 w-3 text-green-600" />
                    {format(s.matched.startedAt, "HH:mm")}
                    {s.matched.endedAt ? `–${format(s.matched.endedAt, "HH:mm")}` : ""}
                  </span>
                ) : (
                  <span>~{s.durationMin} min · not logged yet</span>
                )}
              </div>
              {s.matched ? (
                <Button size="sm" variant="ghost" onClick={() => openEdit(s.matched as CorgiEvent)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => logOutsideAt(s.slotTs, s.durationMin, s.label)}>
                  <Plus className="mr-1 h-3 w-3" />
                  Log at {s.time}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <EventDialog
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

      {/* Unified log FAB. shadcn DropdownMenu keeps every event kind one tap
          away on mobile without scrolling to a specific section. Pees /
          poops / meals insert instantly; naps and outside start as open
          duration events that the matching DurationCard then exposes an
          "End now" button on. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="fixed bottom-4 right-4 h-14 w-14 rounded-full p-0 shadow-lg sm:bottom-6 sm:right-6"
            aria-label="Log event"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuLabel>Log now</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => logInstantNow("pee")}>
            <Droplet className="mr-2 h-4 w-4" style={{ color: KIND_COLORS.pee }} />
            Pee
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => logInstantNow("poop")}>
            <Dog className="mr-2 h-4 w-4" style={{ color: KIND_COLORS.poop }} />
            Poop
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => logInstantNow("meal")}>
            <Cookie className="mr-2 h-4 w-4" style={{ color: KIND_COLORS.meal }} />
            Meal
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Start</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => startDurationNow("nap")}>
            <Moon className="mr-2 h-4 w-4" style={{ color: KIND_COLORS.nap }} />
            Nap
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => startDurationNow("outside")}>
            <TreePine className="mr-2 h-4 w-4" style={{ color: KIND_COLORS.outside }} />
            Outside
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openNew()}>
            <Pencil className="mr-2 h-4 w-4" />
            Custom entry…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────

function Timeline({
  events,
  expected,
  dayStart,
  now,
  onPick,
}: {
  events: CorgiEvent[];
  // Future-only projections: upcoming scheduled meals/outside trips not yet
  // logged, plus nap windows projected from the last 14 days of history.
  expected: {
    meals: { ts: number; label: string }[];
    naps: { startedAt: number; endedAt: number }[];
    outside: { startedAt: number; endedAt: number; label?: string }[];
  };
  dayStart: number;
  now: number;
  onPick: (e: CorgiEvent) => void;
}) {
  // Two tick densities: thicker line every hour, hairline every 15 min. Gives
  // a clear half-/quarter-hour read without crowding the bar.
  const hourTicks = Array.from({ length: 25 }, (_, h) => h);
  const quarterTicks = Array.from({ length: 24 * 4 + 1 }, (_, i) => i / 4);
  const nowPct = pct(now, dayStart);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Day timeline</CardTitle>
        <CardDescription>
          Spans show naps and outside trips; dots show meals, pees, and poops. Dashed spans and
          hollow dots are <em>expected</em> events — upcoming scheduled meals and typical
          nap/outside windows from the last two weeks. The vertical line marks "now".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative h-16 w-full overflow-hidden rounded border bg-muted/30">
          {/* Minor 15-min ticks. Subtle so they don't dominate the bar. */}
          {quarterTicks.map((h) => (
            <div
              key={`q-${h}`}
              className="absolute top-0 bottom-0 w-px bg-border/30"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
          {/* Major hour graduations on top of the minor grid. */}
          {hourTicks.map((h) => (
            <div
              key={h}
              className="absolute top-0 bottom-0 border-l border-border/70"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
          {/* Ghost spans (expected naps + outside). Rendered before real
              events so an actual span paints over its prediction. */}
          {expected.naps.map((e, i) => (
            <ExpectedSpan
              key={`exp-nap-${i}`}
              startedAt={e.startedAt}
              endedAt={e.endedAt}
              kind="nap"
              dayStart={dayStart}
            />
          ))}
          {expected.outside.map((e, i) => (
            <ExpectedSpan
              key={`exp-out-${i}`}
              startedAt={e.startedAt}
              endedAt={e.endedAt}
              kind="outside"
              label={e.label}
              dayStart={dayStart}
            />
          ))}
          {/* Ghost dots (upcoming meals). */}
          {expected.meals.map((m) => (
            <div
              key={`exp-meal-${m.ts}`}
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
              style={{
                left: `${pct(m.ts, dayStart)}%`,
                backgroundColor: "transparent",
                border: `2px dashed ${KIND_COLORS.meal}`,
              }}
              title={`${m.label} (scheduled ${format(m.ts, "HH:mm")})`}
            />
          ))}
          {/* Now indicator — bright accent line + dot at the top so it's
              obvious which moment "now" refers to. */}
          <div
            role="img"
            aria-label="now"
            className="absolute top-0 bottom-0 w-0.5 bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
            style={{ left: `${nowPct}%` }}
          />
          <div
            aria-hidden
            className="absolute top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 ring-2 ring-background"
            style={{ left: `${nowPct}%` }}
          />
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
                  title={`${KIND_LABELS[e.type]} ${format(e.startedAt, "HH:mm")}${
                    e.endedAt ? `–${format(e.endedAt, "HH:mm")}` : " (ongoing)"
                  }`}
                />
              );
            })}
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
        {/* Hour labels — every 2h so the strip stays readable on phones,
            with a clamped "now" pill in matching accent color. */}
        <div className="relative h-5 w-full text-xs text-muted-foreground">
          {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((h) => (
            <div
              key={h}
              className="absolute -translate-x-1/2 tabular-nums"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
          <div
            className="absolute -top-0.5 -translate-x-1/2 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow tabular-nums"
            // Clamp the "now" pill horizontally so it stays inside the
            // timeline strip near 00:00 / 24:00 edges.
            style={{ left: `${Math.max(4, Math.min(96, nowPct))}%` }}
          >
            {format(now, "HH:mm")}
          </div>
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
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 rounded border-2 border-dashed"
          style={{ borderColor: KIND_COLORS.nap }}
        />
        Expected
      </span>
    </div>
  );
}

// Ghost rendering of a predicted nap or outside span. Faint fill + dashed
// outline so it reads as "secondary" without disappearing on dense days.
function ExpectedSpan({
  startedAt,
  endedAt,
  kind,
  label,
  dayStart,
}: {
  startedAt: number;
  endedAt: number;
  kind: "nap" | "outside";
  label?: string;
  dayStart: number;
}) {
  const left = pct(startedAt, dayStart);
  const right = pct(endedAt, dayStart);
  const width = Math.max(0.4, right - left);
  const range = `${format(startedAt, "HH:mm")}–${format(endedAt, "HH:mm")}`;
  const title = label
    ? `${label} (planned ${range})`
    : `Expected ${KIND_LABELS[kind].toLowerCase()} ${range}`;
  return (
    <div
      className="absolute top-2 bottom-2 rounded border-2 border-dashed"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        borderColor: KIND_COLORS[kind],
        backgroundColor: KIND_COLORS[kind],
        opacity: 0.22,
      }}
      title={title}
      aria-hidden
    />
  );
}

// ─── Expected-event projection ─────────────────────────────────────────────
//
// Look at the last LOOKBACK_DAYS of historical duration events of `kind`,
// project each one's start time-of-day onto today, average the durations
// within nearby start times, and filter to windows still in the future of
// `now`. Yields up to a handful of "expected" spans per kind.

const LOOKBACK_DAYS = 14;
// Collapse history points whose start time-of-day is within this window into
// one expected span. 45 minutes is wide enough to merge "around 2pm" naps
// from different days, narrow enough to keep distinct mid-morning and
// late-afternoon naps separate.
const CLUSTER_MS = 45 * 60 * 1000;

function projectFutureSpans(
  events: CorgiEvent[],
  kind: "nap" | "outside",
  now: number,
  dayStart: number,
  dayEnd: number,
): { startedAt: number; endedAt: number }[] {
  const horizonStart = dayStart - LOOKBACK_DAYS * DAY_MS;
  // Collect (time-of-day in ms since midnight, duration in ms) pairs from
  // closed events of the right kind, within the lookback window, excluding
  // today (we don't want today's events to predict themselves).
  const samples: { tod: number; durMs: number }[] = [];
  for (const e of events) {
    if (e.type !== kind || !e.endedAt) continue;
    if (e.startedAt < horizonStart) continue;
    if (e.startedAt >= dayStart) continue; // skip today
    const startDate = new Date(e.startedAt);
    const tod =
      (startDate.getHours() * 60 + startDate.getMinutes()) * 60_000 + startDate.getSeconds() * 1000;
    samples.push({ tod, durMs: Math.max(0, e.endedAt - e.startedAt) });
  }
  if (samples.length === 0) return [];
  samples.sort((a, b) => a.tod - b.tod);

  // Cluster by start-of-day proximity, average duration within each cluster.
  type Cluster = { todSum: number; durSum: number; count: number };
  const clusters: Cluster[] = [];
  for (const s of samples) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last.todSum / last.count - s.tod) <= CLUSTER_MS) {
      last.todSum += s.tod;
      last.durSum += s.durMs;
      last.count += 1;
    } else {
      clusters.push({ todSum: s.tod, durSum: s.durMs, count: 1 });
    }
  }

  // Project each cluster onto today and keep only those still in the future
  // of `now`. We allow single-occurrence clusters — for a small personal
  // tracker, one observation is already useful signal. The 45-min clustering
  // above still prevents two near-identical predictions.
  return clusters
    .map((c) => {
      const startedAt = dayStart + c.todSum / c.count;
      const endedAt = Math.min(dayEnd, startedAt + c.durSum / c.count);
      return { startedAt, endedAt };
    })
    .filter((c) => c.startedAt > now && c.startedAt < dayEnd);
}

// ─── Small presentational helpers ──────────────────────────────────────────

function formatHm(ms: number) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function StatCard({ title, value, accent }: { title: string; value: string; accent?: string }) {
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
        {items.length === 0 && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
        {items.map((ev) => {
          const ongoing = ev.endedAt === null;
          const durationMin = Math.round(((ev.endedAt ?? now) - ev.startedAt) / 60000);
          return (
            <div
              key={ev.id}
              className={`flex items-center gap-3 rounded border p-3 text-sm ${
                ongoing ? "border-dashed" : ""
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: KIND_COLORS[kind] }} />
              <span className="w-32 font-medium">
                {format(ev.startedAt, "HH:mm")}
                {ev.endedAt ? ` – ${format(ev.endedAt, "HH:mm")}` : ""}
              </span>
              <span className="flex-1 text-muted-foreground">
                {ongoing ? `Ongoing — ${durationMin} min so far` : `${durationMin} min`}
                {ev.notes ? <span className="ml-2 italic">"{ev.notes}"</span> : null}
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
  onAddNow?: () => void;
  onAddAt?: () => void;
  addLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {title}
          <span className="ml-auto text-sm font-normal text-muted-foreground">{items.length}</span>
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
