import { cn } from "@/lib/utils";

/**
 * Skeleton — animated placeholder component for loading states.
 *
 * Renders a pulsing rectangular placeholder that mimics the shape of
 * content being loaded. Apply width/height via className or style.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
