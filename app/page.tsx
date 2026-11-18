import { THEME } from "@/lib/theme";
import { Landing } from "./Landing";

// Logged-in visitors never see this: the proxy sends them to /me or /admin.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        {/* Logo placeholder: swap for an <img src="/icons/logo.png"> when you have one */}
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand text-3xl font-black text-white shadow-lg">
          {THEME.shortName}
        </div>
        <h1 className="text-3xl font-bold">{THEME.gymName}</h1>
        <p className="text-xl text-gray-600">{THEME.tagline}</p>
      </div>
      <Landing />
    </main>
  );
}
