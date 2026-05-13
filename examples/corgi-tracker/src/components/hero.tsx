// Shared hero card — same look across the home (today) and trends pages.
//
// Renders: round avatar, name + age, live date/time, and a row of status
// badges derived from recent events (sleeping/awake, inside/outside, last
// poop / pee / meal within the recent window).
//
// Stack pointers:
//   - shadcn Badge — see docs/best-pratices/tech-stack.md § UI › shadcn.
//     We extend the default `outline` variant with per-kind color classes
//     (BADGE_STYLES) instead of editing the shadcn primitive directly, so
//     the component stays one-file overridable.
//   - lucide-react icons inside the badges.
//   - date-fns for `format`, `differenceInYears`, `formatDistanceToNowStrict`.

import { Badge } from "@package-ui/shadcn/components/badge";
import { differenceInYears, format, formatDistanceToNowStrict } from "date-fns";
import { Cookie, Dog, Droplet, Home, Moon, Sparkles, Sun, TreePine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CorgiEvent, CorgiProfile } from "../db";

// "Recent" window for status badges — older events don't appear on the hero.
const RECENT_MS = 4 * 60 * 60 * 1000;

export function Hero({ corgi, events }: { corgi: CorgiProfile | undefined; events: CorgiEvent[] }) {
  // Tick the clock every 30s so "23 min ago" stays honest. Cheaper than
  // every second and indistinguishable to a human reader.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const status = useMemo(() => deriveStatus(events, now), [events, now]);
  const ageYears = corgi ? differenceInYears(new Date(now), new Date(corgi.birthDate)) : 0;

  return (
    <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-orange-100 via-amber-50 to-rose-50 p-6 shadow-sm dark:from-orange-950/40 dark:via-amber-950/30 dark:to-rose-950/30 sm:p-8">
      {/* Decorative blobs — pure aesthetic, hidden from screen readers. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-orange-300/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-rose-300/30 blur-3xl"
      />

      <div className="relative flex flex-col items-center text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        {/* Avatar — emoji inside a circular frame so it reads as a portrait
            even without a real photo. Swap to <img> + profile.avatarUrl
            later without touching the rest of the layout. */}
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-amber-200 to-orange-300 text-6xl shadow-lg sm:h-32 sm:w-32 sm:text-7xl">
          <span role="img" aria-label={corgi?.name ?? "corgi"}>
            {corgi?.avatar || "🐕"}
          </span>
        </div>

        <div className="mt-4 flex-1 sm:mt-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {corgi?.name ?? "Your corgi"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {corgi
              ? `${ageYears} ${ageYears === 1 ? "year" : "years"} old`
              : "Set up your corgi on /profile"}
            {" • "}
            <time dateTime={new Date(now).toISOString()}>{format(now, "EEE, MMM d • HH:mm")}</time>
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <StatusBadge
              kind={status.sleeping ? "sleeping" : "awake"}
              label={status.sleeping ? "Sleeping" : "Awake"}
              Icon={status.sleeping ? Moon : Sun}
            />
            <StatusBadge
              kind={status.outside ? "outside" : "inside"}
              label={status.outside ? "Outside" : "Inside"}
              Icon={status.outside ? TreePine : Home}
            />
            {status.lastPoop && (
              <StatusBadge
                kind="poop"
                label={`Pooped ${relative(status.lastPoop, now)}`}
                Icon={Dog}
              />
            )}
            {status.lastPee && (
              <StatusBadge
                kind="pee"
                label={`Peed ${relative(status.lastPee, now)}`}
                Icon={Droplet}
              />
            )}
            {status.lastMeal && (
              <StatusBadge
                kind="meal"
                label={`Ate ${relative(status.lastMeal, now)}`}
                Icon={Cookie}
              />
            )}
            {!status.lastPoop && !status.lastPee && !status.lastMeal && (
              <StatusBadge kind="quiet" label="Quiet" Icon={Sparkles} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────

type BadgeKind = "sleeping" | "awake" | "outside" | "inside" | "poop" | "pee" | "meal" | "quiet";

const BADGE_STYLES: Record<BadgeKind, string> = {
  sleeping:
    "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200",
  awake: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200",
  outside:
    "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200",
  inside: "bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200",
  poop: "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200",
  pee: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200",
  meal: "bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200",
  quiet: "bg-muted text-muted-foreground border-transparent",
};

function StatusBadge({ kind, label, Icon }: { kind: BadgeKind; label: string; Icon: typeof Moon }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 px-2.5 py-1 text-xs font-medium ${BADGE_STYLES[kind]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}

// ─── Status derivation ─────────────────────────────────────────────────────

type Status = {
  sleeping: boolean;
  outside: boolean;
  lastPoop: number | null;
  lastPee: number | null;
  lastMeal: number | null;
};

function deriveStatus(events: CorgiEvent[], now: number): Status {
  const out: Status = {
    sleeping: false,
    outside: false,
    lastPoop: null,
    lastPee: null,
    lastMeal: null,
  };
  for (const ev of events) {
    if (ev.type === "nap") {
      if (ev.startedAt <= now && (ev.endedAt === null || ev.endedAt > now)) {
        out.sleeping = true;
      }
    } else if (ev.type === "outside") {
      if (ev.startedAt <= now && (ev.endedAt === null || ev.endedAt > now)) {
        out.outside = true;
      }
    } else if (ev.type === "poop") {
      if (now - ev.startedAt <= RECENT_MS && (!out.lastPoop || ev.startedAt > out.lastPoop)) {
        out.lastPoop = ev.startedAt;
      }
    } else if (ev.type === "pee") {
      if (now - ev.startedAt <= RECENT_MS && (!out.lastPee || ev.startedAt > out.lastPee)) {
        out.lastPee = ev.startedAt;
      }
    } else if (ev.type === "meal") {
      if (now - ev.startedAt <= RECENT_MS && (!out.lastMeal || ev.startedAt > out.lastMeal)) {
        out.lastMeal = ev.startedAt;
      }
    }
  }
  return out;
}

function relative(ts: number, now: number): string {
  const diffMs = now - ts;
  if (diffMs < 60_000) return "just now";
  return `${formatDistanceToNowStrict(ts, { roundingMethod: "floor" })} ago`;
}
