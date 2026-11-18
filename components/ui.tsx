"use client";

import { useState, type ButtonHTMLAttributes, type ComponentProps, type InputHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white active:bg-brand-dark disabled:bg-gray-300",
  secondary: "bg-white text-gray-900 border-2 border-gray-300 active:bg-gray-100 disabled:text-gray-400",
  danger: "bg-white text-red-700 border-2 border-red-300 active:bg-red-50",
  ghost: "bg-transparent text-gray-700 underline active:bg-gray-100",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-base font-semibold text-gray-800">
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

const INPUT =
  "min-h-14 w-full rounded-2xl border-2 border-gray-300 bg-white px-4 text-xl text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none";

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

/** Phone input: numeric keypad, digits/spaces only. */
export function PhoneInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      {...props}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="09XX XXX XXXX"
      maxLength={16}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d+ ]/g, ""))}
      className={`${INPUT} tracking-wide`}
    />
  );
}

/** 6-digit PIN: numeric keypad, hidden by default with a Show button. */
export function PinInput({
  value,
  onChange,
  autoComplete = "current-password",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={autoComplete}
        maxLength={6}
        placeholder="••••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={`${INPUT} pr-24 text-2xl tracking-[0.5em]`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-2 my-auto h-11 rounded-xl px-3 text-base font-medium text-gray-600 active:bg-gray-100"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-base font-medium text-red-800">
      {children}
    </div>
  );
}

export function Avatar({ src, name, size = 48 }: { src?: string | null; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small avatars from Supabase Storage, already compressed
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full bg-gray-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </div>
  );
}
