import { EXPIRING_SOON_DAYS, PLANS, type MembershipPlan } from "./plans";
import { addDays, daysBetween, formatDate, todayManila } from "./dates";

export type MemberStatus = "pending" | "active" | "expiring" | "expired";

export interface StatusInfo {
  status: MemberStatus;
  /** Days left including today (end date is inclusive). null when pending. */
  daysLeft: number | null;
  endDate: string | null;
}

/**
 * THE status rule. Used everywhere (mirrors the `member_status` SQL view).
 * - no membership        → pending
 * - end_date < today     → expired
 * - end_date − today ≤ N → expiring
 * - else                 → active
 */
export function getMemberStatus(
  latestEndDate: string | null | undefined,
  today: string = todayManila(),
): StatusInfo {
  if (!latestEndDate) return { status: "pending", daysLeft: null, endDate: null };
  const end = latestEndDate.slice(0, 10);
  const diff = daysBetween(today, end);
  if (diff < 0) return { status: "expired", daysLeft: 0, endDate: end };
  if (diff <= EXPIRING_SOON_DAYS) return { status: "expiring", daysLeft: diff, endDate: end };
  return { status: "active", daysLeft: diff, endDate: end };
}

/** Sort order for admin lists: expired → expiring → active → pending. */
export const STATUS_PRIORITY: Record<MemberStatus, number> = {
  expired: 0,
  expiring: 1,
  active: 2,
  pending: 3,
};

export const STATUS_META: Record<
  MemberStatus,
  { label: string; emoji: string; dot: string; card: string; text: string }
> = {
  pending: {
    label: "PENDING",
    emoji: "⏳",
    dot: "bg-gray-400",
    card: "bg-gray-100 border-gray-300",
    text: "text-gray-800",
  },
  active: {
    label: "ACTIVE",
    emoji: "🟢",
    dot: "bg-green-500",
    card: "bg-green-50 border-green-400",
    text: "text-green-800",
  },
  expiring: {
    label: "EXPIRING SOON",
    emoji: "🟡",
    dot: "bg-yellow-400",
    card: "bg-yellow-50 border-yellow-400",
    text: "text-yellow-800",
  },
  expired: {
    label: "EXPIRED",
    emoji: "🔴",
    dot: "bg-red-500",
    card: "bg-red-50 border-red-400",
    text: "text-red-800",
  },
};

/** One-line human description, e.g. "Until Nov 30, 2026 · 12 days left". */
export function describeStatus(info: StatusInfo): string {
  switch (info.status) {
    case "pending":
      return "Approach the front desk to activate your membership.";
    case "expired":
      return `Expired on ${formatDate(info.endDate)}`;
    case "expiring":
      return info.daysLeft === 0
        ? `Last day today · ${formatDate(info.endDate)}`
        : `${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"} left · until ${formatDate(info.endDate)}`;
    case "active":
      return `Until ${formatDate(info.endDate)} · ${info.daysLeft} days left`;
  }
}

/**
 * Renewal rule. Active/expiring members keep their days: the new period starts the day
 * after their current end date. Expired/pending members start today.
 * end_date is inclusive, so a 7-day plan starting today ends today + 6.
 */
export function computeRenewal(
  plan: Exclude<MembershipPlan, "manual">,
  currentEndDate: string | null | undefined,
  today: string = todayManila(),
): { startDate: string; endDate: string } {
  const { status } = getMemberStatus(currentEndDate, today);
  const startDate =
    status === "active" || status === "expiring" ? addDays(currentEndDate!.slice(0, 10), 1) : today;
  return { startDate, endDate: addDays(startDate, PLANS[plan].days - 1) };
}
