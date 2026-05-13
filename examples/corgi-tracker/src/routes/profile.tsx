// /profile — edit the corgi's identity, characteristics, and meal schedule.
//
// Stack:
//   - TanStack Form (§ Frontend › TanStack Form) — typed `useForm` owns every
//     field; we don't pair useState with controlled inputs. The meal schedule
//     uses `form.Field` with `mode="array"` for the dynamic-length list.
//   - TanStack DB (§ Frontend › TanStack DB) — `useLiveQuery` reads the
//     singleton profile row; `profile.update(id, draft => ...)` writes it
//     optimistically.
//   - shadcn Input / Select / Textarea / Card / Button (§ UI › shadcn).
//
// In-flight edits should never get clobbered by a background refetch. We do
// the first-load sync by mounting the form with the live row's values via a
// `key`-driven remount — same pattern as event-dialog.tsx.

import { Button } from "@package-ui/shadcn/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@package-ui/shadcn/components/card";
import { Input } from "@package-ui/shadcn/components/input";
import { Label } from "@package-ui/shadcn/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@package-ui/shadcn/components/select";
import { Textarea } from "@package-ui/shadcn/components/textarea";
import { useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { type CorgiProfile, type OutsideSlot, profileCollection, type Sex } from "../db";

export const Route = createFileRoute("/profile")({
  component: ProfileComponent,
});

// Preset emoji choices for the avatar — covers most dog vibes; the field is
// still a free-text input below the swatches so any emoji works.
const AVATAR_PRESETS = ["🐕", "🐶", "🦮", "🐩", "🐺", "🐾"];

function ProfileComponent() {
  const { queryClient } = Route.useRouteContext();
  const profile = useMemo(() => profileCollection(queryClient), [queryClient]);
  const { data = [] } = useLiveQuery((q) => q.from({ p: profile }));
  const corgi = data[0];

  if (!corgi) {
    // First paint before the live query resolves. Empty state instead of an
    // unhydrated form so we never have to "rebase" user edits onto fresh data.
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <ProfileForm key={corgi.id} corgi={corgi} onSave={(patch) => profile.update(corgi.id, patch)} />
  );
}

function ProfileForm({
  corgi,
  onSave,
}: {
  corgi: CorgiProfile;
  onSave: (patch: (draft: CorgiProfile) => void) => void;
}) {
  // `useForm` with the live row as the seed. The parent remounts via `key`
  // when the row id changes (only happens on profile reset), so we don't have
  // to wire effects to keep state in sync.
  const form = useForm({
    defaultValues: {
      name: corgi.name,
      avatar: corgi.avatar,
      breed: corgi.breed,
      sex: corgi.sex,
      birthDate: corgi.birthDate,
      weightKg: corgi.weightKg,
      color: corgi.color,
      notes: corgi.notes,
      mealSchedule: corgi.mealSchedule,
      outsideSchedule: corgi.outsideSchedule,
    },
    onSubmit: ({ value }) => {
      onSave((draft) => {
        draft.name = value.name.trim() || draft.name;
        draft.avatar = value.avatar.trim() || draft.avatar;
        draft.breed = value.breed.trim();
        draft.sex = value.sex;
        draft.birthDate = value.birthDate || draft.birthDate;
        draft.weightKg = value.weightKg;
        draft.color = value.color.trim();
        draft.notes = value.notes.trim();
        // Drop slots missing a time and sort chronologically so the schedule
        // reads naturally on the home page.
        draft.mealSchedule = value.mealSchedule
          .filter((s) => s.time)
          .map((s) => ({ time: s.time, label: s.label.trim() }))
          .sort((a, b) => a.time.localeCompare(b.time));
        // Outside slots: drop fixed entries with no time; trim labels;
        // clamp duration to a sane minimum. Order doesn't matter — the
        // home page expands "afterMeal" slots per meal and sorts at render.
        draft.outsideSchedule = value.outsideSchedule
          .map((s): OutsideSlot => {
            const durationMin = Math.max(1, Math.round(s.durationMin || 1));
            const label = s.label.trim();
            return s.kind === "fixed"
              ? { kind: "fixed", time: s.time, label, durationMin }
              : {
                  kind: "afterMeal",
                  offsetMin: Math.max(0, Math.round(s.offsetMin || 0)),
                  label,
                  durationMin,
                };
          })
          .filter((s) => s.kind !== "fixed" || s.time);
      });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="space-y-6"
    >
      <h1 className="text-3xl font-bold">Profile</h1>

      {/* ── Identity ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Shown on the home hero and used to compute age.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form.Field name="avatar">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="avatar">Avatar</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {AVATAR_PRESETS.map((e) => (
                    <button
                      type="button"
                      key={e}
                      onClick={() => field.handleChange(e)}
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-2xl transition-all ${
                        field.state.value === e
                          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30"
                          : "border-transparent bg-muted hover:bg-muted/70"
                      }`}
                      aria-label={`Use ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                  <Input
                    id="avatar"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-20 text-center text-lg"
                    maxLength={4}
                    aria-label="Custom avatar emoji"
                  />
                </div>
              </div>
            )}
          </form.Field>

          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="birthDate">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="birthDate">Birth date</Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="sex">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v as Sex)}
                  >
                    <SelectTrigger id="sex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="unknown">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Characteristics ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Characteristics</CardTitle>
          <CardDescription>
            Breed, weight, coat, and anything else worth remembering.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="breed">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="breed">Breed</Label>
                  <Input
                    id="breed"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Pembroke Welsh Corgi"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="weightKg">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="weightKg">Weight (kg)</Label>
                  <Input
                    id="weightKg"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={field.state.value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      field.handleChange(v === "" ? null : Number(v));
                    }}
                    placeholder="12.5"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="color">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="color">Coat / color</Label>
                <Input
                  id="color"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="red & white, tricolor, sable…"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Allergies, vet contact, microchip ID, quirks…"
                  rows={3}
                />
              </div>
            )}
          </form.Field>
        </CardContent>
      </Card>

      {/* ── Meal schedule ─────────────────────────────────────────────── */}
      {/* `mode="array"` lets TanStack Form treat the field as a list with
          push/remove/swap helpers. Each slot is { time, label } — the label
          is owner-defined ("Breakfast", "Half kibble / half wet", "Training
          treats") and seeds the meal's `notes` when logged in one tap. */}
      <form.Field name="mealSchedule" mode="array">
        {(field) => (
          <Card>
            <CardHeader>
              <CardTitle>Meal schedule</CardTitle>
              <CardDescription>
                Times your corgi normally eats, with optional labels. The home view shows the label
                next to the time and copies it into the meal's notes when you tap "log at scheduled
                time".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {field.state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meals scheduled — add one below.</p>
              ) : (
                field.state.value.map((slot, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <Input
                      type="time"
                      value={slot.time}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[i] = { ...slot, time: e.target.value };
                        field.handleChange(next);
                      }}
                      className="w-32"
                      aria-label="Meal time"
                    />
                    <Input
                      value={slot.label}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[i] = { ...slot, label: e.target.value };
                        field.handleChange(next);
                      }}
                      placeholder="Breakfast, half wet / half kibble…"
                      className="min-w-0 flex-1"
                      aria-label="Meal title"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => field.removeValue(i)}
                      aria-label="Remove meal slot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => field.pushValue({ time: "12:00", label: "" })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add meal time
              </Button>
            </CardContent>
          </Card>
        )}
      </form.Field>

      {/* ── Outside schedule ──────────────────────────────────────────── */}
      {/* Two slot kinds share one editor: "Fixed" rows have an HH:mm input,
          "After meal" rows have a minutes-after input. Switching kind via
          the Select replaces the slot in-place with a sensible default for
          the new shape so TypeScript's discriminated union stays clean. */}
      <form.Field name="outsideSchedule" mode="array">
        {(field) => (
          <Card>
            <CardHeader>
              <CardTitle>Outside schedule</CardTitle>
              <CardDescription>
                Planned outside trips. "Fixed" runs at the same time daily (good for walks). "After
                meal" emits one trip per meal slot, offset by N minutes (good for potty breaks).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {field.state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outside slots configured.</p>
              ) : (
                field.state.value.map((slot, i) => {
                  const replace = (next: OutsideSlot) => {
                    const arr = [...field.state.value];
                    arr[i] = next;
                    field.handleChange(arr);
                  };
                  return (
                    <div key={i} className="space-y-2 rounded border p-3">
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <Select
                          value={slot.kind}
                          onValueChange={(v) =>
                            replace(
                              v === "fixed"
                                ? {
                                    kind: "fixed",
                                    time: "12:00",
                                    label: slot.label,
                                    durationMin: slot.durationMin,
                                  }
                                : {
                                    kind: "afterMeal",
                                    offsetMin: 15,
                                    label: slot.label,
                                    durationMin: slot.durationMin,
                                  },
                            )
                          }
                        >
                          <SelectTrigger className="w-36 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed time</SelectItem>
                            <SelectItem value="afterMeal">After meal</SelectItem>
                          </SelectContent>
                        </Select>

                        {slot.kind === "fixed" ? (
                          <Input
                            type="time"
                            value={slot.time}
                            onChange={(e) => replace({ ...slot, time: e.target.value })}
                            className="w-32"
                            aria-label="Outside time"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={slot.offsetMin}
                              onChange={(e) =>
                                replace({
                                  ...slot,
                                  offsetMin: Number(e.target.value || 0),
                                })
                              }
                              className="w-20"
                              aria-label="Minutes after meal"
                            />
                            <span className="text-sm text-muted-foreground">min after</span>
                          </div>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => field.removeValue(i)}
                          aria-label="Remove outside slot"
                          className="ml-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <Input
                          value={slot.label}
                          onChange={(e) => replace({ ...slot, label: e.target.value })}
                          placeholder={slot.kind === "fixed" ? "Morning walk" : "Potty break"}
                          className="min-w-0 flex-1"
                          aria-label="Outside slot title"
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={slot.durationMin}
                            onChange={(e) =>
                              replace({
                                ...slot,
                                durationMin: Number(e.target.value || 1),
                              })
                            }
                            className="w-20"
                            aria-label="Expected duration in minutes"
                          />
                          <span className="text-sm text-muted-foreground">min</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    field.pushValue({
                      kind: "fixed",
                      time: "12:00",
                      label: "",
                      durationMin: 20,
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add fixed time
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    field.pushValue({
                      kind: "afterMeal",
                      offsetMin: 15,
                      label: "Potty break",
                      durationMin: 10,
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add after-meal trip
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </form.Field>

      <Button type="submit">Save changes</Button>
    </form>
  );
}
