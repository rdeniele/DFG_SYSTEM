import { formatDate } from "@/lib/dates";
import { describeStatus, STATUS_META, type MemberStatus, type StatusInfo } from "@/lib/status";

/** Small colored dot + text label. Color is never the only signal. */
export function StatusBadge({ status, size = "md" }: { status: MemberStatus; size?: "sm" | "md" }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${meta.card} ${meta.text} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function StatusDot({ status }: { status: MemberStatus }) {
  return (
    <span
      role="img"
      aria-label={STATUS_META[status].label}
      title={STATUS_META[status].label}
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${STATUS_META[status].dot}`}
    />
  );
}

/** The big card on the member's screen. */
export function StatusCard({ info }: { info: StatusInfo }) {
  const meta = STATUS_META[info.status];
  const big =
    info.status === "expiring" && info.daysLeft !== null
      ? info.daysLeft === 0
        ? "Last day today"
        : `${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"} left`
      : null;

  return (
    <section
      aria-live="polite"
      className={`flex flex-col items-center gap-2 rounded-3xl border-4 px-5 py-8 text-center ${meta.card} ${meta.text}`}
    >
      <span aria-hidden className="text-6xl leading-none">
        {meta.emoji}
      </span>
      <p className="mt-2 text-3xl font-black tracking-wide">{meta.label}</p>
      {big && <p className="text-2xl font-bold">{big}</p>}
      <p className="text-lg font-medium">
        {info.status === "expiring" ? `Until ${formatDate(info.endDate)}` : describeStatus(info)}
      </p>
    </section>
  );
}
