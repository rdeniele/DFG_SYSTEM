/** Small "Built by Acqron" credit for the login and register pages. */
export function BuiltBy() {
  return (
    <footer className="mx-auto w-full max-w-md px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
      <a
        href="https://www.acqron.com/"
        target="_blank"
        rel="noopener"
        className="group mx-auto flex w-fit items-center gap-2.5 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm transition-colors active:bg-gray-50 hover:border-orange-300"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo */}
        <img src="/brand/acqron-logo.png" alt="" width={18} height={19} className="h-[19px] w-auto" />
        <span className="text-sm text-gray-500">
          Built by{" "}
          <span className="bg-gradient-to-r from-[#e44d3a] to-[#f5b800] bg-clip-text font-bold text-transparent">
            Acqron
          </span>
        </span>
      </a>
    </footer>
  );
}
