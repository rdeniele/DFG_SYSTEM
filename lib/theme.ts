/**
 * Branding in one place. Change these to rebrand the app.
 * The colors are mirrored as CSS variables in app/globals.css (--brand, --brand-dark, --ink).
 * Logo: public/DFG_logo.png → run `npm run icons` to rebuild app icons + public/icons/logo-256.png.
 */
export const THEME = {
  gymName: "Daryl Fitness Gym",
  shortName: "DFG",
  tagline: "Check your membership anytime.",
  logo: "/icons/logo-256.png",
  brandColor: "#d40111", // logo red: main buttons
  brandColorDark: "#a3000d", // pressed red
  inkColor: "#111111", // logo black: headers, phone status bar
  backgroundColor: "#ffffff",
} as const;
