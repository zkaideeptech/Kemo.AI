import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-[14px] font-[500] transition-all duration-200 focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-[#0072f5] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#171717] text-white hover:bg-[#000000] active:scale-[0.98]",
        secondary: "bg-white text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] hover:bg-[#fafafa] dark:bg-[#171717] dark:text-white dark:shadow-[0_0_0_1px_rgba(255,255,255,0.14)] active:scale-[0.98]",
        ghost: "hover:bg-[#ebebeb] dark:hover:bg-white/10 active:scale-[0.98]",
        destructive: "bg-[#ff5b4f] text-white shadow-sm hover:opacity-90 active:scale-[0.98]",
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

