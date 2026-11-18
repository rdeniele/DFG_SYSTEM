import { Logo } from "@/components/Logo";
import { THEME } from "@/lib/theme";
import { Landing } from "./Landing";

// Logged-in visitors never see this: the proxy sends them to /me or /admin.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="bg-ink px-5 pb-10 pt-12 text-center text-white">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <Logo size={128} className="shadow-[0_0_0_6px_rgba(255,255,255,0.08)]" />
          <h1 className="text-3xl font-black tracking-tight">{THEME.gymName}</h1>
          <p className="text-lg text-gray-300">{THEME.tagline}</p>
          <span aria-hidden className="mt-1 h-1.5 w-16 rounded-full bg-brand" />
        </div>
      </section>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
        <Landing />
      </main>
    </div>
  );
}
