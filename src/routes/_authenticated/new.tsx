import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { parseResume, parsePastedResume, parseJdFile, startSession, startGuesstimate } from "@/lib/interview.functions";
import casebooks from "@/lib/casebook.json";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/new")({
  component: NewInterview,
});

const DOMAINS = ["BFSI", "Consulting", "IT/ITES", "Marketing", "Custom"] as const;
const DOMAIN_ROLES_MAP: Record<string, string[]> = {
  "BFSI": [
    "Finance Transformation Consultant",
    "Finance Transformation GBS Consultant",
    "Enterprise Risk Consultant",
    "Digital Assurance (Associate – Assurance)",
    "Custom"
  ],
  "Consulting": [
    "Management Consultant, Management Consulting Analyst",
    "Business Architecture Associate Manager",
    "Customer Strategy & Applied Design Consultant",
    "Supply Chain & Network Operations Consultant",
    "Digital Risk Consultant",
    "Associate – Consulting (Advisory)",
    "Custom"
  ],
  "IT/ITES": [
    "Technology Consultant Analyst, Technology Consultant",
    "Data Management Senior Analyst",
    "Business Senior Analyst",
    "Business & System Integration Senior Analyst",
    "Associate Technical Program Manager",
    "Application & Data Modernization & Migration Consultant",
    "SAP Consultant",
    "Cyber Risk Consultant",
    "Management Trainee – Operations",
    "Emerging Solution Engineer (Pre-Sales Consulting)",
    "Custom"
  ],
  "Marketing": [
    "Advertising, Marketing & Commerce Consultant",
    "Management Trainee – Product Management",
    "Custom"
  ],
  "Custom": [
    "Custom"
  ]
};

const ROLE_COURSES_MAP: Record<string, string[]> = {
  "Management Consultant, Management Consulting Analyst": [
    "Strategic Management",
    "Digital Technology Transformation",
    "ICT Consulting",
    "Business Modeling and Planning",
    "Managerial Economics",
    "Macroeconomics for Managers",
    "Research Methodology",
    "Business Statistics",
    "Visual Analytics",
    "Generative AI Tools",
    "Supply Chain Management",
    "Internet of Things"
  ],
  "Technology Consultant Analyst, Technology Consultant": [
    "ICT Architectures and Frameworks",
    "ICT Consulting",
    "Cloud-based Solution Architecture",
    "Advanced Cloud-Based Solution Architecture",
    "Digital Technology Transformation",
    "Information Systems for Telecom Business",
    "OSS/BSS Frameworx",
    "Strategic Management",
    "Business Modeling and Planning",
    "Generative AI Tools",
    "Supply Chain Management"
  ],
  "Data Management Senior Analyst": [
    "Python for Data Science",
    "Advanced Programming in Python",
    "Data Mining for Decision Making",
    "Advanced Big Data Analytics Telecom",
    "Visual Analytics",
    "AI and ML for Business Management",
    "Governance Risk and Compliance",
    "Digital Regulations",
    "Cloud-based Solution Architecture",
    "Business Statistics"
  ],
  "Business Architecture Associate Manager": [
    "Information Systems for Telecom Business",
    "ICT Architectures and Frameworks",
    "Digital Technology Transformation",
    "Project Management",
    "Business Modeling and Planning",
    "Strategic Management",
    "Supply Chain Management",
    "Marketing Analytics and CRM",
    "Data Mining for Decision Making",
    "OSS/BSS Frameworx",
    "ICT Consulting"
  ],
  "Business Senior Analyst": [
    "Python for Data Science",
    "Advanced Programming in Python",
    "Information Systems for Telecom Business",
    "Data Mining for Decision Making",
    "Digital Technology Transformation",
    "Project Management",
    "Business Modeling and Planning",
    "Strategic Management",
    "Marketing Analytics and CRM",
    "AI and ML for Business Management",
    "Generative AI Tools"
  ],
  "Business & System Integration Senior Analyst": [
    "Information Systems for Telecom Business",
    "ICT Architectures and Frameworks",
    "Digital Technology Transformation",
    "Project Management",
    "Product Management",
    "Visual Analytics",
    "Business Modeling and Planning",
    "Strategic Management",
    "Generative AI Tools",
    "OSS/BSS Frameworx",
    "Data Mining for Decision Making"
  ],
  "Associate Technical Program Manager": [
    "Project Management",
    "Principles and Practices of Management",
    "Business Communication",
    "Strategic Management",
    "Digital Technology Transformation",
    "Information Systems for Telecom Business",
    "Generative AI Tools",
    "Business Statistics"
  ],
  "Application & Data Modernization & Migration Consultant": [
    "Python for Data Science",
    "Advanced Programming in Python",
    "Advanced Big Data Analytics Telecom",
    "Data Mining for Decision Making",
    "Cloud-based Solution Architecture",
    "Advanced Cloud-Based Solution Architecture",
    "Visual Analytics",
    "AI and ML for Business Management",
    "Applications of AI and ML in Telecom",
    "Digital Technology Transformation",
    "Information Systems for Telecom Business"
  ],
  "Customer Strategy & Applied Design Consultant": [
    "Strategic Management",
    "Digital Technology Transformation",
    "Consumer Behaviour and Insights",
    "Marketing Management",
    "Marketing Research",
    "Services Marketing",
    "Marketing Analytics and CRM",
    "Managing Pre-Sales",
    "Business Modeling and Planning",
    "ICT Consulting",
    "Data Mining for Decision Making"
  ],
  "Advertising, Marketing & Commerce Consultant": [
    "Digital Marketing",
    "E Commerce and D2C Marketing",
    "Marketing Management",
    "Marketing Analytics and CRM",
    "Brand Management",
    "Social Media Analytics",
    "Consumer Behaviour and Insights",
    "Digital Technology Transformation",
    "ICT Architectures and Frameworks",
    "Product Management",
    "Strategic Management",
    "Generative AI Tools"
  ],
  "SAP Consultant": [
    "ICT Architectures and Frameworks",
    "ICT Consulting",
    "Cloud-based Solution Architecture",
    "Advanced Cloud-Based Solution Architecture",
    "Digital Technology Transformation",
    "Information Systems for Telecom Business",
    "OSS/BSS Frameworx",
    "Supply Chain Management",
    "Business Modeling and Planning",
    "Generative AI Tools"
  ],
  "Supply Chain & Network Operations Consultant": [
    "Supply Chain Management",
    "Strategic Management",
    "Business Modeling and Planning",
    "Convergence of Telecom Networks",
    "Designing Telecom Networks: Wireless and Optical",
    "Network Concepts and Components",
    "Digital Technology Transformation",
    "Data Mining for Decision Making",
    "Visual Analytics",
    "ICT Consulting"
  ],
  "Finance Transformation Consultant": [
    "Financial Management",
    "Management Accounting",
    "Advanced Corporate Finance",
    "Management of Financial Technologies",
    "Business Modeling and Planning",
    "Financial Risk Management",
    "Digital Technology Transformation",
    "Generative AI Tools",
    "AI and ML for Business Management",
    "Strategic Management",
    "Project Management"
  ],
  "Finance Transformation GBS Consultant": [
    "Financial Management",
    "Management Accounting",
    "Advanced Corporate Finance",
    "Management of Financial Technologies",
    "Business Modeling and Planning",
    "Financial Risk Management",
    "Digital Technology Transformation",
    "Generative AI Tools",
    "AI and ML for Business Management",
    "Strategic Management",
    "Project Management"
  ],
  "Digital Risk Consultant": [
    "Governance Risk and Compliance",
    "Digital Risk Management",
    "Digital Regulations",
    "Information Systems for Telecom Business",
    "Digital Technology Transformation",
    "ICT Architectures and Frameworks",
    "Cloud-based Solution Architecture",
    "Financial Risk Management",
    "Digital Forensics"
  ],
  "Cyber Risk Consultant": [
    "Digital Forensics",
    "Digital Risk Management",
    "Governance Risk and Compliance",
    "Network Concepts and Components",
    "Convergence of Telecom Networks",
    "Cloud-based Solution Architecture",
    "Advanced Cloud-Based Solution Architecture",
    "Digital Regulations",
    "Advanced Programming in Python",
    "Information Systems for Telecom Business"
  ],
  "Enterprise Risk Consultant": [
    "Governance Risk and Compliance",
    "Digital Risk Management",
    "Financial Risk Management",
    "Business Modeling and Planning",
    "ICT Architectures and Frameworks",
    "ICT Consulting",
    "Information Systems for Telecom Business",
    "Project Management",
    "Digital Regulations"
  ],
  "Management Trainee – Product Management": [
    "Product Management",
    "Managing Pre-Sales",
    "Marketing Management",
    "Consumer Behaviour and Insights",
    "Marketing Research",
    "Services Marketing",
    "Introduction to Telecom Technologies",
    "Services and Technology Trends in Telecom (STTT)",
    "Convergence of Telecom Networks",
    "Generative AI Tools",
    "Visual Analytics"
  ],
  "Management Trainee – Operations": [
    "Introduction to Telecom Technologies",
    "Network Concepts and Components",
    "Services and Technology Trends in Telecom (STTT)",
    "OSS/BSS Frameworx",
    "Information Systems for Telecom Business",
    "Project Management",
    "Supply Chain Management",
    "Principles and Practices of Management",
    "Business Communication"
  ],
  "Digital Assurance (Associate – Assurance)": [
    "Governance Risk and Compliance",
    "Digital Risk Management",
    "Information Systems for Telecom Business",
    "Management Accounting",
    "Financial Management",
    "Cloud-based Solution Architecture",
    "Block Chain Technology",
    "Network Concepts and Components",
    "Digital Regulations",
    "Financial Risk Management"
  ],
  "Associate – Consulting (Advisory)": [
    "Strategic Management",
    "Research Methodology",
    "Business Statistics",
    "Managerial Economics",
    "Macroeconomics for Managers",
    "Business Modeling and Planning",
    "Visual Analytics",
    "Digital Technology Transformation",
    "Supply Chain Management",
    "ICT Consulting",
    "Generative AI Tools"
  ],
  "Emerging Solution Engineer (Pre-Sales Consulting)": [
    "Managing Pre-Sales",
    "Marketing Analytics and CRM",
    "Cloud-based Solution Architecture",
    "Product Management",
    "Information Systems for Telecom Business",
    "Digital Technology Transformation",
    "ICT Architectures and Frameworks",
    "Strategic Management",
    "Generative AI Tools",
    "Business Communication"
  ]
};

const isCourseCovered = (courseName: string, parsedSkills: string[]) => {
  const normalizedSkills = (parsedSkills ?? []).map(s => s.toLowerCase());
  const words = courseName.toLowerCase().replace(/and|for|in|of|to|the|&/g, "").split(/\s+/).filter(w => w.length > 2);
  return words.some(w => normalizedSkills.some(s => s.includes(w)));
};

const GUESSTIMATES = casebooks.filter((c: any) => c.category === "guesstimate");

function NewInterview() {
  const router = useRouter();
  const parseFn = useServerFn(parseResume);
  const parsePastedResumeFn = useServerFn(parsePastedResume);
  const parseJdFileFn = useServerFn(parseJdFile);
  const startFn = useServerFn(startSession);
  const startGuesstimateFn = useServerFn(startGuesstimate);

  const [file, setFile] = useState<File | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [jd, setJd] = useState("");
  const [domain, setDomain] = useState("");
  const [domainCustom, setDomainCustom] = useState("");
  const [role, setRole] = useState("");
  const [roleCustom, setRoleCustom] = useState("");
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [practiceMode, setPracticeMode] = useState<"interview" | "guesstimate">("interview");
  const [selectedGuesstimate, setSelectedGuesstimate] = useState<string>("");
  const [guesstimateStarting, setGuesstimateStarting] = useState(false);

  // Resume pasting states
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [resumeInputMode, setResumeInputMode] = useState("file");

  async function handlePastedResumeSubmit() {
    if (pastedResumeText.trim().length < 50) {
      return toast.error("Please paste a longer resume text (minimum 50 characters).");
    }
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user!.id;
      
      const { data: row, error } = await supabase.from("resumes").insert({
        user_id: uid,
        file_path: "pasted",
        file_name: "Pasted Resume Text",
        raw_text: pastedResumeText
      }).select().single();
      
      if (error) throw new Error(error.message);
      
      setResumeId(row.id);
      toast.info("Analyzing your pasted resume with AI…");
      
      const p = await parsePastedResumeFn({
        data: {
          resumeId: row.id,
          rawText: pastedResumeText
        }
      });
      
      setParsed(p);
      toast.success("Resume parsed successfully!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parsing failed");
    } finally {
      setUploading(false);
    }
  }

  // Drag & drop / file states
  const [isResumeDragActive, setIsResumeDragActive] = useState(false);
  const [isJdDragActive, setIsJdDragActive] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const [jdFile, setJdFile] = useState<File | null>(null);

  // Resume drag events
  const handleResumeDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsResumeDragActive(true);
    } else if (e.type === "dragleave") {
      setIsResumeDragActive(false);
    }
  };

  const handleResumeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResumeDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const nameLower = droppedFile.name.toLowerCase();
      if (nameLower.endsWith(".pdf") || nameLower.endsWith(".docx")) {
        setFile(droppedFile);
      } else {
        toast.error("Please drop a PDF or DOCX file for the resume.");
      }
    }
  };

  // JD Drag & Drop handlers
  const handleJdDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsJdDragActive(true);
    } else if (e.type === "dragleave") {
      setIsJdDragActive(false);
    }
  };

  const processJdFile = async (selectedFile: File) => {
    const nameLower = selectedFile.name.toLowerCase();
    if (!nameLower.endsWith(".pdf") && !nameLower.endsWith(".docx") && !nameLower.endsWith(".txt")) {
      toast.error("Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    setJdFile(selectedFile);

    if (nameLower.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setJd(text);
        toast.success("Job description loaded from TXT file!");
      };
      reader.readAsText(selectedFile);
    } else {
      // PDF or DOCX
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        const base64 = result.split(",")[1];
        setExtractingJd(true);
        toast.info("Extracting text from document using AI...");
        try {
          const res = await parseJdFileFn({
            data: {
              base64,
              mime: selectedFile.type || "application/octet-stream",
              filename: selectedFile.name,
            },
          });
          if (res && res.text) {
            setJd(res.text);
            toast.success("Job description extracted successfully!");
          } else {
            throw new Error("No text content returned");
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to parse job description file");
        } finally {
          setExtractingJd(false);
        }
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleJdDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsJdDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processJdFile(e.dataTransfer.files[0]);
    }
  };

  const handleJdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processJdFile(e.target.files[0]);
    }
  };

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user!.id;
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, file);
      if (upErr) throw new Error(upErr.message);
      const { data: row, error } = await supabase.from("resumes").insert({
        user_id: uid, file_path: path, file_name: file.name,
      }).select().single();
      if (error) throw new Error(error.message);
      setResumeId(row.id);
      toast.info("Analyzing your resume with AI…");
      const p = await parseFn({ data: { resumeId: row.id } });
      setParsed(p);
      toast.success("Resume parsed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const handleDomainChange = (val: string) => {
    setDomain(val);
    setRole("");
    setRoleCustom("");
  };

  async function handleStart() {
    if (!resumeId) return toast.error("Upload your resume first.");
    const finalDomain = domain === "Custom" ? domainCustom.trim() : domain;
    const finalRole = role === "Custom" ? roleCustom.trim() : role;
    if (!finalDomain || !finalRole) return toast.error("Pick a target domain and role.");
    if (jd.trim().length < 30) return toast.error("Paste a longer job description.");
    setStarting(true);
    try {
      const { sessionId } = await startFn({ data: { resumeId, jdText: jd, company: finalDomain, role: finalRole } });
      toast.success("Interview ready.");
      router.navigate({ to: "/interview/$id", params: { id: sessionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start session");
    } finally {
      setStarting(false);
    }
  }

  async function handleStartGuesstimate(g: typeof GUESSTIMATES[number]) {
    setGuesstimateStarting(true);
    try {
      const { sessionId } = await startGuesstimateFn({
        data: {
          questionText: g.question,
          title: g.title
        }
      });
      toast.success("Guesstimate practice ready!");
      router.navigate({ to: "/guesstimate/$id", params: { id: sessionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start guesstimate");
    } finally {
      setGuesstimateStarting(false);
    }
  }

  return (
    <AppShell title="Placement Prep Hub" subtitle="Practice role-specific mock interviews or solve logical guesstimates.">
      <Tabs value={practiceMode} onValueChange={(val: any) => setPracticeMode(val)} className="w-full mb-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
          <TabsTrigger value="interview">Mock Interview (Webcam/Audio)</TabsTrigger>
          <TabsTrigger value="guesstimate">Guesstimate & Case Practice</TabsTrigger>
        </TabsList>

        <TabsContent value="interview" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Resume</CardTitle>
            <CardDescription>PDF preferred, or paste the text content directly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={resumeInputMode} onValueChange={setResumeInputMode} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">Upload File</TabsTrigger>
                <TabsTrigger value="text">Paste Text</TabsTrigger>
              </TabsList>
              
              <TabsContent value="file" className="space-y-3 mt-3">
                <label
                  onDragEnter={handleResumeDrag}
                  onDragOver={handleResumeDrag}
                  onDragLeave={handleResumeDrag}
                  onDrop={handleResumeDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    isResumeDragActive
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/40 hover:bg-secondary"
                  }`}
                >
                  <Upload className={`h-6 w-6 transition-transform ${isResumeDragActive ? "scale-110 text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm">{file ? file.name : "Click or drag & drop PDF or DOCX"}</span>
                  <Input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <Button className="w-full" onClick={handleUpload} disabled={!file || uploading}>
                  {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…</> : "Upload & analyze"}
                </Button>
              </TabsContent>
              
              <TabsContent value="text" className="space-y-3 mt-3">
                <Textarea
                  rows={6}
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  placeholder="Paste your raw resume text here (experience, skills, projects, etc.)..."
                  className="w-full"
                />
                <Button className="w-full" onClick={handlePastedResumeSubmit} disabled={!pastedResumeText || uploading}>
                  {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…</> : "Analyze resume"}
                </Button>
              </TabsContent>
            </Tabs>
            
            {parsed && (
              <div className="rounded-md border bg-secondary/30 p-3 text-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Quality: {parsed.quality_score}/100
                  </div>
                  {parsed.quality_score < 70 && (
                    <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      Blocked: Under 70
                    </span>
                  )}
                </div>
                {parsed.quality_score < 70 && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                    <div className="font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Action Required: Quantification Gate
                    </div>
                    <p className="text-muted-foreground leading-normal">
                      Your resume quality score is below 70 due to achievements lacking metrics. You must quantify your bullet points with concrete numbers, percentages, or metrics and re-upload before you can start an interview.
                    </p>
                  </div>
                )}
                <p className="text-muted-foreground">{parsed.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(parsed.skills ?? []).slice(0, 10).map((s: string) => (
                    <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{s}</span>
                  ))}
                </div>

                {parsed.certifications && parsed.certifications.length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-3 space-y-1">
                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                      Certifications Claimed:
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {parsed.certifications.map((c: string) => (
                        <span key={c} className="rounded-md bg-violet-500/10 text-violet-600 px-2 py-0.5 text-xs font-medium border border-violet-500/20">{c}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                      ⚠️ Certification Viva Active: You will be tested on these certification concepts during the interview to verify depth of knowledge.
                    </p>
                  </div>
                )}

                {parsed.suggestions && parsed.suggestions.length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <div className="font-semibold text-xs text-foreground mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Improvements
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {parsed.suggestions.map((s: string, idx: number) => (
                        <li key={idx} className="flex gap-2 items-start">
                          <span className="text-amber-500 font-medium select-none">{idx + 1}.</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Target role & JD</CardTitle>
            <CardDescription>Select or type your target domain and role, then paste or drop the JD.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Domain</Label>
                <Select value={domain} onValueChange={handleDomainChange}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                {domain === "Custom" && <Input className="mt-2" placeholder="Domain name" value={domainCustom} onChange={(e) => setDomainCustom(e.target.value)} />}
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole} disabled={!domain}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={domain ? "Select" : "Choose domain first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(DOMAIN_ROLES_MAP[domain] || []).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                {role === "Custom" && <Input className="mt-2" placeholder="Role" value={roleCustom} onChange={(e) => setRoleCustom(e.target.value)} />}
              </div>
            </div>

            {role && ROLE_COURSES_MAP[role] && (
              <div className="mt-4 border-t border-border/60 pt-3 space-y-2">
                <div className="font-semibold text-xs text-foreground mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  SIDTM Curriculum Mapping for this Role:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {ROLE_COURSES_MAP[role].map((c) => {
                    const covered = parsed ? isCourseCovered(c, parsed.skills) : false;
                    return (
                      <div key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground p-1 rounded-md bg-secondary/20 hover:bg-secondary/40 transition-colors">
                        {covered ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-[9px] font-bold text-amber-600 shrink-0">!</span>
                        )}
                        <span className={covered ? "text-foreground font-medium" : "text-muted-foreground"}>{c}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Job description</Label>
              <label
                onDragEnter={handleJdDrag}
                onDragOver={handleJdDrag}
                onDragLeave={handleJdDrag}
                onDrop={handleJdDrop}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                  isJdDragActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                }`}
              >
                {extractingJd ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Extracting JD text using AI...</span>
                  </div>
                ) : (
                  <>
                    <Upload className={`h-5 w-5 transition-transform ${isJdDragActive ? "scale-110 text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs text-muted-foreground">
                      {jdFile ? `Selected: ${jdFile.name}` : "Click or drag & drop JD file (PDF, DOCX, TXT) to extract text"}
                    </span>
                    <Input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleJdFileChange} />
                  </>
                )}
              </label>
              <Textarea
                rows={7}
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                placeholder="Or paste/edit the full JD text here..."
                className="mt-1"
              />
            </div>
            <Button 
              className="w-full" 
              onClick={handleStart} 
              disabled={starting || (parsed && parsed.quality_score < 70)}
            >
              {starting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating questions…</> : 
               (parsed && parsed.quality_score < 70) ? "Resume Quality Gate Active (Under 70)" : "Generate interview"}
            </Button>
          </CardContent>
        </Card>
      </div>
      </TabsContent>

      <TabsContent value="guesstimate" className="mt-6">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 max-h-[480px] overflow-y-auto pr-2">
              {GUESSTIMATES.map((g) => (
                <Card 
                  key={g.id} 
                  className={`cursor-pointer border transition-all hover:border-primary/50 hover:shadow-md ${
                    selectedGuesstimate === g.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                  }`}
                  onClick={() => setSelectedGuesstimate(g.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">{g.title}</CardTitle>
                    <CardDescription className="text-xs leading-normal">Source: {g.source}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {selectedGuesstimate && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2 bg-primary/5 border-b">
                  <CardTitle className="text-sm text-primary">Selected Case</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                    {GUESSTIMATES.find(g => g.id === selectedGuesstimate)?.question}
                  </p>
                  <Button 
                    className="w-full" 
                    disabled={guesstimateStarting}
                    onClick={() => {
                      const g = GUESSTIMATES.find(x => x.id === selectedGuesstimate);
                      if (g) handleStartGuesstimate(g);
                    }}
                  >
                    {guesstimateStarting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing scratchpad…</>
                    ) : (
                      "Start Case Practice Workspace"
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Logical Breakdown Drivers</CardTitle>
                <CardDescription className="text-xs">Frameworks for guesstimating at SIDTM</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-4 leading-relaxed font-normal">
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Population & Demographics</h4>
                  <p>Start with total geographic population (e.g. Pune ~4M, India ~1.4B) and segment by age, gender, rural vs urban, income level, or digital literacy.</p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Replacement & Lifespan Levers</h4>
                  <p>For sales estimation (like phones sold daily), calculate replacement rate: total active user base divided by the average device lifespan (e.g. 2 years = 730 days).</p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Logical Formulas</h4>
                  <p>Interviews test if your formula scales cleanly. Always write out your logical formula before picking assumptions or doing arithmetic!</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>
      </Tabs>
    </AppShell>
  );
}