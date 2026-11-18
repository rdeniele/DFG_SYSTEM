import type { Metadata } from "next";
import { CheckinClient } from "./CheckinClient";

export const metadata: Metadata = { title: "Clock in / out" };

export default function CheckinPage() {
  return <CheckinClient />;
}
