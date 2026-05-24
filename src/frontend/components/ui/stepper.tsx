/**
 * @fileoverview Custom Stepper component for role status progression.
 *
 * Built from scratch (no external dep) following the compound component
 * pattern. Renders a horizontal step-by-step progression indicator.
 */

import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "completed" | "active" | "pending" | "terminal";

interface StepperContextValue {
  activeIndex: number;
  totalSteps: number;
}

const StepperContext = React.createContext<StepperContextValue>({
  activeIndex: 0,
  totalSteps: 0,
});

// ---------------------------------------------------------------------------
// Stepper (root)
// ---------------------------------------------------------------------------

interface StepperProps {
  activeStep: number;
  children: React.ReactNode;
  className?: string;
}

export function Stepper({ activeStep, children, className }: StepperProps) {
  const totalSteps = React.Children.count(children);

  return (
    <StepperContext.Provider value={{ activeIndex: activeStep, totalSteps }}>
      <div
        className={cn("flex items-center gap-0 overflow-x-auto scrollbar-none", className)}
        role="navigation"
        aria-label="Status progression"
      >
        {children}
      </div>
    </StepperContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// StepperItem
// ---------------------------------------------------------------------------

interface StepperItemProps {
  index: number;
  status?: StepStatus;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  isLast?: boolean;
}

export function StepperItem({
  index,
  status: statusOverride,
  label,
  icon,
  color,
  isLast = false,
}: StepperItemProps) {
  const { activeIndex } = React.useContext(StepperContext);

  const status =
    statusOverride ??
    (index < activeIndex ? "completed" : index === activeIndex ? "active" : "pending");

  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center gap-1">
        <StepperIndicator status={status} icon={icon} color={color} />
        <span
          className={cn(
            "whitespace-nowrap text-[10px] font-medium leading-none sm:text-xs",
            status === "completed" && "text-muted-foreground",
            status === "active" && "text-foreground",
            status === "pending" && "text-muted-foreground/40",
            status === "terminal" && "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </div>
      {!isLast && <StepperSeparator status={status} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepperIndicator
// ---------------------------------------------------------------------------

function StepperIndicator({
  status,
  icon,
  color,
}: {
  status: StepStatus;
  icon?: React.ReactNode;
  color?: string;
}) {
  const baseClasses =
    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all sm:size-7";

  if (status === "completed") {
    return (
      <div className={cn(baseClasses, "bg-emerald-500/20 text-emerald-400")}>
        <Check className="size-3.5" />
      </div>
    );
  }

  if (status === "active") {
    return (
      <div
        className={cn(
          baseClasses,
          "ring-2 ring-current/30",
          color ?? "text-blue-400 bg-blue-500/20",
        )}
        style={color ? { color } : undefined}
      >
        <div className="relative flex items-center justify-center">
          {icon ?? <div className="size-2 animate-pulse rounded-full bg-current" />}
        </div>
      </div>
    );
  }

  if (status === "terminal") {
    return (
      <div className={cn(baseClasses, "bg-muted/50")} style={color ? { color } : undefined}>
        {icon ?? <div className="size-2 rounded-full bg-current" />}
      </div>
    );
  }

  // pending
  return (
    <div className={cn(baseClasses, "bg-muted/30 text-muted-foreground/30")}>
      <div className="size-1.5 rounded-full bg-current" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepperSeparator
// ---------------------------------------------------------------------------

function StepperSeparator({ status }: { status: StepStatus }) {
  return (
    <div
      className={cn(
        "mx-1 h-px w-4 sm:mx-1.5 sm:w-6",
        status === "completed" ? "bg-emerald-500/40" : "bg-border/30",
      )}
    />
  );
}
