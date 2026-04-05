import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-11 items-center justify-center rounded-2xl bg-white/25 dark:bg-white/[0.04] backdrop-blur-xl border-[0.5px] border-white/30 dark:border-white/[0.08] p-1 text-muted-foreground shadow-[inset_0_0.5px_0_rgba(255,255,255,0.4)]  dark:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.06)]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] data-[state=active]:bg-white/60 dark:data-[state=active]:bg-white/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_0.5px_0_rgba(255,255,255,0.5),0_2px_8px_rgba(0,0,0,0.06)] data-[state=active]:backdrop-blur-xl hover:text-foreground/80",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

