import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[120px] w-full rounded-2xl border border-black/8 bg-white/94 px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]",
        className,
        props.disabled && "cursor-not-allowed opacity-70",
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
