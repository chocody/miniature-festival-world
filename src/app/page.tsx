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
    <main className="flex w-full flex-1 flex-col">
      <Suspense fallback={null}>
        <ActiveEventEntry />
      </Suspense>
    </main>
  );
}
