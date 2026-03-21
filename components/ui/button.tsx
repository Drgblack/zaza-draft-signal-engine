import * as React from "react";

import { cn } from "@/lib/utils";

const variantClasses = {
  primary: "bg-[color:var(--accent)] text-white shadow-[0_10px_24px_rgba(31,77,61,0.16)] hover:bg-[#173d31]",
  secondary: "bg-white/92 text-slate-900 ring-1 ring-black/6 hover:bg-white",
  ghost: "text-slate-800 hover:bg-slate-900/5",
} as const;

const sizeClasses = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
} as const;

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={buttonVariants({ variant, size, className })} {...props} />
  ),
);

Button.displayName = "Button";
