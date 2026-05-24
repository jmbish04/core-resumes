lets keep this simple for https://core-resumes.hacolby.workers.dev/roles/e5ed8061-32a4-47d3-bb7c-e441cb55ef29?tab=analysis

for the 4th or 5th time im requesting this stuff -- geez

1. All charts on this page for scor reporting should be radial chart using these exact style string -- DUDE I CANNOT SEE THE CHARTS YOU AHVE USED WHITE FONT AND WHITE BACKGROUND -- YOU MUST ABSOLUTELY USE THE SHADNC RECHART BELOW FOR THE SCORING SCARD STRICLTY USING THE STYLE ATTACHED

"use client"

import { TrendingUp } from "lucide-react"
import {
Label,
PolarGrid,
PolarRadiusAxis,
RadialBar,
RadialBarChart,
} from "recharts"

import {
Card,
CardContent,
CardDescription,
CardFooter,
CardHeader,
CardTitle,
} from "@/components/ui/card"
import {
ChartContainer,
ChartTooltip,
ChartTooltipContent,
type ChartConfig,
} from "@/components/ui/chart"

export const description = "A radial chart with stacked sections"

const chartData = [{ month: "january", mobile: 570, desktop: 1260 }]

const chartConfig = {
desktop: {
label: "Desktop",
color: "var(--chart-1)",
},
mobile: {
label: "Mobile",
color: "var(--chart-2)",
},
} satisfies ChartConfig

export function ChartRadialStacked() {
const totalVisitors = chartData[0].desktop + chartData[0].mobile

return (
<Card className="flex flex-col">
<CardHeader className="items-center pb-0">
<CardTitle>Radial Chart - Stacked</CardTitle>
<CardDescription>January - June 2024</CardDescription>
</CardHeader>
<CardContent className="flex flex-1 items-center pb-0">
<ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[250px]"
        >
<RadialBarChart
            data={chartData}
            endAngle={180}
            innerRadius={80}
            outerRadius={110}
          >
<RadialBar
              dataKey="mobile"
              fill="var(--color-mobile)"
              stackId="a"
              cornerRadius={5}
              className="stroke-transparent stroke-2"
            />
<RadialBar
              dataKey="desktop"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-desktop)"
              className="stroke-transparent stroke-2"
            />
<ChartTooltip
cursor={false}
content={<ChartTooltipContent hideLabel />}
/>
<PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
<Label
content={({ viewBox }) => {
if (viewBox && "cx" in viewBox && "cy" in viewBox) {
return (
<text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
<tspan
x={viewBox.cx}
y={(viewBox.cy || 0) - 16}
className="fill-foreground text-2xl font-bold" >
{totalVisitors.toLocaleString()}
</tspan>
<tspan
x={viewBox.cx}
y={(viewBox.cy || 0) + 4}
className="fill-muted-foreground" >
Visitors
</tspan>
</text>
)
}
}}
/>
</PolarRadiusAxis>
</RadialBarChart>
</ChartContainer>
</CardContent>
<CardFooter className="flex-col gap-2 text-sm">

<div className="flex items-center gap-2 leading-none font-medium">
Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
</div>
<div className="leading-none text-muted-foreground">
Showing total visitors for the last 6 months
</div>
</CardFooter>
</Card>
)
}

2. each card should be 1 horizontal card .. nothing should be stacked side by side

[hire likliehood card] \n
[compensation score card]
[strategic narrative] \n
[location analysis] \n
[compensation analysis] \n
[combined value score card] \n

3. Compensation analysis -- what a joke of a joke come on!

- the copmensation comparison sucks and is really hard to even understand -- you should be using a line graph like i fucking asked 5times now

- there is no ai rationale or ai summary as to why the score is what is unlike the other analysis which do have a n ai rationale or summary

4. combiined value -- fuck sake -- still not listening to me --- dont seend to see the location and compesation cards here -- remove them

the combined value score is 0 / low --- it has never populated -- or are you telling me that 0 is an accurate fucking number???
