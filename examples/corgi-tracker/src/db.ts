// Data layer for the corgi tracker.
//
// The pattern is the same as examples/tanstack-spa: a small async "API"
// pretends to be a server, and TanStack DB exposes that API as a reactive
// client-side collection with optimistic mutations on insert/update/delete.
//
// Difference here: instead of an in-memory array that resets on reload, we
// persist to localStorage so the app is actually useful for tracking your
// dog day-to-day. The async/delay wrapping is preserved so the optimistic-
// mutation code path in TanStack DB is the same one you'd hit against a real
// backend.

import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";

// ─── Types ─────────────────────────────────────────────────────────────────

export type Sex = "male" | "female" | "unknown";

export type MealSlot = {
  // Local time "HH:mm". The slot id (for keys + dedup) is this string —
  // there's no reason to keep two slots at the exact same minute.
  time: string;
  // Owner-defined title or recipe note. Free-form, optional. Surfaces on
  // the home page next to the time and as a default `notes` value when
  // logging the meal via the one-click button.
  label: string;
};

// Two ways to schedule an outside trip:
//   - "fixed":     happens at an absolute time of day (e.g., 08:30 walk).
//   - "afterMeal": happens N minutes after each meal slot (potty break).
//                  Computed per-meal-slot at render time, so adding/removing
//                  meals automatically adds/removes the matching trips.
export type OutsideSlot =
  | {
      kind: "fixed";
      // Local "HH:mm". Doubles as the slot key.
      time: string;
      label: string;
      // Estimated duration; controls the ghost span's width on the timeline.
      durationMin: number;
    }
  | {
      kind: "afterMeal";
      // Minutes after each meal slot to schedule the trip.
      offsetMin: number;
      label: string;
      durationMin: number;
    };

export type CorgiProfile = {
  // Single-row "table" — we always use id = 1. Modeled as a collection
  // anyway so the profile screen gets the same reactive update plumbing.
  id: 1;
  name: string;
  // ISO date string (YYYY-MM-DD) — birthdates don't need timezone precision.
  birthDate: string;
  // Daily meal schedule. Each slot has a time ("HH:mm" local) and an
  // optional owner-defined label ("Breakfast", "Half kibble / half wet",
  // etc.). The home page renders each slot and offers a one-click "log at
  // scheduled time" button until eaten.
  mealSchedule: MealSlot[];
  // Planned outside trips. Mix and match fixed-time walks with after-meal
  // potty breaks. The home page renders ghost spans for upcoming slots and
  // a card with one-click "log at HH:mm" buttons.
  outsideSchedule: OutsideSlot[];
  // ── Characteristics ──────────────────────────────────────────────────────
  // Avatar shown on the hero. Plain emoji string keeps storage trivial and
  // lets us swap to <img src={avatarUrl}> later by adding a sibling field.
  avatar: string;
  breed: string;
  sex: Sex;
  // Weight in kilograms. `null` when unknown so the input can stay blank
  // instead of forcing a placeholder zero.
  weightKg: number | null;
  // Free-form coat description ("red & white", "tricolor", etc.) — too
  // open-ended to enumerate well.
  color: string;
  // Notes the owner wants surfaced (allergies, vet, microchip ID, quirks).
  notes: string;
};

// Two shapes of event share one row:
//   - Duration events (nap, outside) have a startedAt and endedAt. While
//     endedAt is null the event is "in progress" and contributes 0 minutes
//     to charts until closed.
//   - Instant events (poop, pee, meal) only use startedAt; endedAt stays null
//     forever.
// Keeping them in one collection means the recent-events list is a single
// chronological view and the edit form has one code path.
export type EventKind = "nap" | "outside" | "poop" | "pee" | "meal";

export const EVENT_KINDS: readonly EventKind[] = ["nap", "outside", "poop", "pee", "meal"] as const;

export const hasDuration = (kind: EventKind) => kind === "nap" || kind === "outside";

// One place to keep label + color so every visualization (timeline, charts,
// list rows) renders the same identity for each event kind. Colors are
// hand-picked HSL values that read well on a white background and stay
// distinct from each other.
export const KIND_LABELS: Record<EventKind, string> = {
  nap: "Nap",
  outside: "Outside",
  poop: "Poop",
  pee: "Pee",
  meal: "Meal",
};

export const KIND_COLORS: Record<EventKind, string> = {
  nap: "hsl(262, 70%, 60%)",
  outside: "hsl(142, 71%, 45%)",
  poop: "hsl(28, 70%, 50%)",
  pee: "hsl(199, 89%, 48%)",
  meal: "hsl(340, 75%, 55%)",
};

export type CorgiEvent = {
  id: number;
  type: EventKind;
  startedAt: number;
  endedAt: number | null;
  notes?: string;
};

// ─── localStorage-backed mock store ────────────────────────────────────────

// Tiny helper that reads JSON with a fallback. Wrapping each access keeps
// the API functions below readable.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

const PROFILE_KEY = "corgi:profile";
const EVENTS_KEY = "corgi:events";

const defaultProfile: CorgiProfile = {
  id: 1,
  name: "Biscuit",
  // Roughly two years old at the time of writing — easy to overwrite
  // from the /profile screen.
  birthDate: "2024-03-15",
  mealSchedule: [
    { time: "08:00", label: "Breakfast" },
    { time: "18:00", label: "Dinner" },
  ],
  outsideSchedule: [
    { kind: "afterMeal", offsetMin: 15, label: "Potty break", durationMin: 10 },
    { kind: "fixed", time: "12:30", label: "Midday walk", durationMin: 30 },
  ],
  avatar: "🐕",
  breed: "Pembroke Welsh Corgi",
  sex: "unknown",
  weightKg: null,
  color: "",
  notes: "",
};

// Simulated network latency. Makes the optimistic-update behavior visible
// in the UI and approximates a real backend without one.
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const profileApi = {
  get: async (): Promise<CorgiProfile> => {
    await delay(80);
    // Merge with defaults — older localStorage rows may predate fields like
    // `mealSchedule`. Spread order: stored values win, but missing keys fall
    // back to defaults instead of becoming `undefined`.
    const stored = read<Partial<CorgiProfile> & { mealSchedule?: unknown }>(PROFILE_KEY, {});
    // Migrate the old `mealSchedule: string[]` shape (just HH:mm strings) to
    // the new `MealSlot[]` shape. Keeps existing data usable without a wipe.
    const rawSchedule = stored.mealSchedule;
    const mealSchedule: MealSlot[] = Array.isArray(rawSchedule)
      ? rawSchedule.map((s) => (typeof s === "string" ? { time: s, label: "" } : (s as MealSlot)))
      : defaultProfile.mealSchedule;
    return { ...defaultProfile, ...stored, mealSchedule, id: 1 };
  },
  update: async (profile: CorgiProfile) => {
    await delay(80);
    write(PROFILE_KEY, profile);
  },
};

export const eventsApi = {
  list: async (): Promise<CorgiEvent[]> => {
    await delay(80);
    return read<CorgiEvent[]>(EVENTS_KEY, []);
  },
  create: async (event: CorgiEvent) => {
    await delay(80);
    const all = read<CorgiEvent[]>(EVENTS_KEY, []);
    write(EVENTS_KEY, [...all, event]);
  },
  update: async (event: CorgiEvent) => {
    await delay(80);
    const all = read<CorgiEvent[]>(EVENTS_KEY, []);
    write(
      EVENTS_KEY,
      all.map((e) => (e.id === event.id ? event : e)),
    );
  },
  remove: async (id: number) => {
    await delay(80);
    const all = read<CorgiEvent[]>(EVENTS_KEY, []);
    write(
      EVENTS_KEY,
      all.filter((e) => e.id !== id),
    );
  },
};

// ─── TanStack DB collections ───────────────────────────────────────────────
//
// Each collection wraps a Query (for the initial fetch + revalidation) and
// supplies insert/update/delete handlers. TanStack DB applies the local
// change immediately (optimistic), calls the handler, and rolls back if the
// handler throws. With localStorage there's no realistic failure, but the
// same shape works against a real API later.

export const eventsCollection = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions<CorgiEvent>({
      id: "events",
      queryKey: ["events"],
      queryFn: eventsApi.list,
      queryClient,
      getKey: (e) => e.id,
      onInsert: async ({ transaction }) => {
        for (const m of transaction.mutations) await eventsApi.create(m.modified);
      },
      onUpdate: async ({ transaction }) => {
        for (const m of transaction.mutations) await eventsApi.update(m.modified);
      },
      onDelete: async ({ transaction }) => {
        for (const m of transaction.mutations) await eventsApi.remove(m.original.id);
      },
    }),
  );

export const profileCollection = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions<CorgiProfile>({
      id: "profile",
      queryKey: ["profile"],
      // Wrap the single profile in an array so the collection has a
      // consistent shape with `events`.
      queryFn: async () => [await profileApi.get()],
      queryClient,
      getKey: (p) => p.id,
      onUpdate: async ({ transaction }) => {
        for (const m of transaction.mutations) await profileApi.update(m.modified);
      },
      // No insert/delete handlers — profile is a fixed singleton, mutations
      // beyond `update` are nonsensical.
    }),
  );
