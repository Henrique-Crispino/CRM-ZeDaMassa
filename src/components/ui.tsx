import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">{title}</h1>
      {hint ? <p className="mt-2 max-w-2xl text-lg leading-relaxed text-stone-600">{hint}</p> : null}
    </header>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200", className)}>
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
}) {
  const styles = {
    primary: "bg-orange-600 text-white hover:bg-orange-700",
    secondary: "bg-stone-900 text-white hover:bg-stone-800",
    ghost: "bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    soft: "bg-orange-50 text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100",
  }[variant];

  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-14 sm:px-5 sm:text-lg",
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-base font-bold text-stone-800">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-sm leading-relaxed text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div
      role="group"
      className="grid gap-2 rounded-3xl bg-stone-100 p-1.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={value === option.id ? "primary" : "ghost"}
          aria-pressed={value === option.id}
          className={cn("min-h-12", value !== option.id && "bg-transparent ring-0")}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-lg text-stone-900 outline-none ring-orange-500 placeholder:text-stone-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, props.className)} {...props} />;
}

export function Select(props: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(inputClass, "appearance-none", props.className)} {...props}>
      {props.children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-28", props.className)} {...props} />;
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="py-12 text-center">
      <p className="text-2xl font-extrabold text-stone-900">{title}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-lg text-stone-600">{hint}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl bg-red-50 px-4 py-3 text-base font-semibold text-red-700 ring-1 ring-red-200">
      {message}
    </p>
  );
}

export function SuccessBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-800 ring-1 ring-emerald-200">
      {message}
    </p>
  );
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "md" | "sm";
}) {
  const compact = size === "sm";
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        className={compact ? "h-11 w-11 min-h-11 px-0 text-xl" : "h-14 w-14 min-h-14 px-0 text-2xl"}
        aria-label="Diminuir"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </Button>
      <input
        inputMode="numeric"
        aria-label="Quantidade"
        className={
          compact
            ? "h-11 w-14 rounded-xl border border-stone-300 text-center text-lg font-extrabold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
            : "h-14 w-20 rounded-2xl border border-stone-300 text-center text-xl font-extrabold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
        }
        value={value || ""}
        placeholder="0"
        onChange={(event) => {
          const next = Number(event.target.value.replace(/\D/g, ""));
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
      />
      <Button
        type="button"
        variant="ghost"
        className={compact ? "h-11 w-11 min-h-11 px-0 text-xl" : "h-14 w-14 min-h-14 px-0 text-2xl"}
        aria-label="Aumentar"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </Button>
    </div>
  );
}
