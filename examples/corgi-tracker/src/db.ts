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

import type { QueryClient } from "@tanstack/react-query";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

// ─── Types ─────────────────────────────────────────────────────────────────

export type CorgiProfile = {
  // Single-row "table" — we always use id = 1. Modeled as a collection
  // anyway so the profile screen gets the same reactive update plumbing.
  id: 1;
  name: string;
  // ISO date string (YYYY-MM-DD) — birthdates don't need timezone precision.
  birthDate: string;
  // Daily meal schedule as "HH:mm" strings (local time). The Today view
  // shows each slot and offers a one-click "log at scheduled time" button.
  // Defaults to breakfast + dinner; user can edit on /profile.
  mealSchedule: string[];
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

export const EVENT_KINDS: readonly EventKind[] = [
  "nap",
  "outside",
  "poop",
  "pee",
  "meal",
] as const;

export const hasDuration = (kind: EventKind) =>
  kind === "nap" || kind === "outside";

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
  mealSchedule: ["08:00", "18:00"],
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
    const stored = read<Partial<CorgiProfile>>(PROFILE_KEY, {});
    return { ...defaultProfile, ...stored, id: 1 };
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
