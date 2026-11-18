"use client";

import { normalizePhone } from "./phone";
import { getMemberStatus, STATUS_PRIORITY, type StatusInfo } from "./status";
import { createClient } from "./supabase/client";
import type { Membership, MemberStatusRow, WalkIn } from "./types";
import { manilaStartOf, todayManila } from "./dates";

export type MemberRow = Pick<
  MemberStatusRow,
  "id" | "full_name" | "phone" | "photo_url" | "is_active" | "created_at" | "current_plan" | "end_date" | "role"
> & { info: StatusInfo };

/** Shown in the member list / counts: all members, plus staff who also have a membership.
 *  (Staff with no membership are front desk only and live on the Team page.) */
export const isListed = (m: Pick<MemberRow, "role" | "end_date">) => m.role === "member" || !!m.end_date;

const LIST_COLUMNS = "id, full_name, phone, photo_url, is_active, created_at, current_plan, end_date, role";

export async function fetchMembers(): Promise<MemberRow[]> {
  const { data, error } = await createClient()
    .from("member_status")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r as Omit<MemberRow, "info">), info: getMemberStatus(r.end_date) }));
}

/** IDs of members clocked in right now (today's visits with no clock-out). */
export async function fetchInGymIds(): Promise<Set<string>> {
  const { data, error } = await createClient()
    .from("attendance")
    .select("profile_id")
    .is("clock_out", null)
    .gte("clock_in", manilaStartOf(todayManila()));
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.profile_id as string));
}

export async function fetchHistory(profileId: string): Promise<Membership[]> {
  const { data, error } = await createClient()
    .from("memberships")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Membership[];
}

/** expired → expiring → active, then by end date (soonest first). */
export function sortByStatus(a: MemberRow, b: MemberRow): number {
  const p = STATUS_PRIORITY[a.info.status] - STATUS_PRIORITY[b.info.status];
  if (p !== 0) return p;
  return (a.end_date ?? "").localeCompare(b.end_date ?? "");
}

/** Matches name (any part, case-insensitive) or phone (any digits, any format). */
export function matchesSearch(m: MemberRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (m.full_name.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) {
    const asLocal = normalizePhone(q) ?? digits.replace(/^63/, "0");
    return m.phone.includes(digits) || m.phone.includes(asLocal);
  }
  return false;
}

export async function fetchWalkInsSince(sinceYmd: string): Promise<WalkIn[]> {
  const { data, error } = await createClient()
    .from("walk_ins")
    .select("*")
    .gte("created_at", manilaStartOf(sinceYmd))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((w) => ({ ...w, amount: Number(w.amount) })) as WalkIn[];
}

export async function fetchMembershipsSince(sinceYmd: string): Promise<Pick<Membership, "amount" | "created_at">[]> {
  const { data, error } = await createClient()
    .from("memberships")
    .select("amount, created_at")
    .gte("created_at", manilaStartOf(sinceYmd));
  if (error) throw error;
  return (data ?? []).map((m) => ({ ...m, amount: m.amount == null ? null : Number(m.amount) }));
}

export const sumAmounts = (rows: { amount: number | null }[]) => rows.reduce((t, r) => t + (r.amount ?? 0), 0);
