import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface FunnelStage {
  label: string;
  value: number;
  displayValue?: string;
  color?: string;
  gradient?: { color: string; offset: number }[];
}

export interface GridConfig {
  bands?: boolean;
  bandColor?: string;
  lines?: boolean;
  lineColor?: string;
  lineOpacity?: number;
  lineWidth?: number;
}

export interface FunnelChartProps {
  data: FunnelStage[];
  orientation?: "horizontal" | "vertical";
  color?: string;
  layers?: number;
  edges?: "curved" | "straight";
  gap?: number;
  staggerDelay?: number;
  showPercentage?: boolean;
  showValues?: boolean;
  showLabels?: boolean;
  formatPercentage?: (pct: number) => string;
  formatValue?: (value: number) => string;
  labelLayout?: "spread" | "grouped";
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  grid?: boolean | GridConfig;
  className?: string;
  style?: React.CSSProperties;
}

export function FunnelChart({
  data,
  orientation = "horizontal",
  color = "var(--chart-1)",
  layers = 3,
  edges = "curved",
  gap = 4,
  showPercentage = true,
  showValues = true,
  showLabels = true,
  formatPercentage = (pct) => `${Math.round(pct)}%`,
  formatValue = (val) => val.toLocaleString(),
  labelLayout = "spread",
  hoveredIndex: controlledHoveredIndex,
  onHoverChange,
  grid = false,
  className,
  style,
}: FunnelChartProps) {
  const [localHoveredIndex, setLocalHoveredIndex] = useState<number | null>(null);
  const activeHoverIndex = controlledHoveredIndex !== undefined ? controlledHoveredIndex : localHoveredIndex;

  const handleMouseEnter = (idx: number) => {
    setLocalHoveredIndex(idx);
    if (onHoverChange) onHoverChange(idx);
  };

  const handleMouseLeave = () => {
    setLocalHoveredIndex(null);
    if (onHoverChange) onHoverChange(null);
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        No funnel data provided.
      </div>
    );
  }

  // Base value is the maximum value (first stage represents 100%)
  const maxValue = data[0]?.value || 1;

  // Configure Grid Options
  const gridConfig: GridConfig = typeof grid === "object" ? grid : {
    bands: !!grid,
    lines: !!grid,
    bandColor: "rgba(255, 255, 255, 0.02)",
    lineColor: "var(--chart-grid)",
    lineOpacity: 0.4,
    lineWidth: 1,
  };

  return (
    <div
      className={cn("relative w-full flex flex-col items-center justify-center p-4", className)}
      style={style}
    >
      {/* Visual background bands/lines if configured */}
      {gridConfig.bands && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between opacity-50">
          {data.map((_, idx) => (
            <div
              key={idx}
              className="flex-1 w-full"
              style={{
                backgroundColor: idx % 2 === 0 ? gridConfig.bandColor : "transparent",
              }}
            />
          ))}
        </div>
      )}

      {/* Main Funnel Visualization SVG */}
      <div
        className={cn(
          "w-full relative flex items-center justify-center gap-6",
          orientation === "vertical" ? "flex-row h-[400px]" : "flex-col h-[280px]"
        )}
      >
        <svg
          className="w-full h-full overflow-visible select-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {data.map((stage, idx) => {
            const nextStage = data[idx + 1];
            const currentRatio = stage.value / maxValue;
            const nextRatio = nextStage ? nextStage.value / maxValue : currentRatio * 0.4;

            const isHovered = activeHoverIndex === idx;
            const baseColor = stage.color || color;

            // Geometry calculations for horizontal funnel segments
            // Segments are mapped horizontally along the SVG viewBox (0-100 x, 0-100 y)
            const count = data.length;
            const xStart = (idx / count) * 100;
            const xEnd = ((idx + 1) / count) * 100 - (idx < count - 1 ? (gap / count) : 0);

            // Centering along Y
            const yCurrentHalf = (currentRatio * 85) / 2;
            const yNextHalf = (nextRatio * 85) / 2;

            const yTopStart = 50 - yCurrentHalf;
            const yBottomStart = 50 + yCurrentHalf;

            const yTopEnd = 50 - yNextHalf;
            const yBottomEnd = 50 + yNextHalf;

            // Draw curved or straight SVG paths
            let pathD = "";
            if (edges === "curved") {
              const xCtrl = (xStart + xEnd) / 2;
              pathD = `
                M ${xStart} ${yTopStart}
                C ${xCtrl} ${yTopStart}, ${xCtrl} ${yTopEnd}, ${xEnd} ${yTopEnd}
                L ${xEnd} ${yBottomEnd}
                C ${xCtrl} ${yBottomEnd}, ${xCtrl} ${yBottomStart}, ${xStart} ${yBottomStart}
                Z
              `;
            } else {
              pathD = `
                M ${xStart} ${yTopStart}
                L ${xEnd} ${yTopEnd}
                L ${xEnd} ${yBottomEnd}
                L ${xStart} ${yBottomStart}
                Z
              `;
            }

            // Draw Concentric Halo Rings
            const haloPaths = Array.from({ length: layers }).map((_, layerIdx) => {
              const scale = 1 + (layerIdx + 1) * (isHovered ? 0.08 : 0.04);
              const dyCurrentHalf = (yCurrentHalf * scale);
              const dyNextHalf = (yNextHalf * scale);

              const dyTopStart = 50 - dyCurrentHalf;
              const dyBottomStart = 50 + dyCurrentHalf;
              const dyTopEnd = 50 - dyNextHalf;
              const dyBottomEnd = 50 + dyNextHalf;

              if (edges === "curved") {
                const xCtrl = (xStart + xEnd) / 2;
                return `
                  M ${xStart} ${dyTopStart}
                  C ${xCtrl} ${dyTopStart}, ${xCtrl} ${dyTopEnd}, ${xEnd} ${dyTopEnd}
                  L ${xEnd} ${dyBottomEnd}
                  C ${xCtrl} ${dyBottomEnd}, ${xCtrl} ${dyBottomStart}, ${xStart} ${dyBottomStart}
                  Z
                `;
              } else {
                return `
                  M ${xStart} ${dyTopStart}
                  L ${xEnd} ${dyTopEnd}
                  L ${xEnd} ${dyBottomEnd}
                  L ${xStart} ${dyBottomStart}
                  Z
                `;
              }
            });

            return (
              <g
                key={idx}
                onMouseEnter={() => handleMouseEnter(idx)}
                onMouseLeave={handleMouseLeave}
                className="cursor-pointer transition-all duration-300"
              >
                {/* Render Halo Rings */}
                {haloPaths.reverse().map((path, hIdx) => {
                  const reverseIdx = layers - hIdx;
                  return (
                    <path
                      key={hIdx}
                      d={path}
                      fill="none"
                      stroke={baseColor}
                      strokeWidth={isHovered ? 1.5 : 0.8}
                      className="transition-all duration-300"
                      style={{
                        opacity: isHovered ? (0.25 / reverseIdx) : (0.12 / reverseIdx),
                        transformOrigin: "center",
                      }}
                    />
                  );
                })}

                {/* Primary Funnel Segment */}
                <path
                  d={pathD}
                  fill={baseColor}
                  className="transition-all duration-300 hover:brightness-110 drop-shadow-md"
                  style={{
                    opacity: isHovered ? 0.85 : 0.65,
                  }}
                />

                {/* Outer borders/accent lines */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={baseColor}
                  strokeWidth={0.5}
                  className="transition-all duration-300"
                  style={{ opacity: isHovered ? 0.9 : 0.4 }}
                />
              </g>
            );
          })}
        </svg>

        {/* Labels Overlay */}
        <div className="absolute inset-0 flex flex-row pointer-events-none select-none">
          {data.map((stage, idx) => {
            const isHovered = activeHoverIndex === idx;
            const pct = (stage.value / maxValue) * 100;
            const displayPct = formatPercentage(pct);

            return (
              <div
                key={idx}
                className={cn(
                  "flex-1 flex flex-col justify-between items-center text-center py-2 relative transition-all duration-300",
                  isHovered ? "bg-white/5 scale-[1.02] rounded-md border border-white/10" : ""
                )}
              >
                {/* Stage Title */}
                {showLabels && (
                  <span className={cn(
                    "text-[10px] sm:text-xs font-semibold tracking-wide uppercase transition-colors duration-300 truncate w-full px-1",
                    isHovered ? "text-primary" : "text-muted-foreground"
                  )}>
                    {stage.label}
                  </span>
                )}

                {/* Central Value */}
                {showValues && (
                  <div className="flex flex-col items-center justify-center my-auto">
                    <span className={cn(
                      "text-sm sm:text-lg font-bold tracking-tight transition-all duration-300 font-mono",
                      isHovered ? "text-primary scale-115 font-extrabold" : "text-foreground"
                    )}>
                      {stage.displayValue || formatValue(stage.value)}
                    </span>
                    {showPercentage && idx > 0 && (
                      <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 rounded-sm mt-1">
                        {displayPct}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend Block */}
      {labelLayout === "spread" && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-4 w-full">
          {data.map((stage, idx) => {
            const isHovered = activeHoverIndex === idx;
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-transparent transition-all duration-200",
                  isHovered ? "bg-muted/60 border-border/80" : "opacity-75"
                )}
              >
                <div
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: stage.color || color }}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {stage.label}:
                </span>
                <span className="text-xs font-semibold font-mono">
                  {stage.displayValue || formatValue(stage.value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
