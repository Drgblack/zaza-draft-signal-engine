import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--panel)] shadow-[0_12px_32px_rgba(15,23,42,0.04)] backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("flex flex-col gap-2.5 px-6 py-5", className)}>{children}</div>;
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h2 className={cn("text-xl font-semibold tracking-[-0.02em] text-slate-950", className)}>{children}</h2>;
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn("text-[14px] leading-6 text-slate-600", className)}>{children}</p>;
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-6 pb-5", className)}>{children}</div>;
}
