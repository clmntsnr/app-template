// Dashboard route. Stitches together:
//   - reactive TanStack DB queries via `useLiveQuery`
//   - date-fns for day bucketing
//   - shadcn Chart (ChartContainer/ChartTooltip) wrapping recharts primitives
//
// Aggregation happens in-memory on the client. With localStorage you'll never
// have enough rows for that to matter; against a real backend you'd push the
// math server-side or into a `.groupBy(...)` live query.

import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
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
import { differenceInYears, format, startOfDay, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import { eventsCollection, hasDuration, profileCollection } from "../db";

export const Route = createFileRoute("/")({
  component: DashboardComponent,
});

// How many days the charts cover. Seven is a sweet spot — enough to see a
// pattern, few enough to fit on one screen.
const WINDOW_DAYS = 7;

// One row per day in the chart data. All metrics live on the same row so a
// single pass over events populates everything.
type DayBucket = {
  date: Date;
  label: string;
  naps: number;
  napMinutes: number;
  outside: number;
  outsideMinutes: number;
  poops: number;
  pees: number;
  meals: number;
};

function DashboardComponent() {
  const { queryClient } = Route.useRouteContext();

  // `useMemo` ensures the collection is created once per queryClient instead
  // of rebuilt every render (which would tear down the live query).
  const events = useMemo(() => eventsCollection(queryClient), [queryClient]);
  const profile = useMemo(() => profileCollection(queryClient), [queryClient]);

  const { data: allEvents = [] } = useLiveQuery((q) =>
    q.from({ e: events }).orderBy(({ e }) => e.startedAt),
  );
  const { data: profileRows = [] } = useLiveQuery((q) => q.from({ p: profile }));
  const corgi = profileRows[0];

  const stats = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    // Pre-build day buckets so zero-event days still appear on the x-axis.
    const buckets: DayBucket[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = subDays(new Date(today), WINDOW_DAYS - 1 - i);
      return {
        date: d,
        label: format(d, "EEE"),
        naps: 0,
        napMinutes: 0,
        outside: 0,
        outsideMinutes: 0,
        poops: 0,
        pees: 0,
        meals: 0,
      };
    });
    const indexByDay = new Map(buckets.map((b, i) => [b.date.getTime(), i]));

    // Today-only counters drive the stat cards.
    const todayStats = {
      naps: 0,
      napMinutes: 0,
      outside: 0,
      outsideMinutes: 0,
      poops: 0,
      pees: 0,
      meals: 0,
    };
    let activeNap: (typeof allEvents)[number] | null = null;
    let activeOutside: (typeof allEvents)[number] | null = null;

    for (const ev of allEvents) {
      const dayStart = startOfDay(new Date(ev.startedAt)).getTime();
      const idx = indexByDay.get(dayStart);
      const bucket = idx !== undefined ? buckets[idx] : undefined;
      const isToday = dayStart === today;
      // For duration events with a close timestamp, minutes contribute to
      // whichever day they started on — simpler than splitting across midnight
      // and accurate enough for daily totals.
      const minutes =
        hasDuration(ev.type) && ev.endedAt
          ? Math.round((ev.endedAt - ev.startedAt) / 60000)
          : 0;

      switch (ev.type) {
        case "nap":
          if (bucket) {
            bucket.naps += 1;
            bucket.napMinutes += minutes;
          }
          if (isToday) {
            todayStats.naps += 1;
            todayStats.napMinutes += minutes;
          }
          if (!ev.endedAt) activeNap = ev;
          break;
        case "outside":
          if (bucket) {
            bucket.outside += 1;
            bucket.outsideMinutes += minutes;
          }
          if (isToday) {
            todayStats.outside += 1;
            todayStats.outsideMinutes += minutes;
          }
          if (!ev.endedAt) activeOutside = ev;
          break;
        case "poop":
          if (bucket) bucket.poops += 1;
          if (isToday) todayStats.poops += 1;
          break;
        case "pee":
          if (bucket) bucket.pees += 1;
          if (isToday) todayStats.pees += 1;
          break;
        case "meal":
          if (bucket) bucket.meals += 1;
          if (isToday) todayStats.meals += 1;
          break;
      }
    }

    return { buckets, today: todayStats, activeNap, activeOutside };
  }, [allEvents]);

  // Chart configs drive legend/tooltip labels and the CSS variable name used
  // for stroke/fill (shadcn maps `--color-foo` from the entry below).
  const napOutsideConfig: ChartConfig = {
    napMinutes: { label: "Nap min", color: "hsl(221, 83%, 53%)" },
    outsideMinutes: { label: "Outside min", color: "hsl(142, 71%, 45%)" },
  };
  const bathroomConfig: ChartConfig = {
    poops: { label: "Poops", color: "hsl(28, 80%, 52%)" },
    pees: { label: "Pees", color: "hsl(199, 89%, 48%)" },
    meals: { label: "Meals", color: "hsl(340, 75%, 55%)" },
  };

  const ageYears = corgi ? differenceInYears(new Date(), new Date(corgi.birthDate)) : 0;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold">
          {corgi ? corgi.name : "Your corgi"}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {corgi ? `${ageYears} years old` : ""}
          </span>
        </h1>
        <p className="text-muted-foreground">
          Tracking naps, outside trips, meals, and bathroom breaks. Add events
          on{" "}
          <a className="underline" href="/log">
            /log
          </a>{" "}
          — including ones from earlier in the day.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          title="Naps today"
          value={stats.today.naps}
          hint={stats.activeNap ? "1 nap in progress" : undefined}
        />
        <StatCard title="Nap minutes" value={stats.today.napMinutes} />
        <StatCard
          title="Outside trips"
          value={stats.today.outside}
          hint={stats.activeOutside ? "out right now" : undefined}
        />
        <StatCard title="Pees / poops" value={`${stats.today.pees} / ${stats.today.poops}`} />
        <StatCard title="Meals" value={stats.today.meals} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Rest vs. activity — last 7 days</CardTitle>
          <CardDescription>
            Minutes napping vs. minutes outside per day. A high ratio of nap
            time with little outside time is the metabolism signal worth
            watching.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={napOutsideConfig} className="h-64 w-full">
            <BarChart data={stats.buckets}>
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
            Daily counts. Watch the gap between meals and bathroom counts —
            sudden divergence is usually the first sign something's off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={bathroomConfig} className="h-64 w-full">
            <LineChart data={stats.buckets}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="poops" stroke="var(--color-poops)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="pees" stroke="var(--color-pees)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="meals" stroke="var(--color-meals)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}
