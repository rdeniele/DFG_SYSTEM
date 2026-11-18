"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

// Browser-only: it records the scan once, using the logged-in member's session.
export const CheckinClient = dynamic(() => import("./CheckinView"), {
  ssr: false,
  loading: () => (
    <main className="flex flex-1 items-center justify-center py-20">
      <Spinner className="h-12 w-12 text-brand" />
    </main>
  ),
});
