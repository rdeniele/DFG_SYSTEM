import type { Metadata } from "next";
import { QrClient } from "./QrClient";

export const metadata: Metadata = { title: "Clock-in QR" };

export default function QrPage() {
  return <QrClient />;
}
