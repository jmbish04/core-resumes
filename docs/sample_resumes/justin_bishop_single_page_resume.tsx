import React, { useEffect } from 'react';
import { Mail, Phone, Linkedin, MapPin, Briefcase, GitBranch, CheckSquare, GraduationCap, Award, TrendingUp } from 'lucide-react';

export default function Resume() {
  // Ensure the body has the right background color when viewing on screen
  useEffect(() => {
    document.body.className = 'bg-slate-100 print:bg-white';
  }, []);

  return (
    <div className="min-h-screen py-8 print:py-0 font-sans text-slate-800 selection:bg-brand-100 selection:text-brand-900 flex justify-center">
      {/* 
        The main container is styled to look like an 8.5x11 piece of paper on screen, 
        and expands to full native dimensions during print. 
      */}
      <div className="w-full max-w-[850px] bg-white shadow-2xl print:shadow-none print:w-full print:max-w-none print:m-0 overflow-hidden">
        
        {/* HEADER */}
        {}
        <header className="px-10 pt-10 pb-6 border-b border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="space-y-1.5">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Justin Michael Bishop</h1>
              <p className="text-xl font-semibold text-blue-700">Senior Product Manager — AI & Data Platforms</p>
            </div>
            
            <div className="flex flex-col text-xs text-slate-600 font-medium space-y-1.5 md:items-end">
              <a href="mailto:justin@126colby.com" className="flex items-center gap-2 hover:text-blue-700">
                <span>justin@126colby.com</span>
                <Mail className="w-3.5 h-3.5 text-slate-400" />
              </a>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">(415) 658-2389</span>
                <Phone className="w-3.5 h-3.5 text-slate-400" />
              </span>
              <a href="https://linkedin.com/in/jmbishop04" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-blue-700">
                <span>linkedin.com/in/jmbishop04</span>
                <Linkedin className="w-3.5 h-3.5 text-slate-400" />
              </a>
              <div className="flex items-start gap-2 pt-0.5">
                <div className="text-right leading-tight">
                  <span className="block text-slate-800 font-semibold">San Francisco, CA</span>
                  <span className="block text-[10px] text-slate-500 italic">Open to Remote / Hybrid</span>
                </div>
                <MapPin className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
              </div>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT GRID */}
        {}
        <div className="px-10 py-6 grid grid-cols-1 md:grid-cols-3 gap-8 print:grid-cols-3 print:gap-8">
          
          {/* LEFT COLUMN (2/3 width) - Experience & Projects */}
          <div className="md:col-span-2 print:col-span-2 space-y-6">
            
            {/* SUMMARY */}
            <section>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-1">
                Professional Summary
              </h2>
              <p className="text-[13px] text-slate-700 leading-relaxed font-medium">
                Product-minded program leader with 12+ years at Google translating technical complexity into streamlined internal platforms. Specializes in transforming administrative legacy systems into automated, data-driven ecosystems using AI and low-code infrastructure. Renowned for shipping production-ready systems, bridging legal and engineering domains, and driving platform-critical solutions without formal engineering support.
              </p>
            </section>

            {/* EXPERIENCE */}
            {}
            <section>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-blue-700" /> Professional Experience
              </h2>
              
              <div className="space-y-4">
                {/* Google */}
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">Google</h3>
                      <p className="text-[11px] font-bold text-blue-700">Business Program Manager III (Platform & Data Product Owner)</p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded shrink-0">2013 – 2025</span>
                  </div>
                  <ul className="mt-2 text-[12px] text-slate-700 space-y-2 list-disc pl-4 leading-snug font-medium">
                    <li><strong>Product Leadership (MatterSpace):</strong> Co-authored initial intake workflows and designed 2-year feature roadmaps; facilitated 165+ specification workshops spanning Engineering, Operations, and Legal stakeholders to secure executive consensus.</li>
                    <li><strong>Data Pipeline Optimization:</strong> Re-architected a legacy 12+ year old database pipeline using Python, Cloud SQL, BigQuery, and Flume, significantly improving ingestion accuracy and executive telemetry visibility.</li>
                    <li><strong>AI & Low-Code Workflows:</strong> Streamlined corporate operations by building custom Apps Script infrastructure ('Spitz') and testing AI integration models, cutting average litigation-intake timelines by 86% (from 30+ mins to 4 mins).</li>
                    <li><strong>Grassroots Rebuild & Advocacy:</strong> Led an effort to redesign a legacy matter management platform via lightweight automation mockups, successfully securing dedicated engineering resources for a complete 55-engineer system overhaul.</li>
                    <li><strong>Multi-Million Dollar Efficiency:</strong> Directed a cross-functional system audit (DOTS) to standardize and localize enterprise legal holds, securing $8M to $16M in long-term operational cost-savings.</li>
                  </ul>
                </div>

                {/* One Source Discovery */}
                <div className="pt-2">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">One Source Discovery / AC Forensics</h3>
                      <p className="text-[11px] font-bold text-blue-700">eDiscovery Systems Lead (Intern to Owner)</p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded shrink-0">2010 – 2012</span>
                  </div>
                  <ul className="mt-2 text-[12px] text-slate-700 space-y-1.5 list-disc pl-4 leading-snug font-medium">
                    <li>Founded and scaled the company's first internal eDiscovery business unit, generating $455K in revenue within the launch year.</li>
                    <li>Architected forensic data retrieval systems and database layouts adopted by top-tier legal operations and forensic investigation units.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* INDEPENDENT ENGINEERING */}
            {}
            <section className="pt-2">
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-blue-700" /> Independent AI Engineering (GitHub)
              </h2>
              
              <div className="space-y-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-[12px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> mcp-memory-v3 <span className="text-[9px] font-mono font-normal text-slate-500 ml-1 bg-slate-100 px-1 rounded">TypeScript</span>
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5 font-medium leading-relaxed">
                    Built a multi-tenant, stateful Model Context Protocol (MCP) server providing long-term memory to AI agents (Claude, Cursor). Orchestrated utilizing Cloudflare Workers, D1 databases, and Cloudflare Vectorize (BGE-M3 model) for isolated semantic search.
                  </p>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-[12px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Chatbot UI Contribution <span className="text-[9px] font-mono font-normal text-slate-500 ml-1 bg-slate-100 px-1 rounded">Next.js</span>
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5 font-medium leading-relaxed">
                    Contributed core architecture upgrades upstream to the world's most popular Next.js chat layout (33K+ Stars on GitHub). Designed and implemented a decentralized, direct Cloudflare Workers edge deployment workflow.
                  </p>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-[12px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span> core-github-api <span className="text-[9px] font-mono font-normal text-slate-500 ml-1 bg-slate-100 px-1 rounded">Python</span>
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5 font-medium leading-relaxed">
                    Designed real-time event-driven collectors capturing GitHub telemetry and repository metadata hooks. Maps event patterns to predictive AI models using structured Gemini schema parameters.
                  </p>
                </div>
              </div>
            </section>

          </div>

          {/* RIGHT COLUMN (1/3 width) - Skills, Edu, Awards */}
          {}
          <div className="md:col-span-1 print:col-span-1 space-y-6">
            
            {/* PROMOTION BADGE */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center shadow-sm print:bg-white print:border-slate-300 print:shadow-none">
              <h4 className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 flex justify-center items-center gap-1">
                <TrendingUp className="w-3 h-3 text-blue-600" /> Career Trajectory
              </h4>
              <p className="text-lg font-black text-slate-900 mt-1">Promoted 4 Times</p>
              <p className="text-[10px] text-slate-600 font-medium mt-1 leading-snug">
                Consistent high-performance trajectory at Google (L2 Legal Assistant to L5 Senior Program Manager).
              </p>
            </div>

            {/* SKILLS */}
            <section>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-blue-700" /> Technical Toolbox
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Product Strategy", "Product Lifecycle", "Agile / Scrum", 
                  "SQL (BigQuery)", "Python", "Data Engineering",
                  "TypeScript / JS", "React / Next.js",
                  "RAG Architecture", "Model Context Protocol",
                  "Cloudflare Workers", "Apps Script / AppSheet",
                  "Data Validation", "Stakeholder Alignment"
                ].map(skill => (
                  <span key={skill} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[10px] font-bold border border-slate-200/60 print:border-slate-300">
                    {skill}
                  </span>
                ))}
              </div>
            </section>

            {/* EDUCATION */}
            <section>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-blue-700" /> Education
              </h2>
              <div className="space-y-3 font-medium text-slate-700">
                <div>
                  <p className="font-extrabold text-sm text-slate-900">University of Louisville</p>
                  <p className="text-[11px]">B.S. in Computer Information Systems</p>
                  <p className="text-[10px] text-slate-500 italic mt-0.5">Cum Laude • Entrepreneurship</p>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <p className="font-extrabold text-sm text-slate-900">UC Berkeley Exec. Ed.</p>
                  <p className="text-[11px] flex items-center gap-1.5 mt-0.5">
                    <span className="w-1 h-1 bg-blue-700 rounded-full"></span> Product Management Cert.
                  </p>
                  <p className="text-[11px] flex items-center gap-1.5 mt-0.5">
                    <span className="w-1 h-1 bg-blue-700 rounded-full"></span> Business Analysis Cert.
                  </p>
                </div>
              </div>
            </section>

            {/* AWARDS */}
            <section>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-blue-700" /> Recognition
              </h2>
              <ul className="text-[11px] text-slate-600 space-y-2.5 font-medium leading-snug">
                <li className="flex gap-2 items-start">
                  <span className="text-amber-500 mt-0.5 shrink-0">★</span>
                  <span><strong>40+ Google Peer & Spot Bonuses</strong> received for high-velocity tooling deployment and cross-functional leadership.</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-700 mt-0.5 shrink-0">🛡️</span>
                  <span><strong>EnCase Certified Examiner (EnCE)</strong> for advanced forensic imaging and data security analysis.</span>
                </li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}