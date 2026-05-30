import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";

interface Curve {
  name: string;
  data: { year: number; salary: number }[];
}

interface PivotTrajectoryChartProps {
  curves: Curve[];
  title?: string;
  description?: string;
}

export function PivotTrajectoryChart({ curves, title = "Pivot Trajectory", description = "Projected salary growth over time." }: PivotTrajectoryChartProps) {
  if (!curves || curves.length === 0) {
    return null;
  }

  // Transform data for Recharts: array of objects with year as key, and curve names as values.
  const chartData: any[] = [];
  const years = curves[0].data.length;

  for (let i = 0; i < years; i++) {
    const point: any = { year: curves[0].data[i].year };
    curves.forEach((curve) => {
      point[curve.name] = curve.data[i]?.salary || 0;
    });
    chartData.push(point);
  }

  const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300"];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="year" tickFormatter={(v) => `Year ${v}`} />
              <YAxis 
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={80}
              />
              <Tooltip 
                formatter={(value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))}
                labelFormatter={(label) => `Year ${label}`}
                contentStyle={{ backgroundColor: "#1e1e2d", borderColor: "#333" }}
              />
              <Legend />
              {curves.map((curve, index) => (
                <Line
                  key={curve.name}
                  type="monotone"
                  dataKey={curve.name}
                  stroke={colors[index % colors.length]}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
