/** Plan durations and prices (PHP). Change here and the whole app follows. */
export const PLANS = {
  weekly: { label: "Weekly", days: 7, price: 0 },
  half_month: { label: "Half-month", days: 15, price: 0 },
  monthly: { label: "Monthly", days: 30, price: 0 },
} as const;

export const WALK_IN_PRICE = 0;
export const EXPIRING_SOON_DAYS = 3;

export type PlanKey = keyof typeof PLANS;
/** `manual` = admin picked the end date by hand (whiteboard copy or correction). */
export type MembershipPlan = PlanKey | "manual";

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

export function planLabel(plan: MembershipPlan | string | null | undefined): string {
  if (!plan) return "—";
  if (plan === "manual") return "Manual date";
  return PLANS[plan as PlanKey]?.label ?? plan;
}

export function formatPeso(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}
