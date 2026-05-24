import {
  Upload,
  TrendingUp,
  DollarSign,
  Target,
  CircleAlert,
  Briefcase,
  Leaf,
  Palette,
  Save,
  Link as LinkIcon,
} from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, PieChart, Pie, LabelList } from "recharts";

import { EmailInbox } from "@/components/email/EmailInbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiPatch, apiPost } from "@/lib/api-client";
import { toast } from "@/lib/api-client";

export function CompanyViewport({ company, roles }: { company: any; roles: any[] }) {
  const [colorPrimary, setColorPrimary] = useState(company.colorPrimary || "#ffffff");
  const [colorAccent, setColorAccent] = useState(company.colorAccent || "#ffffff");
  const [logoUrl, setLogoUrl] = useState(company.attributes?.logoUrl || "");
  const [isUploading, setIsUploading] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [greenhouseToken, setGreenhouseToken] = useState(company.greenhouseToken || "");
  const [ghSaving, setGhSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insights = company.attributes?.insights;

  const saveGreenhouseToken = async () => {
    setGhSaving(true);
    try {
      const lowerToken = greenhouseToken.toLowerCase();
      await apiPatch(`/api/companies/${company.id}`, {
        greenhouseToken: lowerToken || null,
      });
      setGreenhouseToken(lowerToken);
      toast({ title: "Greenhouse board saved", variant: "success" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setGhSaving(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { uploadURL, id } = await apiPost<{ uploadURL: string; id: string }>(
        `/api/companies/${company.id}/logo-upload-url`,
        {},
      );
      const accountHash = uploadURL.split("/")[3];

      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(uploadURL, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload image to Cloudflare");
      }

      const finalLogoUrl = `https://imagedelivery.net/${accountHash}/${id}/public`;

      await apiPatch(`/api/companies/${company.id}`, {
        attributes: {
          ...company.attributes,
          logoImageId: id,
          logoUrl: finalLogoUrl,
        },
      });

      setLogoUrl(finalLogoUrl);
      toast({ title: "Logo uploaded successfully", variant: "success" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasteUrl = async () => {
    if (!pasteUrl) return;
    setIsUploading(true);
    try {
      const res = await apiPost<{ logoUrl: string }>(`/api/companies/${company.id}/logo-from-url`, {
        url: pasteUrl,
      });
      setLogoUrl(res.logoUrl);
      setPasteUrl("");
      toast({ title: "Logo imported successfully", variant: "success" });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const saveColors = async () => {
    try {
      await apiPatch(`/api/companies/${company.id}`, {
        colorPrimary,
        colorAccent,
      });
      toast({ title: "Theme colors saved", variant: "success" });
    } catch (err: any) {
      toast({ title: "Failed to save colors", description: err.message, variant: "destructive" });
    }
  };

  // Pie chart config & data
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    roles.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    // Map to the PieChart structure
    return Object.entries(counts).map(([status, value], _index) => ({
      status,
      value,
      fill: `var(--color-${status.replace(/\s+/g, "")})`,
    }));
  }, [roles]);

  const chartConfigPie = useMemo(() => {
    const config: any = {
      value: { label: "Roles" },
    };
    const blueTints = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
    ];
    statusData.forEach((item, index) => {
      config[item.status.replace(/\s+/g, "")] = {
        label: item.status,
        color: blueTints[index % blueTints.length],
      };
    });
    return config;
  }, [statusData]);

  // Bar chart config & data
  const salaryData = useMemo(() => {
    return roles
      .filter((r) => r.salaryMax || r.salaryMin)
      .map((r) => ({
        name: r.jobTitle.substring(0, 15) + (r.jobTitle.length > 15 ? "..." : ""),
        salary: r.salaryMax || r.salaryMin || 0,
      }));
  }, [roles]);

  const chartConfigBar = {
    salary: {
      label: "Salary",
      color: "hsl(var(--chart-1))",
    },
    label: {
      color: "hsl(var(--background))",
    },
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Hero Card */}
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1">
              {/* Logo Editor */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${company.name} logo`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-6 w-6" />
                      <span className="text-[10px] font-medium uppercase tracking-wider">
                        Upload
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
                    <Upload className="h-6 w-6 text-foreground" />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={isUploading}
                  />
                </button>
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="Paste URL..."
                    className="h-7 text-xs w-[120px]"
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    disabled={isUploading}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={handlePasteUrl}
                    disabled={isUploading || !pasteUrl}
                  >
                    <LinkIcon className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Company Info */}
              <div className="flex-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {company.name}
                </h1>
                <p className="text-muted-foreground flex items-center gap-2 mt-1">
                  <Briefcase className="h-4 w-4" />
                  {roles.length} Roles Tracked
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-end sm:items-start gap-6">
              {/* Theme Colors */}
              <div className="grid gap-2 min-w-[200px]">
                <Label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <Palette className="h-3 w-3" /> Brand Theme
                </Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 border rounded-md p-1 bg-background">
                    <input
                      type="color"
                      value={colorPrimary}
                      onChange={(e) => setColorPrimary(e.target.value)}
                      className="h-6 w-6 cursor-pointer appearance-none rounded-md border-0 p-0 bg-transparent"
                    />
                    <Input
                      value={colorPrimary}
                      onChange={(e) => setColorPrimary(e.target.value)}
                      className="h-6 w-20 font-mono text-xs uppercase border-0 p-1 bg-transparent shadow-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 border rounded-md p-1 bg-background">
                    <input
                      type="color"
                      value={colorAccent}
                      onChange={(e) => setColorAccent(e.target.value)}
                      className="h-6 w-6 cursor-pointer appearance-none rounded-md border-0 p-0 bg-transparent"
                    />
                    <Input
                      value={colorAccent}
                      onChange={(e) => setColorAccent(e.target.value)}
                      className="h-6 w-20 font-mono text-xs uppercase border-0 p-1 bg-transparent shadow-none"
                    />
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveColors}>
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Greenhouse Token */}
              <div className="grid gap-2 min-w-[200px]">
                <Label className="text-xs font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <Leaf className="h-3 w-3 text-green-500" /> Greenhouse Board
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={greenhouseToken}
                    onChange={(e) => setGreenhouseToken(e.target.value)}
                    placeholder="e.g. stripe"
                    className="h-8 w-[140px] font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3"
                    onClick={saveGreenhouseToken}
                    disabled={ghSaving}
                  >
                    {ghSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
                {greenhouseToken && (
                  <a
                    href={`https://boards.greenhouse.io/${greenhouseToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:underline whitespace-nowrap -mt-1 flex items-center gap-1"
                  >
                    View Board <TrendingUp className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="items-center pb-0">
            <CardTitle>Role Status Breakdown</CardTitle>
            <CardDescription>Distribution of application statuses</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <ChartContainer
              config={chartConfigPie}
              className="mx-auto aspect-square max-h-[250px] pb-0 [&_.recharts-pie-label-text]:fill-foreground"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie data={statusData} dataKey="value" label nameKey="status">
                  <LabelList
                    dataKey="status"
                    className="fill-background"
                    stroke="none"
                    fontSize={12}
                    formatter={(value: any) =>
                      chartConfigPie[value as keyof typeof chartConfigPie]?.label
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
          {insights?.overallSummary && (
            <CardFooter className="flex-col gap-2 text-sm">
              <div className="flex items-center gap-2 font-medium leading-none">
                AI Insight <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="leading-none text-muted-foreground text-center">
                {insights.overallSummary}
              </div>
            </CardFooter>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Top Salaries</CardTitle>
            <CardDescription>Highest reported salaries for roles at {company.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ChartContainer config={chartConfigBar}>
              <BarChart
                accessibilityLayer
                data={salaryData}
                layout="vertical"
                margin={{
                  right: 16,
                }}
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  hide
                />
                <XAxis dataKey="salary" type="number" hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="salary" fill="var(--color-salary)" radius={4}>
                  <LabelList
                    dataKey="name"
                    position="insideLeft"
                    offset={8}
                    className="fill-[--color-label]"
                    fontSize={12}
                  />
                  <LabelList
                    dataKey="salary"
                    position="right"
                    offset={8}
                    className="fill-foreground"
                    fontSize={12}
                    formatter={(val: any) => `$${Number(val) / 1000}k`}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
          {insights?.salaryTrends && (
            <CardFooter className="flex-col gap-2 text-sm mt-4">
              <div className="flex items-center gap-2 font-medium leading-none">
                AI Insight <DollarSign className="h-4 w-4 text-green-500" />
              </div>
              <div className="leading-none text-muted-foreground text-center">
                {insights.salaryTrends}
              </div>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* AI Insights Overflow Section */}
      {insights && (insights.experienceTrends || insights.outliers) && (
        <div className="grid gap-4 md:grid-cols-2">
          {insights.experienceTrends && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-500" />
                  Experience Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{insights.experienceTrends}</p>
              </CardContent>
            </Card>
          )}
          {insights.outliers && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CircleAlert className="h-4 w-4 text-red-500" />
                  Notable Outliers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {insights.outliers?.length > 0 ? (
                  <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1">
                    {insights.outliers.map((o: string, i: number) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No significant outliers detected.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Roles List */}
      <Card>
        <CardHeader>
          <CardTitle>Roles at {company.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Salary Range</TableHead>
                  <TableHead>Experience Req.</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                      No roles tracked yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <a
                          href={`/roles/${r.id}`}
                          className="font-medium hover:underline text-foreground"
                        >
                          {r.jobTitle}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.salaryMin || r.salaryMax
                          ? `$${(r.salaryMin || 0).toLocaleString()} - $${(r.salaryMax || 0).toLocaleString()}`
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        {r.yearsExperienceMin || r.yearsExperienceMax
                          ? `${r.yearsExperienceMin || 0} - ${r.yearsExperienceMax || 0} yrs`
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        {r.createdAt
                          ? new Date(r.createdAt).toISOString().split("T")[0]
                          : "Unknown"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {/* Email Inbox — all emails for all roles in this company */}
      <EmailInbox filter={{ companyId: company.id }} showForwardBanner maxHeight="500px" />
    </div>
  );
}
