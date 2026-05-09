"use client";

import { AssistantModalPrimitive } from "@assistant-ui/react";
import { BotIcon, ChevronDownIcon } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { Thread } from "./thread";

export function AssistantModal() {
  return (
    <AssistantModalPrimitive.Root unstable_openOnRunStart>
      <AssistantModalPrimitive.Anchor className="fixed right-4 bottom-4 z-40 size-11">
        <Tooltip>
          <TooltipTrigger asChild>
            <AssistantModalPrimitive.Trigger asChild>
              <AssistantModalButton />
            </AssistantModalPrimitive.Trigger>
          </TooltipTrigger>
          <TooltipContent side="left">Role assistant</TooltipContent>
        </Tooltip>
      </AssistantModalPrimitive.Anchor>

      <AssistantModalPrimitive.Content
        align="end"
        sideOffset={16}
        className={cn(
          "z-50 h-[min(42rem,calc(100svh-6rem))] w-[min(26rem,calc(100vw-2rem))] overflow-hidden overscroll-contain rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-xl outline-none",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=closed]:zoom-out-95",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=open]:zoom-in-95",
        )}
      >
        <Thread />
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  );
}

type AssistantModalButtonProps = ComponentPropsWithoutRef<"button"> & {
  "data-state"?: "open" | "closed";
};

const AssistantModalButton = forwardRef<HTMLButtonElement, AssistantModalButtonProps>(
  ({ className, "data-state": state, ...props }, ref) => {
    const modalState = state ?? "closed";
    const label = modalState === "open" ? "Close role assistant" : "Open role assistant";

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        data-state={modalState}
        className={cn(
          buttonVariants({ size: "icon", variant: "default" }),
          "relative size-11 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95",
          className,
        )}
        {...props}
      >
        <BotIcon
          data-state={modalState}
          className="absolute size-5 transition-all data-[state=closed]:rotate-0 data-[state=closed]:scale-100 data-[state=open]:rotate-90 data-[state=open]:scale-0"
        />
        <ChevronDownIcon
          data-state={modalState}
          className="absolute size-5 transition-all data-[state=closed]:-rotate-90 data-[state=closed]:scale-0 data-[state=open]:rotate-0 data-[state=open]:scale-100"
        />
        <span className="sr-only">{label}</span>
      </button>
    );
  },
);

AssistantModalButton.displayName = "AssistantModalButton";
