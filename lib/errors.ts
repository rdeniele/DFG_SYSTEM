/** Turn Supabase / network errors into simple English for members and staff. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "No internet connection. Please check your data or Wi-Fi and try again.";
  }
  const msg = (err as { message?: string } | null)?.message?.toLowerCase() ?? "";
  if (!msg) return fallback;
  if (msg.includes("invalid login credentials")) return "Wrong phone number or PIN.";
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("duplicate key"))
    return "This phone number is already registered. Please log in instead.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Too many tries. Please wait a minute and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Can't connect right now. Please try again.";
  if (msg.includes("password") && msg.includes("weak")) return "That PIN is too easy to guess. Please choose another.";
  return fallback;
}
