// /trends — same hero as the home page, plus a 7-day rest-vs-activity bar
// chart and a 7-day bathroom/meal counts line chart.
//
// Stack:
//   - shadcn Chart wrapping recharts (§ UI › shadcn) — never import recharts
//     wiring (Container, Tooltip, Legend) directly; always go through the
//     shadcn wrappers so theming and CSS-var tokens stay centralized.
//   - date-fns for day bucketing.

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@package-ui/shadcn/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@package-ui/shadcn/components/chart";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { format, startOfDay, subDays } from "date-fns";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Hero } from "../components/hero";
import { eventsCollection, hasDuration, profileCollection } from "../db";

export const Route = createFileRoute("/trends")({
  component: TrendsComponent,
});

const WINDOW_DAYS = 7;

type DayBucket = {
  label: string;
  napMinutes: number;
  outsideMinutes: number;
  poops: number;
  pees: number;
  meals: number;
};

function TrendsComponent() {
  const { queryClient } = Route.useRouteContext();
  const events = useMemo(() => eventsCollection(queryClient), [queryClient]);
  const profile = useMemo(() => profileCollection(queryClient), [queryClient]);

  const { data: allEvents = [] } = useLiveQuery((q) =>
    q.from({ e: events }).orderBy(({ e }) => e.startedAt),
  );
  const { data: profileRows = [] } = useLiveQuery((q) => q.from({ p: profile }));
  const corgi = profileRows[0];

  const buckets = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const out: (DayBucket & { ts: number })[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = subDays(new Date(today), WINDOW_DAYS - 1 - i);
      return {
        ts: d.getTime(),
        label: format(d, "EEE"),
        napMinutes: 0,
        outsideMinutes: 0,
        poops: 0,
        pees: 0,
        meals: 0,
      };
    });
    const indexByDay = new Map(out.map((b, i) => [b.ts, i]));
    for (const ev of allEvents) {
      const dayStart = startOfDay(new Date(ev.startedAt)).getTime();
      const idx = indexByDay.get(dayStart);
      const bucket = idx !== undefined ? out[idx] : undefined;
      if (!bucket) continue;
      if (hasDuration(ev.type) && ev.endedAt) {
        const minutes = Math.round((ev.endedAt - ev.startedAt) / 60000);
        if (ev.type === "nap") bucket.napMinutes += minutes;
        if (ev.type === "outside") bucket.outsideMinutes += minutes;
      } else if (ev.type === "poop") bucket.poops += 1;
      else if (ev.type === "pee") bucket.pees += 1;
      else if (ev.type === "meal") bucket.meals += 1;
    }
    return out.map(({ ts: _ts, ...rest }) => rest);
  }, [allEvents]);

  const napOutsideConfig: ChartConfig = {
    napMinutes: { label: "Nap min", color: "hsl(262, 70%, 60%)" },
    outsideMinutes: { label: "Outside min", color: "hsl(142, 71%, 45%)" },
  };
  const bathroomConfig: ChartConfig = {
    poops: { label: "Poops", color: "hsl(28, 80%, 52%)" },
    pees: { label: "Pees", color: "hsl(199, 89%, 48%)" },
    meals: { label: "Meals", color: "hsl(340, 75%, 55%)" },
  };

  return (
    <div className="space-y-6">
      <Hero corgi={corgi} events={allEvents} />

      <Card>
        <CardHeader>
          <CardTitle>Rest vs. activity — last 7 days</CardTitle>
          <CardDescription>
            Minutes napping vs. minutes outside per day. A high ratio of nap time with little
            outside time is the metabolism signal worth watching.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={napOutsideConfig} className="h-56 w-full sm:h-64">
            <BarChart data={buckets}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="napMinutes" fill="var(--color-napMinutes)" radius={4} />
              <Bar dataKey="outsideMinutes" fill="var(--color-outsideMinutes)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bathroom & meals — last 7 days</CardTitle>
          <CardDescription>
            Daily counts. Watch the gap between meals and bathroom counts — sudden divergence is
            usually the first sign something's off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={bathroomConfig} className="h-56 w-full sm:h-64">
            <LineChart data={buckets}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="poops"
                stroke="var(--color-poops)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="pees"
                stroke="var(--color-pees)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="meals"
                stroke="var(--color-meals)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
