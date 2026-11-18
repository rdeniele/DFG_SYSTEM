import type { Metadata } from "next";
import { MeClient } from "./MeClient";

export const metadata: Metadata = { title: "My membership" };

export default function MePage() {
  return <MeClient />;
}
