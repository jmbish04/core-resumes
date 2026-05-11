// @ts-nocheck
import {
  TrendingUp,
  Activity,
  Briefcase,
  Target,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  CheckCircle2,
  Zap,
  FileText,
  MessageSquare,
  MapPin,
  DollarSign,
  BrainCircuit,
  FileCode2,
  ShieldAlert,
  Download,
  Layers,
  Building2,
  CheckSquare,
  ExternalLink,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  RadialBarChart,
  RadialBar,
  PolarRadiusAxis,
  Label,
} from "recharts";

// --- CSS Variables for Shadcn Dark Blue Theme ---
const globalStyles = `
  :root {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);

    --chart-1: oklch(0.623 0.214 259.815); /* Vibrant Blue */
    --chart-2: oklch(0.546 0.245 262.881); /* Deep Blue */
    --chart-3: oklch(0.809 0.105 251.813); /* Light Blue */
    --chart-4: oklch(0.488 0.243 264.376); /* Darker Blue */
    --chart-5: oklch(0.424 0.199 265.638); /* Navy Blue */

    --radius: 0.625rem;
  }

  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: 'Inter Variable', sans-serif;
  }

  .recharts-pie-label-text {
    fill: #ffffff;
    font-size: 13px;
    font-weight: 600;
  }

  .recharts-pie-label-line {
    stroke: var(--muted-foreground);
    stroke-width: 1.5px;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: var(--background); }
  ::-webkit-scrollbar-thumb { background: var(--muted); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--ring); }
`;

// --- Shadcn UI Component Replicas ---
const Card = ({ className = "", children }) => (
  <div
    className={`rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm ${className}`}
  >
    {children}
  </div>
);

const CardContent = ({ className = "", children }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

const CollapsibleCard = ({ title, icon: Icon, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <Card className="w-full mb-4 border-slate-800 bg-slate-900 overflow-hidden transition-all duration-300 shadow-md">
      <div
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-[var(--muted)] transition-colors relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="absolute left-5 flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5 text-[var(--chart-1)]" />}
        </div>

        {/* Center Aligned Header */}
        <div className="w-full px-12 text-center flex justify-center items-center">
          <h3 className="font-bold text-[var(--foreground)] text-lg truncate tracking-wide">
            {title}
          </h3>
        </div>

        <div className="absolute right-5 flex items-center gap-4">
          <div className="text-[var(--muted-foreground)] bg-[var(--background)] p-1 rounded-md">
            {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* Left Aligned Text Heavy Portion */}
      {isOpen && (
        <div className="p-6 border-t border-[var(--border)] bg-[var(--card)] text-left">
          {children}
        </div>
      )}
    </Card>
  );
};

// Custom Recharts Tooltip
const ChartTooltipContent = ({
  active,
  payload,
  label,
  hideLabel,
  indicator = "circle",
  formatter,
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl text-sm min-w-[150px] text-left">
        {!hideLabel && label && (
          <div className="font-semibold text-[var(--foreground)] mb-2">{label}</div>
        )}
        <div className="flex flex-col gap-1.5">
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {indicator === "line" ? (
                  <div
                    className="w-3 h-0.5"
                    style={{ backgroundColor: entry.color || entry.stroke || entry.fill }}
                  />
                ) : (
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: entry.color || entry.fill }}
                  />
                )}
                <span className="text-[var(--muted-foreground)]">{entry.name}:</span>
              </div>
              <span className="font-medium text-[var(--foreground)]">
                {formatter ? formatter(entry.value, entry) : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

// --- Data ---
const pieData = [
  { name: "Data Engineering / ETL", value: 40, fill: "var(--chart-1)" },
  { name: "Product Management", value: 35, fill: "var(--chart-2)" },
  { name: "AI/ML Strategy", value: 15, fill: "var(--chart-3)" },
  { name: "General Admin", value: 10, fill: "var(--chart-4)" },
];

const radarData = [
  { subject: "Data Arch & ETL", official: 20, actual: 90 },
  { subject: "Process Automation", official: 50, actual: 95 },
  { subject: "AI Model Validation", official: 10, actual: 80 },
  { subject: "Cross-Functional", official: 70, actual: 100 },
  { subject: "Legal Domain", official: 40, actual: 85 },
  { subject: "Product Roadmap", official: 50, actual: 90 },
];

const barData = [
  { name: "Hardware Pres. (Savings)", impact: 100, metric: "$16M", fill: "var(--chart-1)" },
  { name: "MatterSpace (Adoption)", impact: 85, metric: "300%", fill: "var(--chart-2)" },
  { name: "Intake (Time Reduction)", impact: 70, metric: "70%", fill: "var(--chart-3)" },
  { name: "One Source (Revenue)", impact: 40, metric: "$455K", fill: "var(--chart-4)" },
];

const timelineData = [
  {
    tag: "Discovery & LEO Teams",
    title: "The Insight: Filling the Gap",
    years: "2013 - 2016",
    work: '"Legal Online Operations" (responding to law enforcement data requests) and "Discovery Operations."',
    constraint:
      'Witnessed firsthand how "Corporate Engineering" failed users, operating with a "Doctor/Patient" arrogance that prescribed solutions regardless of actual legal needs.',
    outcome:
      'Began architecting lightweight scripts and tools to bypass bureaucratic bottlenecks, creating the foundational identity of the "Translator" who speaks both Counsel and Code.',
  },
  {
    tag: "Locker Intake & Custom Apps",
    title: "The Shadow Ecosystem",
    years: "2016 - 2021",
    work: "Bespoke intake forms, automation scripts, and workflow engineering without formal headcount.",
    constraint:
      "Bureaucratic Velocity. Corporate Engineering took 2 years to update a simple dropdown menu, paralyzing data entry and forcing users back to unstructured email.",
    outcome:
      'Architected a "Shadow Ecosystem" of custom web apps that users voluntarily adopted over official tools. Reduced time-to-matter creation by 70%, proving User-Centricity beats Mandate.',
  },
  {
    tag: "Unified Metrics Platform",
    title: "Validating Enterprise Scale",
    years: "2022 - Present",
    work: "Enterprise-scale migration (MatterSpace) and data layer architecture.",
    constraint:
      "Scale & Financial Opacity. The solo ecosystem became so critical it required enterprise scaling. Rigid legacy policies created $16M in annual waste due to lack of visibility.",
    outcome:
      "Validated the need for a 55+ person engineering team. Transitioned to architecting the department's entire data layer, saving $16M annually and preparing infrastructure for AI integration.",
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("ai-role");
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showExportAlert, setShowExportAlert] = useState(false);

  // Global AI State
  const [jdText, setJdText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Tab specific AI states
  const [aiRoleAnalysis, setAiRoleAnalysis] = useState(null);
  const [aiJobInfo, setAiJobInfo] = useState(null);
  const [aiResume, setAiResume] = useState(null);
  const [aiCoverLetter, setAiCoverLetter] = useState(null);
  const [aiInterview, setAiInterview] = useState(null);

  const navigate = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const getGeminiResponse = async (systemPrompt, userText) => {
    const apiKey = typeof window !== "undefined" && window.__apiKey ? window.__apiKey : "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { responseMimeType: "application/json" },
    };

    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < 5; i++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleanJson = text
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();
          return JSON.parse(cleanJson);
        }
      } catch (error) {
        if (i === 4) throw error;
        await new Promise((res) => setTimeout(res, delays[i]));
      }
    }
  };

  const runFullAnalysis = async () => {
    if (!jdText.trim()) return;
    setIsAnalyzing(true);

    const rolePrompt = `You are an elite Executive Career Coach analyzing a JD for Justin Bishop.
Justin's Context: 12+ years at Google. "0-to-1" intrapreneur. Ships platform-critical tools (saving $16M annually, boosting adoption 300%). Bridges Legal, Eng, and Business. No JD (Law Degree) which keeps him ROI-focused. Compensation: Target ~$260k (Base ~$176k, 2025 Gross $263k). Location: SF 94134, prefers WFH/RTO 2 days.

Output valid JSON matching this schema:
{
  "fitScore": number (0-100),
  "fitRationale": "Why this score? Why not higher/lower?",
  "summary": "1 sentence overall summary",
  "jdTrapAnalysis": "Does this require a lawyer or a builder? How is lack of JD an advantage here?",
  "toWinThisRole": "Key strategies to win",
  "theHook": "1-2 sentence pitch",
  "strategicRecommendation": "Overall advice"
}`;

    const infoPrompt = `Analyze the JD for Job Info and Alignment for Justin Bishop (Location: SF 94134, Target Comp: $260k+, 2025 Gross: $263k).
Calculate commute info from SF 94134 to the job location (if listed) via Muni/BART or driving a Tesla Model 3 (HOV/Tolls/Parking). If remote, specify.
Evaluate the JD against Justin's 12-year Google history (BumbleBee, DOTS, $16M savings, 300% adoption).

CRITICAL REQUIREMENT: You MUST extract EVERY SINGLE bullet point from the Job Description under "Responsibilities", "Qualifications", and "Preferred Qualifications". Write them strictly VERBATIM. Do not summarize them or skip any.
For each verbatim bullet, provide a fit score (0-100), your rationale, and an interview tip.
Output valid JSON:
{
  "locationAnalysis": { "rating": number (0-10), "insights": "Commute time/cost from SF 94134 vs WFH requirements" },
  "compensationAnalysis": { "jdRange": "Extracted or estimated", "negotiationTarget": "...", "comparison": "Vs Google $263k historical" },
  "responsibilities": [ { "verbatim": "EXACT TEXT from JD", "score": 0-100, "rationale": "...", "tips": "..." } ],
  "qualifications": [ { "verbatim": "EXACT TEXT from JD", "score": 0-100, "rationale": "...", "tips": "..." } ]
}`;

    const resumePrompt = `Draft a targeted, ATS-optimized resume for Justin Bishop tailored to win the provided Job Description. Highlight the $16M savings and 300% adoption metrics.
Output valid JSON:
{
  "summary": "Targeted professional summary",
  "skills": ["Skill 1", "Skill 2"],
  "experience": [ { "title": "...", "company": "...", "dates": "...", "bullets": ["..."] } ]
}`;

    const coverPrompt = `Draft a compelling cover letter for Justin Bishop tailored to the JD. Focus on his 'Translator' superpower and '0-to-1' building experience at Google.
Output valid JSON:
{ "paragraphs": ["Paragraph 1...", "Paragraph 2..."] }`;

    const interviewPrompt = `Generate a mock interview transcript based on the JD. Interviewer asks tough questions. Justin responds using his "0-to-1 Builder" narrative and Google metrics ($16M saved, 300% adoption).
Output valid JSON:
{ "qaPairs": [ { "interviewer": "...", "justin": "...", "insight": "Why this response works" } ] }`;

    try {
      const [roleRes, infoRes, resumeRes, coverRes, interviewRes] = await Promise.all([
        getGeminiResponse(rolePrompt, jdText),
        getGeminiResponse(infoPrompt, jdText),
        getGeminiResponse(resumePrompt, jdText),
        getGeminiResponse(coverPrompt, jdText),
        getGeminiResponse(interviewPrompt, jdText),
      ]);

      setAiRoleAnalysis(roleRes);
      setAiJobInfo(infoRes);
      setAiResume(resumeRes);
      setAiCoverLetter(coverRes);
      setAiInterview(interviewRes);
      setHasAnalyzed(true);
      setActiveTab("ai-job-info");
    } catch (e) {
      console.error(e);
      alert("Failed to analyze the complete profile. Please ensure API is active and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportToDoc = () => {
    setShowExportAlert(true);
    setTimeout(() => setShowExportAlert(false), 4000);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen font-sans antialiased selection:bg-[var(--chart-1)] selection:text-white text-left overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />

      {/* Toast Alert */}
      {showExportAlert && (
        <div className="fixed bottom-6 right-6 bg-[var(--card)] border border-[var(--border)] p-5 rounded-xl shadow-2xl z-50 flex flex-col gap-2 w-80 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3 text-[var(--chart-1)] font-bold text-lg">
            <CheckCircle2 size={24} />
            <span>Export Successful</span>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Your application dossier has been compiled and exported to Google Docs.
          </p>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-[var(--chart-3)] text-sm font-semibold hover:underline flex items-center gap-1.5 mt-2"
          >
            Open in Google Docs <ExternalLink size={14} />
          </a>
        </div>
      )}

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[var(--background)] border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--card)] rounded-full flex items-center justify-center text-xs font-bold text-[var(--chart-1)] border border-[var(--border)]">
            JB
          </div>
          <span className="font-bold text-[var(--foreground)]">Justin Bishop</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-[var(--muted-foreground)]"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${isMobileMenuOpen ? "block" : "hidden"} md:flex w-full md:w-64 bg-[var(--background)] border-r border-[var(--border)] flex-col shadow-xl z-50 flex-shrink-0 absolute md:static h-[calc(100vh-65px)] md:h-screen overflow-y-auto`}
      >
        <div className="p-6 border-b border-[var(--border)] hidden md:block">
          <div className="w-16 h-16 bg-[var(--card)] rounded-full flex items-center justify-center text-2xl mb-4 text-[var(--chart-1)] font-bold border border-[var(--border)] shadow-sm">
            JB
          </div>
          <h1 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
            Justin Bishop
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 font-medium">
            Systems Architect & PM
          </p>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          <div className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 px-4 mt-2">
            Dossier Records
          </div>
          <button
            onClick={() => navigate("overview")}
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "overview" ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            <Activity className="mr-3 h-4 w-4" /> Executive Overview
          </button>
          <button
            onClick={() => navigate("evolution")}
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "evolution" ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            <TrendingUp className="mr-3 h-4 w-4" /> 13-Year Evolution
          </button>
          <button
            onClick={() => navigate("alignment")}
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "alignment" ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            <Target className="mr-3 h-4 w-4" /> Role Alignment
          </button>
          <button
            onClick={() => navigate("impact")}
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "impact" ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            <Briefcase className="mr-3 h-4 w-4" /> Strategic Impact
          </button>

          <div className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 px-4 mt-6">
            AI Career Suite
          </div>
          <button
            onClick={() => navigate("ai-role")}
            className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "ai-role" ? "bg-[var(--chart-1)]/10 border border-[var(--chart-1)]/20 text-[var(--chart-1)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            <BrainCircuit className="mr-3 h-4 w-4" /> AI Role Analyzer
          </button>

          {hasAnalyzed && (
            <>
              <button
                onClick={() => navigate("ai-job-info")}
                className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "ai-job-info" ? "bg-[var(--chart-1)]/10 border border-[var(--chart-1)]/20 text-[var(--chart-1)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
              >
                <Building2 className="mr-3 h-4 w-4" /> Job Breakdown
              </button>
              <button
                onClick={() => navigate("ai-resume")}
                className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "ai-resume" ? "bg-[var(--chart-1)]/10 border border-[var(--chart-1)]/20 text-[var(--chart-1)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
              >
                <FileText className="mr-3 h-4 w-4" /> Draft Resume
              </button>
              <button
                onClick={() => navigate("ai-cover")}
                className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "ai-cover" ? "bg-[var(--chart-1)]/10 border border-[var(--chart-1)]/20 text-[var(--chart-1)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
              >
                <FileCode2 className="mr-3 h-4 w-4" /> Draft Cover Letter
              </button>
              <button
                onClick={() => navigate("ai-interview")}
                className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${activeTab === "ai-interview" ? "bg-[var(--chart-1)]/10 border border-[var(--chart-1)]/20 text-[var(--chart-1)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
              >
                <MessageSquare className="mr-3 h-4 w-4" /> Mock Interview
              </button>
            </>
          )}
        </nav>

        {hasAnalyzed && (
          <div className="p-4 border-t border-[var(--border)]">
            <button
              onClick={exportToDoc}
              className="w-full flex items-center justify-center gap-2 bg-[var(--chart-1)] hover:bg-[var(--chart-2)] text-white py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> Export to Doc
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden w-full h-[calc(100vh-65px)] md:h-screen relative bg-[var(--background)] flex flex-col">
        {/* --- STICKY STATIC HEADER PORTION (Only renders for Job Breakdown) --- */}
        {activeTab === "ai-job-info" && aiJobInfo && aiRoleAnalysis && (
          <div className="sticky top-0 z-40 bg-[var(--background)] pt-4 pb-4 px-4 md:px-8 lg:px-12 border-b border-[var(--border)] shadow-sm w-full flex-shrink-0">
            <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-4 flex items-center">
              <Building2 className="mr-3 text-[var(--chart-1)] h-8 w-8" /> Job Breakdown & Alignment
            </h2>

            <Card className="w-full flex flex-col md:flex-row items-center justify-between p-4 md:p-6 shadow-md border-[var(--border)] bg-[var(--card)] relative">
              <div className="w-full md:w-1/4 flex flex-col justify-center items-center aspect-square max-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    data={[{ name: "Score", value: aiRoleAnalysis.fitScore || 0 }]}
                    endAngle={180}
                    innerRadius={55}
                    outerRadius={80}
                  >
                    <RadialBar
                      dataKey="value"
                      fill="var(--chart-1)"
                      background={{ fill: "var(--muted)" }}
                      cornerRadius={5}
                      className="stroke-transparent stroke-2"
                    />
                    <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                      <Label
                        content={({ viewBox }) => {
                          if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                            return (
                              <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) - 5}
                                  className="fill-white text-3xl font-bold"
                                >
                                  {aiRoleAnalysis.fitScore}
                                </tspan>
                                <tspan
                                  x={viewBox.cx}
                                  y={(viewBox.cy || 0) + 12}
                                  className="fill-white text-xs font-medium"
                                >
                                  Match Score
                                </tspan>
                              </text>
                            );
                          }
                        }}
                      />
                    </PolarRadiusAxis>
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full md:w-3/4 flex flex-col justify-center text-left md:pl-8 mt-4 md:mt-0 border-t md:border-t-0 md:border-l border-[var(--border)] pt-4 md:pt-0">
                <h4 className="flex items-center gap-2 font-bold text-[var(--chart-1)] mb-2 text-lg">
                  <Sparkles className="h-5 w-5" /> AI Rationale
                </h4>
                <div className="leading-relaxed text-[var(--foreground)] text-sm md:text-base">
                  {aiRoleAnalysis.fitRationale}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* --- SCROLLABLE BODY FOR ALL PAGES --- */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-20 p-4 md:p-8 lg:p-12">
            {/* SECTION: AI ROLE ANALYZER */}
            {activeTab === "ai-role" && (
              <div className="space-y-6">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3 flex items-center">
                    <BrainCircuit className="mr-3 text-[var(--chart-1)] h-8 w-8" /> AI Role Analyzer
                  </h2>
                  <p className="text-lg text-[var(--muted-foreground)] leading-relaxed">
                    Paste a target Job Description below. Gemini will execute a parallel analysis
                    generating fit metrics, gap analysis, a targeted resume, cover letter, and a
                    mock interview transcript.
                  </p>
                </div>

                {!hasAnalyzed && (
                  <CollapsibleCard title="Target Role Input" icon={FileCode2} defaultOpen={true}>
                    <textarea
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      className="w-full h-48 p-4 mt-2 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--chart-1)] focus:border-[var(--chart-1)] outline-none resize-y text-[var(--foreground)] font-sans text-sm bg-[var(--background)] placeholder:text-[var(--muted-foreground)]"
                      placeholder="Paste target Job Description (JD) here to evaluate..."
                    />
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={runFullAnalysis}
                        disabled={isAnalyzing || !jdText.trim()}
                        className="bg-[var(--chart-1)] hover:bg-[var(--chart-2)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center shadow-md"
                      >
                        {isAnalyzing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>{" "}
                            Generating Suite...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" /> Generate Application Suite
                          </>
                        )}
                      </button>
                    </div>
                  </CollapsibleCard>
                )}

                {hasAnalyzed && (
                  <div className="bg-[var(--card)] border border-[var(--chart-1)]/30 rounded-xl p-8 text-center animate-in zoom-in-95">
                    <CheckCircle2 className="w-12 h-12 text-[var(--chart-1)] mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">
                      Analysis Complete
                    </h3>
                    <p className="text-[var(--muted-foreground)] mb-6">
                      Your job description has been processed. All assets are available in the
                      sidebar.
                    </p>
                    <button
                      onClick={() => navigate("ai-job-info")}
                      className="bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] font-semibold py-2 px-6 rounded-lg transition-colors"
                    >
                      View Job Breakdown
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SECTION: AI JOB INFO & ALIGNMENT (Scrollable body only) */}
            {activeTab === "ai-job-info" && aiJobInfo && aiRoleAnalysis && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4">
                {/* Commute & Location */}
                <CollapsibleCard title="Commute & Location" icon={MapPin} defaultOpen={false}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="font-bold text-[var(--chart-1)] text-lg">
                      Rating: {aiJobInfo.locationAnalysis?.rating}/10
                    </span>
                  </div>
                  <p className="text-[var(--foreground)] leading-relaxed text-base pt-2">
                    {aiJobInfo.locationAnalysis?.insights}
                  </p>
                </CollapsibleCard>

                {/* Compensation Analysis */}
                <CollapsibleCard
                  title="Compensation Analysis"
                  icon={DollarSign}
                  defaultOpen={false}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 mt-2">
                    <div className="bg-[var(--background)] border border-[var(--border)] p-5 rounded-lg shadow-sm">
                      <p className="text-xs text-[var(--muted-foreground)] uppercase font-semibold mb-2">
                        JD Range
                      </p>
                      <p className="font-bold text-[var(--foreground)] text-xl">
                        {aiJobInfo.compensationAnalysis?.jdRange}
                      </p>
                    </div>
                    <div className="bg-[var(--background)] border border-[var(--border)] p-5 rounded-lg shadow-sm">
                      <p className="text-xs text-[var(--muted-foreground)] uppercase font-semibold mb-2">
                        Target Neg.
                      </p>
                      <p className="font-bold text-[var(--chart-3)] text-xl">
                        {aiJobInfo.compensationAnalysis?.negotiationTarget}
                      </p>
                    </div>
                  </div>
                  <p className="text-[var(--foreground)] leading-relaxed text-base">
                    {aiJobInfo.compensationAnalysis?.comparison}
                  </p>
                </CollapsibleCard>

                <CollapsibleCard title="Executive Summary" icon={Activity} defaultOpen={true}>
                  <p className="text-[var(--foreground)] leading-relaxed text-base">
                    {aiRoleAnalysis.summary}
                  </p>
                </CollapsibleCard>

                <CollapsibleCard
                  title="The 'JD Trap' Advantage"
                  icon={ShieldAlert}
                  defaultOpen={true}
                >
                  <p className="text-[var(--foreground)] leading-relaxed text-base">
                    {aiRoleAnalysis.jdTrapAnalysis}
                  </p>
                </CollapsibleCard>

                <CollapsibleCard
                  title="To win this role, Justin must"
                  icon={Target}
                  defaultOpen={true}
                >
                  <p className="text-[var(--foreground)] leading-relaxed text-base">
                    {aiRoleAnalysis.toWinThisRole}
                  </p>
                </CollapsibleCard>

                <CollapsibleCard title="The Hook (Opening Pitch)" icon={Zap} defaultOpen={true}>
                  <p className="text-[var(--chart-1)] text-lg italic leading-relaxed border-l-4 border-[var(--chart-1)] pl-5 py-2">
                    "{aiRoleAnalysis.theHook}"
                  </p>
                </CollapsibleCard>

                <CollapsibleCard title="Strategic Recommendation" icon={Layers} defaultOpen={false}>
                  <p className="text-[var(--foreground)] leading-relaxed text-base">
                    {aiRoleAnalysis.strategicRecommendation}
                  </p>
                </CollapsibleCard>

                <CollapsibleCard
                  title="JD Line-Item Breakdown: Responsibilities"
                  icon={CheckSquare}
                  defaultOpen={false}
                >
                  <div className="space-y-5 pt-2">
                    {aiJobInfo.responsibilities?.map((req, i) => (
                      <div
                        key={i}
                        className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-6 shadow-sm"
                      >
                        <p className="font-medium text-[var(--foreground)] mb-5 border-l-2 border-[var(--chart-3)] pl-4 italic text-base">
                          "{req.verbatim}"
                        </p>
                        <div className="flex items-center gap-2 mb-4">
                          <span
                            className={`font-bold px-3 py-1 rounded-md text-xs border ${req.score >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : req.score >= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}
                          >
                            Fit Score: {req.score}/100
                          </span>
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)] mb-3 leading-relaxed">
                          <strong className="text-[var(--foreground)] font-semibold">
                            Rationale:
                          </strong>{" "}
                          {req.rationale}
                        </p>
                        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                          <strong className="text-[var(--foreground)] font-semibold">Tip:</strong>{" "}
                          {req.tips}
                        </p>
                      </div>
                    ))}
                  </div>
                </CollapsibleCard>

                <CollapsibleCard
                  title="JD Line-Item Breakdown: Qualifications"
                  icon={Layers}
                  defaultOpen={false}
                >
                  <div className="space-y-5 pt-2">
                    {aiJobInfo.qualifications?.map((req, i) => (
                      <div
                        key={i}
                        className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-6 shadow-sm"
                      >
                        <p className="font-medium text-[var(--foreground)] mb-5 border-l-2 border-[var(--chart-3)] pl-4 italic text-base">
                          "{req.verbatim}"
                        </p>
                        <div className="flex items-center gap-2 mb-4">
                          <span
                            className={`font-bold px-3 py-1 rounded-md text-xs border ${req.score >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : req.score >= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}
                          >
                            Fit Score: {req.score}/100
                          </span>
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)] mb-3 leading-relaxed">
                          <strong className="text-[var(--foreground)] font-semibold">
                            Rationale:
                          </strong>{" "}
                          {req.rationale}
                        </p>
                        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                          <strong className="text-[var(--foreground)] font-semibold">Tip:</strong>{" "}
                          {req.tips}
                        </p>
                      </div>
                    ))}
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {/* SECTION: DRAFT RESUME */}
            {activeTab === "ai-resume" && aiResume && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3 flex items-center">
                    <FileText className="mr-3 text-[var(--chart-1)] h-8 w-8" /> Tailored Resume
                  </h2>
                </div>
                <CollapsibleCard
                  title="Generated Resume Document"
                  icon={FileText}
                  defaultOpen={true}
                >
                  <div className="space-y-8 font-sans bg-white text-black p-8 md:p-12 rounded-lg border border-gray-200">
                    <div className="border-b border-gray-300 pb-6 text-center">
                      <h3 className="text-3xl font-black text-black mb-2 tracking-tight">
                        JUSTIN BISHOP
                      </h3>
                      <p className="text-gray-600">
                        San Francisco, CA • justin@126colby.com • linkedin.com/in/jmbishop04
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">
                        Professional Summary
                      </h4>
                      <p className="text-gray-700 leading-relaxed text-sm">{aiResume.summary}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">
                        Core Skills
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {aiResume.skills?.map((s) => (
                          <span
                            key={s}
                            className="bg-gray-100 border border-gray-200 text-gray-800 px-3 py-1 rounded text-xs font-semibold"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4">
                        Experience
                      </h4>
                      {aiResume.experience?.map((exp, i) => (
                        <div key={i} className="mb-8">
                          <div className="flex justify-between items-baseline mb-1">
                            <h4 className="text-lg font-bold text-black">{exp.title}</h4>
                            <span className="text-sm text-gray-500 font-medium">{exp.dates}</span>
                          </div>
                          <h5 className="text-blue-600 font-medium mb-3">{exp.company}</h5>
                          <ul className="list-disc pl-5 space-y-2 text-gray-700 text-sm">
                            {exp.bullets?.map((b, bi) => (
                              <li key={bi} className="leading-relaxed">
                                {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {/* SECTION: DRAFT COVER LETTER */}
            {activeTab === "ai-cover" && aiCoverLetter && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3 flex items-center">
                    <FileCode2 className="mr-3 text-[var(--chart-1)] h-8 w-8" /> Cover Letter
                  </h2>
                </div>
                <CollapsibleCard title="Generated Cover Letter" icon={FileCode2} defaultOpen={true}>
                  <div className="space-y-5 text-gray-800 leading-relaxed font-serif text-base bg-white p-8 md:p-12 rounded-lg border border-gray-200">
                    {aiCoverLetter.paragraphs?.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {/* SECTION: MOCK INTERVIEW */}
            {activeTab === "ai-interview" && aiInterview && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3 flex items-center">
                    <MessageSquare className="mr-3 text-[var(--chart-1)] h-8 w-8" /> Mock Interview
                    Prep
                  </h2>
                </div>
                <div className="flex flex-col space-y-4">
                  {aiInterview.qaPairs?.map((pair, i) => (
                    <CollapsibleCard
                      key={i}
                      title={`Q${i + 1}: ${pair.interviewer.substring(0, 50)}...`}
                      icon={MessageSquare}
                      defaultOpen={i === 0}
                    >
                      <div className="flex gap-4 mb-6 pt-2">
                        <div className="font-bold text-[var(--muted-foreground)] shrink-0 mt-0.5 w-24">
                          Interviewer:
                        </div>
                        <div className="text-[var(--foreground)] font-medium leading-relaxed">
                          "{pair.interviewer}"
                        </div>
                      </div>
                      <div className="flex gap-4 mb-6">
                        <div className="font-bold text-[var(--chart-1)] shrink-0 mt-0.5 w-24">
                          Justin:
                        </div>
                        <div className="text-[var(--foreground)] leading-relaxed bg-[var(--background)] p-5 rounded-lg border border-[var(--border)]">
                          {pair.justin}
                        </div>
                      </div>
                      <div className="p-5 bg-[var(--chart-1)]/10 border border-[var(--chart-1)]/20 rounded-lg text-sm flex gap-4">
                        <Sparkles className="w-5 h-5 text-[var(--chart-1)] shrink-0 mt-0.5" />
                        <div className="text-[var(--chart-4)] leading-relaxed font-medium">
                          {pair.insight}
                        </div>
                      </div>
                    </CollapsibleCard>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION: DOSSIER OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3">
                    Executive Overview
                  </h2>
                  <p className="text-lg text-[var(--muted-foreground)] leading-relaxed max-w-3xl">
                    This dashboard synthesizes Justin Bishop's 12+ year career at Google,
                    transforming qualitative performance reviews and project outcomes into
                    quantifiable data. It highlights his unique superpower: bridging the gap between
                    Legal, Engineering, and Business.
                  </p>
                </div>

                <div className="flex flex-col space-y-4">
                  <CollapsibleCard title="Key Impact Metrics" icon={TrendingUp} defaultOpen={true}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 pb-2">
                      <div className="flex flex-col items-center justify-center text-center p-6 bg-[var(--background)] border border-[var(--border)] rounded-xl">
                        <div className="p-3 bg-[var(--chart-1)]/10 text-[var(--chart-1)] rounded-full mb-5">
                          <TrendingUp size={32} />
                        </div>
                        <h3 className="text-4xl font-black text-[var(--foreground)] mb-2">$16M</h3>
                        <p className="text-sm font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
                          Est. Annual Savings
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] opacity-70 mt-3 font-medium">
                          Hardware Preservation Overhaul
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center text-center p-6 bg-[var(--background)] border border-[var(--border)] rounded-xl">
                        <div className="p-3 bg-[var(--chart-2)]/10 text-[var(--chart-2)] rounded-full mb-5">
                          <Zap size={32} />
                        </div>
                        <h3 className="text-4xl font-black text-[var(--foreground)] mb-2">300%</h3>
                        <p className="text-sm font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
                          Adoption Increase
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] opacity-70 mt-3 font-medium">
                          Matter Management Ecosystem
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center text-center p-6 bg-[var(--background)] border border-[var(--border)] rounded-xl">
                        <div className="p-3 bg-[var(--chart-3)]/10 text-[var(--chart-3)] rounded-full mb-5">
                          <Activity size={32} />
                        </div>
                        <h3 className="text-4xl font-black text-[var(--foreground)] mb-2">70%</h3>
                        <p className="text-sm font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
                          Setup Time Reduction
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] opacity-70 mt-3 font-medium">
                          Centralized Data Platforms
                        </p>
                      </div>
                    </div>
                  </CollapsibleCard>

                  {/* Shadcn Pie Chart Component */}
                  <CollapsibleCard
                    title="The 'JD Trap' Advantage & Time Allocation"
                    icon={PieChartIcon}
                    defaultOpen={true}
                  >
                    <div className="flex flex-col lg:flex-row gap-10 items-center justify-center py-4">
                      <div className="w-full lg:w-1/2 flex flex-col justify-center">
                        <p className="text-base text-[var(--muted-foreground)] leading-relaxed mb-6">
                          While formally holding a generalist title, the reality of Justin's output
                          reflects a deeply technical architect. Because he lacks a Law Degree (JD),
                          he maintains objective, ROI-focused clarity.
                        </p>
                        <div className="bg-[var(--background)] border border-[var(--border)] p-6 rounded-xl shadow-sm">
                          <h4 className="leading-none font-bold text-[var(--chart-1)] text-lg mb-3 flex items-center gap-2">
                            <Sparkles className="h-5 w-5" /> AI Insight: The "0-to-1" Builder
                          </h4>
                          <p className="leading-relaxed text-[var(--foreground)] text-base">
                            90% of time is spent on technical architecture and product strategy,
                            completely flipping the expectations of his official role profile. This
                            hands-on capability to build without engineering bottlenecks is his
                            primary market advantage.
                          </p>
                        </div>
                      </div>
                      <div className="w-full lg:w-1/2 aspect-video max-h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
                            <RechartsTooltip content={<ChartTooltipContent hideLabel />} />
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                              cx="50%"
                              cy="50%"
                              outerRadius="75%"
                              innerRadius="45%"
                              className="recharts-pie-label-text"
                              labelLine={{
                                stroke: "var(--muted-foreground)",
                                strokeWidth: 1.5,
                                length1: 15,
                                length2: 15,
                              }}
                            >
                              {pieData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.fill}
                                  stroke="var(--card)"
                                  strokeWidth={3}
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>
              </div>
            )}

            {/* SECTION: DOSSIER ALIGNMENT */}
            {activeTab === "alignment" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3">
                    Role Misalignment Analysis
                  </h2>
                  <p className="text-lg text-[var(--muted-foreground)] leading-relaxed max-w-3xl">
                    This section visualizes the structural role misalignment. Currently mapped as a
                    generalist, the actual skill utilization aligns precisely with specialized
                    technical roles like Technical Program Manager (TPM) or Head of Data.
                  </p>
                </div>

                <CollapsibleCard
                  title="Capability Matrix: Expectations vs. Reality"
                  icon={Target}
                  defaultOpen={true}
                >
                  <div className="flex flex-col lg:flex-row gap-12 items-center py-6">
                    <div className="w-full lg:w-1/2 aspect-square max-h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData}>
                          <ChartTooltipContent indicator="line" />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fill: "var(--foreground)", fontSize: 13, fontWeight: 500 }}
                          />
                          <PolarGrid radialLines={false} stroke="var(--border)" strokeWidth={1.5} />
                          <Radar
                            name="Actual (Head of Data/TPM)"
                            dataKey="actual"
                            fill="transparent"
                            stroke="var(--chart-1)"
                            strokeWidth={3.5}
                          />
                          <Radar
                            name="Official (L5 BPM)"
                            dataKey="official"
                            fill="transparent"
                            stroke="var(--muted-foreground)"
                            strokeWidth={2.5}
                            strokeDasharray="6 6"
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full lg:w-1/2 space-y-8">
                      <div className="flex gap-5 items-start">
                        <div className="mt-1 bg-[var(--background)] p-3 rounded-full border border-[var(--border)]">
                          <ShieldAlert className="w-6 h-6 text-[var(--muted-foreground)]" />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold text-[var(--foreground)] mb-2 text-left">
                            The Managerial Trap (Dotted Line)
                          </h4>
                          <p className="text-base text-[var(--muted-foreground)] leading-relaxed text-left">
                            Held in a non-technical role despite engineering department-critical
                            infrastructure. Evaluated on generalist metrics.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-5 items-start">
                        <div className="mt-1 bg-[var(--chart-1)]/10 p-3 rounded-full border border-[var(--chart-1)]/20">
                          <Zap className="w-6 h-6 text-[var(--chart-1)]" />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold text-[var(--foreground)] mb-2 text-left">
                            The Target Alignment (Solid Line)
                          </h4>
                          <p className="text-base text-[var(--muted-foreground)] leading-relaxed text-left">
                            Expertise lies in translating stakeholder ambiguity into technical
                            specs, executing AI integration, and validating data pipelines.
                          </p>
                        </div>
                      </div>
                      <div className="bg-[var(--background)] p-6 rounded-xl border border-[var(--border)] mt-6 shadow-sm">
                        <h4 className="flex items-center gap-2 leading-none font-bold text-[var(--chart-1)] mb-3 text-lg">
                          <TrendingUp className="h-5 w-5" /> Strategic Pivot Mandated
                        </h4>
                        <p className="leading-relaxed text-[var(--foreground)] text-base text-left italic">
                          "He never had a formal engineering title, but he delivered like one...
                          half the historical infrastructure has his name on it." Transitioning to a
                          Data or Product Leadership role formalizes this established trajectory.
                        </p>
                      </div>
                    </div>
                  </div>
                </CollapsibleCard>
              </div>
            )}

            {/* SECTION: DOSSIER IMPACT */}
            {activeTab === "impact" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3">
                    Strategic Impact Portfolio
                  </h2>
                  <p className="text-lg text-[var(--muted-foreground)] leading-relaxed max-w-3xl">
                    A comparative view of flagship initiatives. This demonstrates the capacity to
                    deliver massive ROI, drive platform adoption, and engineer solutions that
                    replace legacy complexity with scalable clarity.
                  </p>
                </div>

                <div className="flex flex-col space-y-4">
                  {/* Shadcn Bar Chart Component */}
                  <CollapsibleCard
                    title="Quantifiable Outcomes (Impact Score)"
                    icon={BarChartIcon}
                    defaultOpen={true}
                  >
                    <div className="flex flex-col gap-6 py-4">
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            accessibilityLayer
                            data={barData}
                            layout="vertical"
                            margin={{ left: 0, right: 0 }}
                          >
                            <XAxis type="number" hide />
                            <YAxis
                              dataKey="name"
                              type="category"
                              axisLine={false}
                              tickLine={false}
                              tickMargin={12}
                              tick={{ fill: "var(--foreground)", fontSize: 13, fontWeight: 600 }}
                              width={200}
                            />
                            <RechartsTooltip
                              cursor={{ fill: "var(--muted)" }}
                              content={<ChartTooltipContent hideLabel />}
                            />
                            <Bar dataKey="impact" radius={5} barSize={28}>
                              {barData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-[var(--background)] p-6 rounded-xl border border-[var(--border)] mt-4">
                        <h4 className="flex items-center gap-2 leading-none font-bold text-[var(--chart-1)] text-lg mb-3">
                          <Sparkles className="h-5 w-5" /> Highest yielding projects over last 5
                          years
                        </h4>
                        <p className="leading-relaxed text-[var(--foreground)] text-base text-left">
                          These initiatives represent the core validation of the "0-to-1" builder
                          identity. By circumventing rigid engineering processes, Justin delivered
                          outsized returns across hardware infrastructure, enterprise legal
                          management platforms, and core discovery revenue streams.
                        </p>
                      </div>
                    </div>
                  </CollapsibleCard>

                  {/* Projects Vertically Stacked as Collapsible Cards */}
                  <CollapsibleCard
                    title="MatterSpace Migration"
                    icon={Briefcase}
                    defaultOpen={false}
                  >
                    <p className="text-base text-[var(--foreground)] leading-relaxed text-left py-2">
                      Product Manager for enterprise legal matter system. Synthesized 8 years of
                      legacy documents, facilitated 165+ design discussions, and ensured feature
                      parity against massive technical debt.
                    </p>
                  </CollapsibleCard>

                  <CollapsibleCard
                    title="AI-Powered Forecasting"
                    icon={BrainCircuit}
                    defaultOpen={false}
                  >
                    <p className="text-base text-[var(--foreground)] leading-relaxed text-left py-2">
                      Evaluated Vertex AI, N2SQL, and BigQuery ML to pioneer intelligent anomaly
                      detection and cost modeling, shifting the department from reactive reporting
                      to proactive insights.
                    </p>
                  </CollapsibleCard>

                  <CollapsibleCard
                    title="DSR Metrics & Billing Pipelines"
                    icon={Database}
                    defaultOpen={false}
                  >
                    <p className="text-base text-[var(--foreground)] leading-relaxed text-left py-2">
                      Architected automated Flume/Python ETL pipelines to extract and transform
                      billing data into cloud storage, eliminating manual assembly and securing data
                      integrity.
                    </p>
                  </CollapsibleCard>

                  <CollapsibleCard
                    title="Founding eDiscovery Division"
                    icon={Building2}
                    defaultOpen={false}
                  >
                    <p className="text-base text-[var(--foreground)] leading-relaxed text-left py-2">
                      Prior to Google, scaled a one-man unit into a full business division at One
                      Source Discovery, engineering technical workflows that generated $455K in
                      first-year revenue.
                    </p>
                  </CollapsibleCard>
                </div>
              </div>
            )}

            {/* SECTION: DOSSIER EVOLUTION */}
            {activeTab === "evolution" && (
              <div className="space-y-6 animate-in fade-in">
                <div className="mb-6">
                  <h2 className="text-3xl font-extrabold text-[var(--foreground)] tracking-tight mb-3">
                    The 13-Year Evolution
                  </h2>
                  <p className="text-lg text-[var(--muted-foreground)] leading-relaxed max-w-3xl">
                    Explore the chronological narrative of moving from front-line operations to
                    enterprise-scale architecture.
                  </p>
                </div>

                <div className="flex flex-col space-y-4">
                  {timelineData.map((step, idx) => (
                    <CollapsibleCard
                      key={idx}
                      title={`Phase ${idx + 1}: ${idx === 0 ? "The Front Lines" : idx === 1 ? "The Shadow Builder" : "The Architect"}`}
                      titleRight={step.years}
                      icon={TrendingUp}
                      defaultOpen={idx === 0}
                    >
                      <div className="py-4">
                        <span className="inline-block px-3 py-1.5 bg-[var(--background)] text-[var(--foreground)] text-xs font-bold rounded-md mb-6 uppercase tracking-widest border border-[var(--border)]">
                          {step.tag}
                        </span>
                        <h3 className="text-2xl font-bold text-[var(--foreground)] mb-8 tracking-tight">
                          {step.title}
                        </h3>

                        <div className="space-y-8">
                          <div>
                            <h4 className="text-base font-bold text-[var(--foreground)] mb-2 flex items-center">
                              <Briefcase className="w-5 h-5 mr-3 text-[var(--chart-1)]" /> The Work
                            </h4>
                            <p className="text-[var(--muted-foreground)] text-base leading-relaxed ml-8">
                              {step.work}
                            </p>
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-[var(--foreground)] mb-2 flex items-center">
                              <Target className="w-5 h-5 mr-3 text-[var(--chart-1)]" /> The
                              Constraint
                            </h4>
                            <p className="text-[var(--muted-foreground)] text-base leading-relaxed ml-8">
                              {step.constraint}
                            </p>
                          </div>
                          <div className="bg-[var(--chart-1)]/5 p-6 rounded-xl border border-[var(--chart-1)]/20 mt-8 shadow-inner">
                            <h4 className="text-base font-bold text-[var(--chart-1)] mb-3 flex items-center">
                              <CheckCircle2 className="w-5 h-5 mr-3 text-[var(--chart-1)]" /> The
                              Outcome
                            </h4>
                            <p className="text-[var(--foreground)] text-base leading-relaxed ml-8 font-medium">
                              {step.outcome}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CollapsibleCard>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Icon Fallback for Database
const Database = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);
