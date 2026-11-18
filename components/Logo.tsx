import { THEME } from "@/lib/theme";

/** The round DFG logo (white circle). Looks best on the black brand color. */
export function Logo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized PNG, no optimizer needed
    <img
      src={THEME.logo}
      alt={`${THEME.gymName} logo`}
      width={size}
      height={size}
      className={`shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
