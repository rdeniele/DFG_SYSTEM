"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

export const AttendanceClient = dynamic(() => import("./AttendanceView"), {
  ssr: false,
  loading: () => (
    <main className="flex flex-1 items-center justify-center py-20">
      <Spinner className="h-10 w-10 text-brand" />
    </main>
  ),
});
