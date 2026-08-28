import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Agensync</h1>
      <p className="text-sm text-muted-foreground">
        Phase 1 foundation — dashboard not built yet.
      </p>
      <Button>shadcn/ui is wired up</Button>
    </main>
  );
}
