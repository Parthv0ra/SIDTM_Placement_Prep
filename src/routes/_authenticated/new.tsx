import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { parseResume, parsePastedResume, parseJdFile, startSession } from "@/lib/interview.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/new")({
  component: NewInterview,
});

const COMPANIES = ["TCS","Infosys","Wipro","Accenture","Deloitte","EY","KPMG","JPMorgan Chase","Goldman Sachs","Microsoft","Amazon","Google","Flipkart","HDFC Bank","ICICI Bank","Custom"] as const;
const ROLES = ["Business Analyst","Data Analyst","Product Manager","Marketing Associate","Consultant","Software Engineer","Operations Analyst","HR Associate","Finance Analyst","Custom"] as const;

function NewInterview() {
  const router = useRouter();
  const parseFn = useServerFn(parseResume);
  const parsePastedResumeFn = useServerFn(parsePastedResume);
  const parseJdFileFn = useServerFn(parseJdFile);
  const startFn = useServerFn(startSession);

  const [file, setFile] = useState<File | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [companyCustom, setCompanyCustom] = useState("");
  const [role, setRole] = useState("");
  const [roleCustom, setRoleCustom] = useState("");
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);

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

  async function handleStart() {
    if (!resumeId) return toast.error("Upload your resume first.");
    const finalCompany = company === "Custom" ? companyCustom.trim() : company;
    const finalRole = role === "Custom" ? roleCustom.trim() : role;
    if (!finalCompany || !finalRole) return toast.error("Pick a target company and role.");
    if (jd.trim().length < 30) return toast.error("Paste a longer job description.");
    setStarting(true);
    try {
      const { sessionId } = await startFn({ data: { resumeId, jdText: jd, company: finalCompany, role: finalRole } });
      toast.success("Interview ready.");
      router.navigate({ to: "/interview/$id", params: { id: sessionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start session");
    } finally {
      setStarting(false);
    }
  }

  return (
    <AppShell title="New mock interview" subtitle="Upload your resume, paste the JD, and target a role.">
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
              <div className="rounded-md border bg-secondary/30 p-3 text-sm">
                <div className="mb-2 flex items-center gap-2 text-primary"><CheckCircle2 className="h-4 w-4" /> Quality: {parsed.quality_score}/100</div>
                <p className="text-muted-foreground">{parsed.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(parsed.skills ?? []).slice(0, 10).map((s: string) => (
                    <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Target role & JD</CardTitle>
            <CardDescription>Select or type your target company and role, then paste or drop the JD.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Company</Label>
                <Select value={company} onValueChange={setCompany}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{COMPANIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                {company === "Custom" && <Input className="mt-2" placeholder="Company name" value={companyCustom} onChange={(e) => setCompanyCustom(e.target.value)} />}
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{ROLES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                {role === "Custom" && <Input className="mt-2" placeholder="Role" value={roleCustom} onChange={(e) => setRoleCustom(e.target.value)} />}
              </div>
            </div>
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
            <Button className="w-full" onClick={handleStart} disabled={starting}>
              {starting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating questions…</> : "Generate interview"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}