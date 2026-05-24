the role viewport analysis tab has styling issues .., the score are impossible to read for hire lielihood, compensation, location analysis, compesation analysis, combine value analysis

mandatory --- USE THIS RADIAL CHART SHADCN RECHART WITH THIS STYLING BEING MANDATORY ... in fact, save the style in like a global.css file so it is not localized here. You will note that there is a section under the graph for an ai generated message to summarize the score overall which is what should happen on this ui

1. use this shadcn rechart radial chart and its styling for all scores on the analysis tab

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

2. Location Analysis -- this is a huge chart
   -- the extracted job info could literally be anything and currently its super long and stretching off of the page -- so add word wrapping to it to force it to stay inside the card bounds (I believe it may be this: {payload.rtoPolicy && <Badge variant="outline">{payload.rtoPolicy}</Badge>})

- the commuter data .... ill say this again for the 2nd time -- the chart belongs in a modal ... so under the location analysis score radial chart ...
  - show a unique list of commute mode options with min, mean, and max duration .. and the estimated monthly cost (which is a repeating value on all the rows each time the mode is mentioned .. so we only need to see it once)
    - mode 1: min duration, median duration, max duration, estimated monthly cost
    - mode 2: min duration, median duration, max duration, estimated monthly cost
    - mode 3: min duration, median duration, max duration, estimated monthly cost

  - include a button to view the table for more information - show the table as unique modes as the rows; unique schedule items (or even a range of like 7am - 8am, 8am -9am, 9am -10am | 3pm - 4pm, 4pm - 5pm, 5pm - 6pm
    -- the values (intersection of row and column, mode and schedule/time) will be the duration for the given schedule and mode -- do not include monthly cost here
    -- note, right now the schedule is null everywhere in this table

          - also in the modal show charts to map the mode against schedule, duration, and cost -- side by side charts (line chart or area chart) with left graph being morning commute and right graph being evening commute

3. Compensation Analysis --- the dollar amount is super small font .. make that bigger
   - include some kind of chart that helps me see what my google compensation was before i left and how the salary of this role compares ... also map out a fair goal for negotating a higher salary so i can see how far off that goal is from my google salary (if at all, maybe its still less than my google salary) and how far off it is from the advertised salary range -- this is a tool to help me guage whether the role is worth it or not and if i feel even with negotation i could get it higher

4. Combined Value ... no need to show the location score or compensation score again .. just instal the radial chart
   --- right now the score here is completely broken for the radial chart ... there is no value at all for the combined value score

5. At the bottom of the tab it says "No alignment data available. Run a hireability analysis first." but this is not true, i successfully ran the hierability data so this just seems to be a lazy ai cut corner slop situation --fix this

6. Do not vertically stack cards -- they must all be horizontal and follow the card above it so they are all stacked on top of each other ... width is better here so things arent so sqeezy -- remeber that this page needs to be mobile responsive too
