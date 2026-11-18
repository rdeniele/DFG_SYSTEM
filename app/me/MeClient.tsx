"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

// Browser-only: the status page reads the saved (offline) status from localStorage.
export const MeClient = dynamic(() => import("./MeView"), {
  ssr: false,
  loading: () => (
    <main className="flex flex-1 items-center justify-center py-20">
      <Spinner className="h-10 w-10 text-brand" />
    </main>
  ),
});
