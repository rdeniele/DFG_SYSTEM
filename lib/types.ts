import type { MembershipPlan } from "./plans";

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  photo_url: string | null;
  role: "member" | "admin";
  is_active: boolean;
  created_at: string;
}

export interface Membership {
  id: string;
  profile_id: string;
  plan: MembershipPlan;
  start_date: string;
  end_date: string;
  amount: number | null;
  created_by: string | null;
  created_at: string;
}

/** Row of the `member_status` view. */
export interface MemberStatusRow extends Profile {
  current_plan: MembershipPlan | null;
  start_date: string | null;
  end_date: string | null;
  last_amount: number | null;
  last_renewed_at: string | null;
  status: "pending" | "active" | "expiring" | "expired";
  days_left: number | null;
  status_priority: number;
}

export interface WalkIn {
  id: string;
  name: string;
  amount: number;
  created_by: string | null;
  created_at: string;
}
