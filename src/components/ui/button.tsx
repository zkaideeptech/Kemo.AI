import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[inset_0_0.5px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(249,115,22,0.2)] hover:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.4),0_8px_24px_rgba(249,115,22,0.25)] hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98]",
        secondary: "border border-border bg-white/40 dark:bg-white/5 backdrop-blur-2xl shadow-[inset_0_0.5px_0_rgba(255,255,255,0.5),0_4px_12px_rgba(0,0,0,0.05)] hover:bg-white/55 dark:hover:bg-white/10 hover:-translate-y-0.5",
        ghost: "hover:bg-black/[0.03] dark:hover:bg-white/[0.06] hover:backdrop-blur-xl",
        destructive: "bg-destructive text-destructive-foreground shadow-[inset_0_0.5px_0_rgba(255,255,255,0.2),0_4px_16px_rgba(255,59,48,0.2)] hover:shadow-[0_8px_24px_rgba(255,59,48,0.25)] hover:-translate-y-0.5",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

