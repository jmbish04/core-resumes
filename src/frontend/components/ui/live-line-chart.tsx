import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface LiveLinePoint {
  time: number;
  value: number;
}

export interface MomentumColors {
  up: string;
  down: string;
  flat: string;
}

interface ChartContextValue {
  data: LiveLinePoint[];
  value: number;
  window: number;
  paused: boolean;
  activeTime: number | null;
  setActiveTime: (t: number | null) => void;
  momentum: "up" | "down" | "flat";
}

const LiveChartContext = createContext<ChartContextValue | null>(null);

export function useLiveChart() {
  const context = useContext(LiveChartContext);
  if (!context) {
    throw new Error("Live components must be used within <LiveLineChart />");
  }
  return context;
}

export function LiveLineChart({
  data,
  value,
  window = 30,
  paused = false,
  children,
  className,
  style,
}: {
  data: LiveLinePoint[];
  value: number;
  window?: number;
  paused?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [activeTime, setActiveTime] = useState<number | null>(null);

  // Compute short-term trend momentum
  const momentum = useMemo(() => {
    if (data.length < 2) return "flat";
    const last = data[data.length - 1].value;
    const prev = data[data.length - 2].value;
    if (last > prev) return "up";
    if (last < prev) return "down";
    return "flat";
  }, [data]);

  return (
    <LiveChartContext.Provider
      value={{
        data,
        value,
        window,
        paused,
        activeTime,
        setActiveTime,
        momentum,
      }}
    >
      <div
        className={cn("relative w-full h-[240px] flex flex-col justify-between select-none p-4", className)}
        style={style}
      >
        {children}
      </div>
    </LiveChartContext.Provider>
  );
}

export function LiveLine({
  dataKey = "value",
  stroke = "var(--chart-1)",
  strokeWidth = 2,
  fill = true,
  pulse = true,
  dotSize = 4,
  badge = true,
  formatValue = (v) => v.toFixed(2),
  momentumColors,
}: {
  dataKey?: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: boolean;
  pulse?: boolean;
  dotSize?: number;
  badge?: boolean;
  formatValue?: (v: number) => string;
  momentumColors?: MomentumColors;
}) {
  const { data, window: timeWindow, value: latestValue, momentum } = useLiveChart();

  // Pick color based on trend momentum
  const lineColor = useMemo(() => {
    if (momentumColors) {
      return momentumColors[momentum];
    }
    return stroke;
  }, [momentumColors, momentum, stroke]);

  if (data.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground font-mono">
        Waiting for stream...
      </div>
    );
  }

  // Filter points in the active window
  const now = Date.now() / 1000;
  const startTime = now - timeWindow;
  const activePoints = data.filter((p) => p.time >= startTime);

  // Compute geometry bounds
  const minVal = Math.min(...data.map((p) => p.value)) * 0.98;
  const maxVal = Math.max(...data.map((p) => p.value)) * 1.02;
  const valRange = maxVal - minVal || 1;

  // Convert points to SVG coordinates
  const svgWidth = 100;
  const svgHeight = 100;

  const pointsString = activePoints
    .map((p) => {
      const x = ((p.time - startTime) / timeWindow) * svgWidth;
      const y = svgHeight - ((p.value - minVal) / valRange) * svgHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const fillPathString = activePoints.length > 0
    ? `M 0,${svgHeight} ` +
      activePoints
        .map((p) => {
          const x = ((p.time - startTime) / timeWindow) * svgWidth;
          const y = svgHeight - ((p.value - minVal) / valRange) * svgHeight;
          return `L ${x},${y}`;
        })
        .join(" ") +
      ` L ${((activePoints[activePoints.length - 1].time - startTime) / timeWindow) * svgWidth},${svgHeight} Z`
    : "";

  const tipX = activePoints.length > 0
    ? ((activePoints[activePoints.length - 1].time - startTime) / timeWindow) * svgWidth
    : 100;
  const tipY = activePoints.length > 0
    ? svgHeight - ((activePoints[activePoints.length - 1].value - minVal) / valRange) * svgHeight
    : 50;

  return (
    <div className="relative flex-1 w-full border border-border/20 rounded-md overflow-hidden bg-card/10 backdrop-blur-xs">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Fill Area Gradient */}
        {fill && fillPathString && (
          <path
            d={fillPathString}
            fill={`url(#lineGradient-${dataKey})`}
            className="transition-all duration-300"
          />
        )}

        {/* The Live Line */}
        {pointsString && (
          <polyline
            fill="none"
            stroke={lineColor}
            strokeWidth={strokeWidth / 2}
            points={pointsString}
            className="transition-all duration-200"
          />
        )}

        {/* Pulsing Tip Point */}
        {pulse && (
          <g>
            <circle
              cx={tipX}
              cy={tipY}
              r={dotSize * 1.5}
              fill={lineColor}
              className="animate-ping opacity-35"
              style={{ transformOrigin: `${tipX}px ${tipY}px` }}
            />
            <circle cx={tipX} cy={tipY} r={dotSize / 2} fill={lineColor} />
          </g>
        )}

        {/* Definitions */}
        <defs>
          <linearGradient id={`lineGradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.0} />
          </linearGradient>
        </defs>
      </svg>

      {/* Realtime Live Tip Badge Overlay */}
      {badge && (
        <div
          className="absolute text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm shadow-md transition-all duration-200 flex items-center gap-1"
          style={{
            right: "12px",
            top: `${Math.max(10, Math.min(85, tipY))}%`,
            backgroundColor: lineColor,
            color: "#000000",
          }}
        >
          {formatValue(latestValue)}
        </div>
      )}
    </div>
  );
}

export function LiveXAxis() {
  return (
    <div className="flex justify-between items-center w-full px-1 text-[9px] font-mono text-muted-foreground mt-2 border-t border-border/10 pt-1">
      <span>{`-30s`}</span>
      <span>{`-15s`}</span>
      <span>{`Live Now`}</span>
    </div>
  );
}

export function LiveYAxis({
  position = "left",
  formatValue = (v) => `$${v.toFixed(0)}`,
}: {
  position?: "left" | "right";
  formatValue?: (v: number) => string;
}) {
  const { data } = useLiveChart();
  const minVal = Math.min(...data.map((p) => p.value)) * 0.98;
  const maxVal = Math.max(...data.map((p) => p.value)) * 1.02;
  const midVal = (minVal + maxVal) / 2;

  return (
    <div
      className={cn(
        "absolute top-6 bottom-10 flex flex-col justify-between text-[8px] font-mono text-muted-foreground z-10",
        position === "left" ? "left-2" : "right-2"
      )}
    >
      <span>{formatValue(maxVal)}</span>
      <span>{formatValue(midVal)}</span>
      <span>{formatValue(minVal)}</span>
    </div>
  );
}
