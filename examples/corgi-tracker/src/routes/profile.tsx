// /profile — edit the corgi's name, birthdate, and daily meal schedule.
//
// The meal schedule is a list of "HH:mm" strings (local time) that the Today
// view turns into "scheduled meal" slots. Editing here is the only way to
// add/remove a slot; per-meal time tweaks live on /today.

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
import { Input } from "@package-ui/shadcn/components/input";
import { Label } from "@package-ui/shadcn/components/label";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { profileCollection } from "../db";

export const Route = createFileRoute("/profile")({
  component: ProfileComponent,
});

function ProfileComponent() {
  const { queryClient } = Route.useRouteContext();
  const profile = useMemo(() => profileCollection(queryClient), [queryClient]);
  const { data = [] } = useLiveQuery((q) => q.from({ p: profile }));
  const corgi = data[0];

  // Local form state seeded from the live row. We deliberately don't keep
  // these in sync via effect — the user's in-flight edits should never get
  // clobbered by a background refetch.
  const [name, setName] = useState(corgi?.name ?? "");
  const [birthDate, setBirthDate] = useState(corgi?.birthDate ?? "");
  const [meals, setMeals] = useState<string[]>(corgi?.mealSchedule ?? []);
  // First-load sync: while the query hasn't resolved we render empty fields,
  // then drop into the real data once. Skipping the effect avoids the
  // "stale state vs. fresh query" flicker.
  const [hydrated, setHydrated] = useState(false);
  if (corgi && !hydrated) {
    setName(corgi.name);
    setBirthDate(corgi.birthDate);
    setMeals(corgi.mealSchedule);
    setHydrated(true);
  }

  const save = () => {
    if (!corgi) return;
    profile.update(corgi.id, (draft) => {
      draft.name = name.trim() || draft.name;
      draft.birthDate = birthDate || draft.birthDate;
      // Drop empty entries and sort so the schedule reads naturally.
      draft.mealSchedule = meals.filter((m) => m).sort();
    });
  };

  const addSlot = () => setMeals((prev) => [...prev, "12:00"]);
  const updateSlot = (i: number, v: string) =>
    setMeals((prev) => prev.map((m, idx) => (idx === i ? v : m)));
  const removeSlot = (i: number) =>
    setMeals((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Corgi details</CardTitle>
          <CardDescription>
            Used on the dashboard header and to compute age.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthDate">Birth date</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meal schedule</CardTitle>
          <CardDescription>
            Times your corgi normally eats. Today view turns each slot into a
            one-click "log at scheduled time" button until you mark it eaten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {meals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No meals scheduled — add one below.
            </p>
          ) : (
            meals.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  value={m}
                  onChange={(e) => updateSlot(i, e.target.value)}
                  className="w-32"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSlot(i)}
                  aria-label="Remove meal slot"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          <Button variant="outline" size="sm" onClick={addSlot}>
            <Plus className="mr-1 h-4 w-4" />
            Add meal time
          </Button>
        </CardContent>
      </Card>

      <Button onClick={save}>Save changes</Button>
    </div>
  );
}
