// Shell halaman auth — kartu tengah + tint brand (gaya hero design guideline)
import { Brand } from "./brand";
import { cn } from "@/lib/utils";

export function AuthShell({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(900px 400px at 85% -10%, rgba(139,47,242,0.10), transparent 60%), #F4F4F7",
      }}
    >
      <div className="w-full max-w-[420px]">
        <div
          className={cn(
            "rounded-xl border border-line bg-surface p-8 shadow-lg",
            className,
          )}
        >
          <Brand subtitle="Keep You Inline" className="mb-7" />
          <h1 className="mb-1.5 text-[42px] font-extrabold tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mb-6 text-sm leading-relaxed text-ink-500">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function ErrorBox({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-4 rounded-md bg-pri-highbg px-3.5 py-2.5 text-[13px] font-semibold text-pri-high">
      {children}
    </div>
  );
}

export function SuccessBox({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-4 rounded-md bg-pri-lowbg px-3.5 py-2.5 text-[13px] font-semibold text-pri-low">
      {children}
    </div>
  );
}
