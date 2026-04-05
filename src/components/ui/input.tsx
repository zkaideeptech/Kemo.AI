import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-2xl border-[0.5px] border-black/[0.06] dark:border-white/[0.08] bg-white/30 dark:bg-white/[0.04] backdrop-blur-xl shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/30 transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

