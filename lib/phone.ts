/**
 * Philippine mobile numbers. Accepts 09XXXXXXXXX, 9XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX,
 * with spaces/dashes. Normalizes to 09XXXXXXXXX. Returns null if invalid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let local: string;
  if (digits.length === 12 && digits.startsWith("639")) local = "0" + digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("09")) local = digits;
  else if (digits.length === 10 && digits.startsWith("9")) local = "0" + digits;
  else return null;
  return /^09\d{9}$/.test(local) ? local : null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** "0917 123 4567" for display */
export function formatPhone(phone: string): string {
  const p = normalizePhone(phone) ?? phone;
  return p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}

/** The hidden auth email. Never show this in the UI. */
export function phoneToAuthEmail(normalizedPhone: string): string {
  return `${normalizedPhone}@members.gym.local`;
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}
