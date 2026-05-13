// Shared add/edit dialog. Used by /log (any event) and / (click a
// span/dot on the timeline). Caller controls `target`:
//   - null     → dialog closed
//   - "new"    → blank form, "Add entry"
//   - {…event} → edit that event in place, "Edit entry"
//
// Two libraries do the heavy lifting:
//
//   - **TanStack Form** owns the form state and submission flow. Each field
//     is a `<form.Field>` with its own typed value; the parent doesn't
//     manage individual useState pairs. We pass `defaultValues` keyed off
//     the target so re-opening on a different event seeds the form
//     correctly (combined with the `key` prop in the caller so the form
//     itself remounts).
//   - **shadcn Popover + Calendar** replace the browser-native
//     `<input type="datetime-local">`. The picker is one button that opens a
//     month grid plus a time field — visually consistent with the rest of
//     the dialog and theme-aware.

import { Button } from "@package-ui/shadcn/components/button";
import { Calendar } from "@package-ui/shadcn/components/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@package-ui/shadcn/components/dialog";
import { Input } from "@package-ui/shadcn/components/input";
import { Label } from "@package-ui/shadcn/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@package-ui/shadcn/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@package-ui/shadcn/components/select";
import { Textarea } from "@package-ui/shadcn/components/textarea";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { type CorgiEvent, EVENT_KINDS, type EventKind, hasDuration, KIND_LABELS } from "../db";

export type EventDialogTarget = CorgiEvent | "new" | null;

type FormValues = {
  type: EventKind;
  startedAt: number;
  // null = "no end yet" for duration events; the dialog presents this as
  // an "Ongoing" toggle on the end picker.
  endedAt: number | null;
  notes: string;
};

export function EventDialog({
  target,
  onClose,
  onSave,
  seed,
}: {
  target: EventDialogTarget;
  onClose: () => void;
  onSave: (e: CorgiEvent) => void;
  // Optional seed for "new" mode — used when the caller wants the dialog
  // pre-filled to a specific time/type (e.g., "log meal at 18:00").
  seed?: Partial<CorgiEvent>;
}) {
  const isNew = target === "new";

  // Build the seed values up front so TanStack Form's `defaultValues` is
  // referentially stable for the lifetime of this mount. The caller is
  // expected to remount via `key` when the target changes (cheaper than
  // wiring effects to re-sync state).
  const initial: FormValues =
    !target || isNew
      ? {
          type: seed?.type ?? "nap",
          startedAt: seed?.startedAt ?? Date.now(),
          endedAt: seed?.endedAt ?? null,
          notes: seed?.notes ?? "",
        }
      : {
          type: target.type,
          startedAt: target.startedAt,
          endedAt: target.endedAt,
          notes: target.notes ?? "",
        };
  // Keep the row id so update paths can match by it. Not part of the form
  // state because there's no UI to edit it.
  const id = !target || isNew ? (seed?.id ?? Date.now()) : target.id;

  const form = useForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      const end = hasDuration(value.type) ? value.endedAt : null;
      // Refuse end-before-start — easy mistake with the picker.
      if (end !== null && end < value.startedAt) return;
      onSave({
        id,
        type: value.type,
        startedAt: value.startedAt,
        endedAt: end,
        notes: value.notes.trim() || undefined,
      });
    },
  });

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add entry" : "Edit entry"}</DialogTitle>
          <DialogDescription>
            {isNew ? "Log an event — from now or from earlier." : "Adjust time, type, or notes."}
          </DialogDescription>
        </DialogHeader>

        {/* Native <form> + form.handleSubmit() so Enter submits and the
            browser's accessibility plumbing (labels, focus) works as
            usual. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="type">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as EventKind)}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          {/* We subscribe to `type` here so the end picker only renders for
              duration events. `form.Subscribe` re-renders only this slice
              when type changes — the rest of the form keeps its state. */}
          <form.Subscribe selector={(s) => s.values.type}>
            {(type) => (
              <>
                <form.Field name="startedAt">
                  {(field) => (
                    <div className="space-y-2">
                      <Label>{hasDuration(type) ? "Started at" : "When"}</Label>
                      <DateTimePicker
                        value={field.state.value}
                        onChange={(v) => field.handleChange(v ?? Date.now())}
                      />
                    </div>
                  )}
                </form.Field>

                {hasDuration(type) && (
                  <form.Field name="endedAt">
                    {(field) => (
                      <div className="space-y-2">
                        <Label>Ended at</Label>
                        <DateTimePicker
                          value={field.state.value}
                          onChange={(v) => field.handleChange(v)}
                          // Duration events can stay open while in progress
                          // — clearing returns null so we don't fabricate
                          // an end time.
                          allowClear
                          clearLabel="Mark ongoing"
                          placeholder="Ongoing (no end yet)"
                        />
                      </div>
                    )}
                  </form.Field>
                )}
              </>
            )}
          </form.Subscribe>

          <form.Field name="notes">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. ate half a carrot, threw up on the rug"
                  rows={2}
                />
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── DateTimePicker ────────────────────────────────────────────────────────
//
// A small composition of shadcn Popover + Calendar + time Input. The trigger
// is a plain Button showing the currently-selected value so the field reads
// like the rest of the shadcn UI.

function DateTimePicker({
  value,
  onChange,
  allowClear,
  clearLabel = "Clear",
  placeholder = "Pick a date and time",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  allowClear?: boolean;
  clearLabel?: string;
  placeholder?: string;
}) {
  const date = value ? new Date(value) : undefined;
  const timeStr = value ? format(value, "HH:mm") : "";

  // Combine a Date (from Calendar) with an HH:mm string (from <input
  // type=time>) into a single epoch-ms value. Re-uses the current hour/min
  // when the date changes so picking a new day doesn't reset the time.
  const setDay = (d: Date | undefined) => {
    if (!d) return;
    const base = value ? new Date(value) : new Date();
    const merged = new Date(d);
    merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(merged.getTime());
  };
  const setTime = (t: string) => {
    if (!t) return;
    const [h, m] = t.split(":").map(Number);
    const base = value ? new Date(value) : new Date();
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    onChange(base.getTime());
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(value, "EEE MMM d, HH:mm")
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={setDay} />
        <div className="flex items-center gap-2 border-t p-3">
          <Label htmlFor="time" className="text-xs text-muted-foreground">
            Time
          </Label>
          <Input
            id="time"
            type="time"
            value={timeStr}
            onChange={(e) => setTime(e.target.value)}
            className="w-32"
          />
          {allowClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => onChange(null)}
            >
              {clearLabel}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
