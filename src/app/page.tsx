import { io } from "next/cache";
import { Suspense } from "react";
import { ActiveEventView } from "@/components/ui/ActiveEventView";
import { resolveServerActiveEvent } from "@/services/api/activeEvent";

const resolveNow = () => resolveServerActiveEvent(Date.now());

/** Resolved per request on the server clock, never at build time (MFW-53). */
async function ActiveEventEntry() {
  await io();
  return <ActiveEventView resolution={resolveNow()} />;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-8 sm:py-16">
      <Suspense fallback={null}>
        <ActiveEventEntry />
      </Suspense>
    </main>
  );
}
