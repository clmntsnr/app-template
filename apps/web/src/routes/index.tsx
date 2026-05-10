import { Button } from "@package-ui/shadcn/components/button";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <h1 className="text-4xl font-bold">Hello, World</h1>
      <p className="text-muted-foreground">apps/web · TanStack Start + shadcn</p>
      <Button onClick={() => alert("Hello from shadcn Button")}>Click me</Button>
    </main>
  );
}
