import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  evaluateShortlist,
  parseResume,
  parsePastedResume,
  parseJdFile,
} from "@/lib/interview.functions";
import roleJds from "@/lib/role-jds.json";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Upload,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FileCheck,
  Plus,
  ArrowRight,
  TrendingUp,
  Award,
  BookOpen,
  Briefcase,
  History,
  FileText,
  Check,
  X,
  Sparkles,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/shortlist-evaluator")({
  component: ShortlistEvaluatorPage,
});

const DOMAINS = ["BFSI", "Consulting", "IT/ITES", "Marketing", "Custom"] as const;
const DOMAIN_ROLES_MAP: Record<string, string[]> = {
  BFSI: [
    "Finance Transformation Consultant",
    "Finance Transformation GBS Consultant",
    "Enterprise Risk Consultant",
    "Digital Assurance (Associate – Assurance)",
    "Custom",
  ],
  Consulting: [
    "Management Consultant, Management Consulting Analyst",
    "Business Architecture Associate Manager",
    "Customer Strategy & Applied Design Consultant",
    "Supply Chain & Network Operations Consultant",
    "Digital Risk Consultant",
    "Associate – Consulting (Advisory)",
    "Custom",
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
    "Custom",
  ],
  Marketing: [
    "Advertising, Marketing & Commerce Consultant",
    "Management Trainee – Product Management",
    "Custom",
  ],
  Custom: ["Custom"],
};

const LOADING_STEPS = [
  "Parsing and extracting resume text...",
  "Analyzing education & experience credentials against JD...",
  "Mapping skills against industry standards...",
  "Simulating ATS filters for the job profile...",
  "Calculating shortlist probabilities & matching keyword gaps...",
  "Formulating actionable recommendations & certifications...",
];

function ShortlistEvaluatorPage() {
  const qc = useQueryClient();
  const router = useRouter();

  // Server functions
  const parseFn = useServerFn(parseResume);
  const parsePastedResumeFn = useServerFn(parsePastedResume);
  const parseJdFileFn = useServerFn(parseJdFile);
  const evaluateShortlistFn = useServerFn(evaluateShortlist);

  // Layout tabs
  const [activeTab, setActiveTab] = useState<"evaluate" | "history">("evaluate");

  // Selection states
  const [domain, setDomain] = useState("");
  const [domainCustom, setDomainCustom] = useState("");
  const [role, setRole] = useState("");
  const [roleCustom, setRoleCustom] = useState("");
  const [jdText, setJdText] = useState("");

  // Resume states
  const [resumeSource, setResumeSource] = useState<"existing" | "new">("existing");
  const [resumeInputMode, setResumeInputMode] = useState("file");
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Analysis states
  const [scanning, setScanning] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [scanResult, setScanResult] = useState<any>(null);

  // Drag & drop states
  const [isResumeDragActive, setIsResumeDragActive] = useState(false);
  const [isJdDragActive, setIsJdDragActive] = useState(false);
  const [extractingJd, setExtractingJd] = useState(false);
  const [jdFile, setJdFile] = useState<File | null>(null);

  // Queries
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: evaluations, isLoading: evalsLoading } = useQuery({
    queryKey: ["shortlist_evaluations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shortlist_evaluations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Automatically select the latest resume if exists
  useEffect(() => {
    if (resumes && resumes.length > 0 && !selectedResumeId) {
      setSelectedResumeId(resumes[0].id);
    }
  }, [resumes, selectedResumeId]);

  // Loading animation simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scanning) {
      interval = setInterval(() => {
        setLoadingStepIdx((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
      }, 2500);
    } else {
      setLoadingStepIdx(0);
    }
    return () => clearInterval(interval);
  }, [scanning]);

  // Handlers for Resume Drag & Drop
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
      const dropped = e.dataTransfer.files[0];
      const name = dropped.name.toLowerCase();
      if (name.endsWith(".pdf") || name.endsWith(".docx")) {
        setFile(dropped);
      } else {
        toast.error("Please drop a PDF or DOCX file.");
      }
    }
  };

  // Handlers for JD Drag & Drop / File selection
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
    if (
      !nameLower.endsWith(".pdf") &&
      !nameLower.endsWith(".docx") &&
      !nameLower.endsWith(".txt")
    ) {
      toast.error("Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    setJdFile(selectedFile);

    if (nameLower.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setJdText(text);
        toast.success("Job description loaded from TXT file!");
      };
      reader.readAsText(selectedFile);
    } else {
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
            setJdText(res.text);
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

  const handleDomainChange = (val: string) => {
    setDomain(val);
    setRole("");
    setRoleCustom("");
    setJdText("");
  };

  const handleRoleChange = (val: string) => {
    setRole(val);
    setRoleCustom("");
    if (val === "Custom" || !val) {
      setJdText("");
    } else {
      const autofilledJd = roleJds[val as keyof typeof roleJds] || "";
      setJdText(autofilledJd);
    }
  };

  // Upload/Parse a new resume
  const handleUploadResume = async (): Promise<string | null> => {
    if (resumeSource === "existing") {
      if (!selectedResumeId) {
        toast.error("Please select a resume.");
        return null;
      }
      return selectedResumeId;
    }

    // New Resume
    if (resumeInputMode === "file") {
      if (!file) {
        toast.error("Please select or drop a resume file.");
        return null;
      }
      setUploading(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        const uid = user.user!.id;
        const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
        const { error: upErr } = await supabase.storage.from("resumes").upload(path, file);
        if (upErr) throw new Error(upErr.message);

        const { data: row, error } = await supabase
          .from("resumes")
          .insert({
            user_id: uid,
            file_path: path,
            file_name: file.name,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);

        // Run server parser
        await parseFn({ data: { resumeId: row.id } });
        qc.invalidateQueries({ queryKey: ["resumes"] });
        return row.id;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return null;
      } finally {
        setUploading(false);
      }
    } else {
      // Pasted text
      if (pastedText.trim().length < 50) {
        toast.error("Please paste a longer resume text (min 50 chars).");
        return null;
      }
      setUploading(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        const uid = user.user!.id;

        const { data: row, error } = await supabase
          .from("resumes")
          .insert({
            user_id: uid,
            file_path: "pasted",
            file_name: "Pasted Resume Text",
            raw_text: pastedText,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);

        // Run server parser
        await parsePastedResumeFn({
          data: {
            resumeId: row.id,
            rawText: pastedText,
          },
        });
        qc.invalidateQueries({ queryKey: ["resumes"] });
        return row.id;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Pasted parse failed");
        return null;
      } finally {
        setUploading(false);
      }
    }
  };

  // Run the Shortlist Evaluation
  const handleStartEvaluation = async () => {
    const finalDomain = domain === "Custom" ? domainCustom.trim() : domain;
    const finalRole = role === "Custom" ? roleCustom.trim() : role;

    if (!finalDomain) return toast.error("Please select or specify a domain.");
    if (!finalRole) return toast.error("Please select or specify a role.");
    if (jdText.trim().length < 30)
      return toast.error("Please provide a longer Job Description (min 30 chars).");

    setScanning(true);
    setScanResult(null);

    try {
      // 1. Ensure we have a parsed resume ID
      const rId = await handleUploadResume();
      if (!rId) {
        setScanning(false);
        return;
      }

      // 2. Run scan
      const res = await evaluateShortlistFn({
        data: {
          resumeId: rId,
          domain: finalDomain,
          role: finalRole,
          jdText: jdText,
        },
      });

      setScanResult(res);
      toast.success("Shortlist evaluation complete!");
      qc.invalidateQueries({ queryKey: ["shortlist_evaluations"] });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setScanning(false);
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 80)
      return "text-emerald-500 stroke-emerald-500 border-emerald-500/20 bg-emerald-500/5";
    if (score >= 60) return "text-amber-500 stroke-amber-500 border-amber-500/20 bg-amber-500/5";
    return "text-destructive stroke-destructive border-destructive/20 bg-destructive/5";
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "shortlisted" || s === "shortlist") {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          Shortlisted
        </Badge>
      );
    }
    if (s === "borderline") {
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20">
          Borderline
        </Badge>
      );
    }
    return (
      <Badge className="bg-destructive/10 text-destructive border border-destructive/20">
        Not Shortlisted
      </Badge>
    );
  };

  return (
    <AppShell
      title="Shortlist Evaluator & Advisor"
      subtitle="Evaluate if your resume is shortlisted for a target role based on its Job Description, and get credential gap advice."
    >
      <div className="flex gap-4 border-b pb-4 mb-6">
        <Button
          variant={activeTab === "evaluate" ? "default" : "ghost"}
          onClick={() => {
            setActiveTab("evaluate");
            setScanResult(null);
          }}
          size="sm"
        >
          <FileCheck className="mr-1.5 h-4 w-4" /> Evaluator
        </Button>
        <Button
          variant={activeTab === "history" ? "default" : "ghost"}
          onClick={() => setActiveTab("history")}
          size="sm"
        >
          <History className="mr-1.5 h-4 w-4" /> Past Evaluations ({evaluations?.length ?? 0})
        </Button>
      </div>

      {activeTab === "evaluate" && !scanResult && !scanning && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Form parameters */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> Target Profile & Domain
                </CardTitle>
                <CardDescription>
                  Select the sector and specific role you want to evaluate your resume against.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="domain">Domain Sector</Label>
                    <Select value={domain} onValueChange={handleDomainChange}>
                      <SelectTrigger id="domain" className="mt-1">
                        <SelectValue placeholder="Select Domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOMAINS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {domain === "Custom" && (
                      <Input
                        className="mt-2"
                        placeholder="Type Custom Domain"
                        value={domainCustom}
                        onChange={(e) => setDomainCustom(e.target.value)}
                      />
                    )}
                  </div>

                  <div>
                    <Label htmlFor="role">Target Role</Label>
                    <Select value={role} onValueChange={handleRoleChange} disabled={!domain}>
                      <SelectTrigger id="role" className="mt-1">
                        <SelectValue placeholder={domain ? "Select Role" : "Choose domain first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(DOMAIN_ROLES_MAP[domain] || []).map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {role === "Custom" && (
                      <Input
                        className="mt-2"
                        placeholder="Type Custom Role"
                        value={roleCustom}
                        onChange={(e) => setRoleCustom(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Job Description
                </CardTitle>
                <CardDescription>
                  Specify the target requirements. You can upload a JD file or edit the plain text
                  below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      <Upload
                        className={`h-5 w-5 transition-transform ${isJdDragActive ? "scale-110 text-primary" : "text-muted-foreground"}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {jdFile
                          ? `Selected: ${jdFile.name}`
                          : "Click or drag & drop JD file (PDF, DOCX, TXT) to auto-extract text"}
                      </span>
                      <Input
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={handleJdFileChange}
                      />
                    </>
                  )}
                </label>

                <div className="space-y-2">
                  <Label htmlFor="jdText">Job Description Text</Label>
                  <Textarea
                    id="jdText"
                    rows={6}
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the full job description text or duties here..."
                    className="w-full text-xs font-mono"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Resume Source
                </CardTitle>
                <CardDescription>
                  Use an existing resume from your profile history or upload/paste a new one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs
                  value={resumeSource}
                  onValueChange={(val: any) => setResumeSource(val)}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 max-w-sm mb-4">
                    <TabsTrigger value="existing" disabled={!resumes || resumes.length === 0}>
                      Select Existing ({resumes?.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="new">Upload / Paste New</TabsTrigger>
                  </TabsList>

                  <TabsContent value="existing" className="space-y-2">
                    <Label htmlFor="existing-resume">Select Resume</Label>
                    <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                      <SelectTrigger id="existing-resume" className="mt-1">
                        <SelectValue placeholder="Choose a resume" />
                      </SelectTrigger>
                      <SelectContent>
                        {resumes?.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.file_name} — Parsed {new Date(r.created_at).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TabsContent>

                  <TabsContent value="new" className="space-y-4">
                    <Tabs
                      value={resumeInputMode}
                      onValueChange={setResumeInputMode}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="file">Upload PDF/DOCX</TabsTrigger>
                        <TabsTrigger value="text">Paste Plain Text</TabsTrigger>
                      </TabsList>

                      <TabsContent value="file" className="space-y-2 mt-3">
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
                          <Upload
                            className={`h-8 w-8 transition-transform ${isResumeDragActive ? "scale-110 text-primary" : "text-muted-foreground"}`}
                          />
                          <span className="text-sm font-medium">
                            {file ? file.name : "Click or drag & drop PDF/DOCX"}
                          </span>
                          <Input
                            type="file"
                            accept=".pdf,.docx"
                            className="hidden"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                          />
                        </label>
                      </TabsContent>

                      <TabsContent value="text" className="space-y-2 mt-3">
                        <Textarea
                          rows={6}
                          value={pastedText}
                          onChange={(e) => setPastedText(e.target.value)}
                          placeholder="Paste the full text of your resume here..."
                        />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Quick info / CTA */}
          <div className="space-y-6">
            <Card className="h-full flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="text-base">Ready to evaluate?</CardTitle>
                  <CardDescription>
                    We will parse your resume against the provided Job Description details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-md border p-3 bg-secondary/20 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Domain:</span>
                      <span className="font-semibold">{domain || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Role:</span>
                      <span className="font-semibold truncate max-w-[150px]">{role || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">JD Text Length:</span>
                      <span className="font-semibold">{jdText.length} chars</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Resume source:</span>
                      <span className="font-semibold">
                        {resumeSource === "existing" ? "Existing" : "New Input"}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/10 rounded-md p-3 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      Evaluation results are simulated by AI using industry benchmark keywords and
                      target recruiting parameters.
                    </span>
                  </div>
                </CardContent>
              </div>
              <div className="p-6 pt-0 mt-auto">
                <Button
                  className="w-full mt-4 flex items-center gap-2"
                  size="lg"
                  disabled={!domain || !role || jdText.trim().length < 30 || uploading}
                  onClick={handleStartEvaluation}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4" /> Run Shortlist Scan{" "}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Scanning loading screen */}
      {scanning && (
        <Card className="max-w-xl mx-auto my-12">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-6" />
            <h3 className="text-lg font-semibold mb-2">Analyzing Resume Shortlist Probability</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Please wait while our AI simulates recruiters screening your resume against the Job
              Description.
            </p>
            <div className="w-full space-y-2">
              <Progress
                value={((loadingStepIdx + 1) / LOADING_STEPS.length) * 100}
                className="h-2"
              />
              <p className="text-xs font-mono text-primary animate-pulse">
                {LOADING_STEPS[loadingStepIdx]}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Results Display */}
      {scanResult && !scanning && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Shortlist Evaluation Report</h2>
            <Button variant="outline" size="sm" onClick={() => {
              setScanResult(null);
              setFile(null);
              setPastedText("");
              setResumeSource("new");
              setResumeInputMode("file");
              setDomain("");
              setDomainCustom("");
              setRole("");
              setRoleCustom("");
              setJdText("");
              setJdFile(null);
            }}>
              Start New Evaluation
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Shortlist Score Dial */}
            <Card className="md:col-span-1 flex flex-col items-center justify-center p-6 text-center">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Shortlist Eligibility Score
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div
                  className={`relative flex items-center justify-center w-36 h-36 rounded-full border-4 ${getScoreColorClass(scanResult.shortlist_score)} mb-4`}
                >
                  <div className="text-center">
                    <span className="text-4xl font-bold">{scanResult.shortlist_score}</span>
                    <span className="text-xs block text-muted-foreground">out of 100</span>
                  </div>
                </div>

                <div className="mb-2">{getStatusBadge(scanResult.status)}</div>
                <p className="text-xs text-muted-foreground mt-2 max-w-[200px]">
                  Based on keyword matching, formatting, credentials, and JD criteria.
                </p>
              </CardContent>
            </Card>

            {/* Profile Overview */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" /> Target Alignment
                </CardTitle>
                <CardDescription>Evaluation parameters for your role and sector.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg bg-secondary/10">
                    <span className="text-xs text-muted-foreground block">
                      Target Sector / Domain
                    </span>
                    <span className="font-semibold text-sm">{scanResult.domain}</span>
                  </div>
                  <div className="p-3 border rounded-lg bg-secondary/10">
                    <span className="text-xs text-muted-foreground block">Target Role</span>
                    <span className="font-semibold text-sm">{scanResult.role}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Job Description Evaluated (Snippet)
                  </span>
                  <p className="text-xs text-muted-foreground line-clamp-3 bg-secondary/25 p-3 rounded-lg border">
                    {scanResult.jd_text}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recruiter Evaluation Verdict */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI Recruiter Verdict
              </CardTitle>
              <CardDescription>
                Detailed feedback on your resume suitability for this specific role and JD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border p-5 bg-primary/[0.01] shadow-sm flex items-start gap-3">
                <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-foreground leading-relaxed">
                  {scanResult.evaluation_verdict}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Keywords Gap & Suggestions */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Matched vs Missing Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Keywords & Skills Analysis
                </CardTitle>
                <CardDescription>
                  Matched keywords vs. critical missing skills for ATS filters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
                      <Check className="h-4 w-4" /> Matched (
                      {scanResult.matched_skills?.length ?? 0})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(scanResult.matched_skills as string[])?.length > 0 ? (
                        (scanResult.matched_skills as string[]).map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/5 text-emerald-600 border border-emerald-500/10 font-medium"
                          >
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No matches found.</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 border-l pl-4">
                    <span className="text-xs font-semibold text-destructive uppercase tracking-wide flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4 text-destructive" /> Missing (
                      {scanResult.missing_skills?.length ?? 0})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(scanResult.missing_skills as string[])?.length > 0 ? (
                        (scanResult.missing_skills as string[]).map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-2 py-0.5 rounded bg-destructive/5 text-destructive border border-destructive/10 font-medium"
                          >
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-emerald-600">
                          No missing skills detected!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Certifications & Curriculum */}
            <Card className="flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" /> Recommended Path
                  </CardTitle>
                  <CardDescription>
                    Professional certifications and curriculum courses to add.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                      <Award className="h-3.5 w-3.5 text-primary shrink-0" /> Recommended
                      Certifications
                    </span>
                    <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                      {(scanResult.suggested_certifications as string[]).map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                      <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" /> Recommended Courses
                    </span>
                    <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                      {(scanResult.suggested_courses as string[]).map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </div>
            </Card>
          </div>

          {/* Immediate Action Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" /> Resume Action Plan
              </CardTitle>
              <CardDescription>
                Actionable edits to boost your resume score and bypass screening filters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(scanResult.action_plan as string[]).map((plan, idx) => (
                  <li key={idx} className="flex gap-2 items-start text-sm">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold select-none shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-muted-foreground leading-normal">{plan}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Evaluation History
            </CardTitle>
            <CardDescription>Browse through your previous shortlist scan results.</CardDescription>
          </CardHeader>
          <CardContent>
            {evalsLoading ? (
              <div className="flex justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading past evaluations...
              </div>
            ) : !evaluations || evaluations.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No evaluations found. Start a new evaluation scanner above.
              </div>
            ) : (
              <div className="divide-y">
                {evaluations.map((ev) => (
                  <div
                    key={ev.id}
                    className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                  >
                    <div className="space-y-1">
                      <h4 className="font-semibold text-sm">
                        {ev.domain} — {ev.role}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 max-w-[500px]">
                        JD: {ev.jd_text}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Scanned on: {new Date(ev.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-sm font-bold block">{ev.shortlist_score}/100</span>
                        <span className="text-[10px] block">{getStatusBadge(ev.status)}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setScanResult(ev);
                          setActiveTab("evaluate");
                        }}
                      >
                        View Report
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
