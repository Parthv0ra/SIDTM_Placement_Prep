import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { startGuesstimate } from "@/lib/interview.functions";
import casebooks from "@/lib/casebook.json";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Calculator,
  Lightbulb,
  History,
  ArrowRight,
  TrendingUp,
  Brain,
  CheckCircle2,
  FileText,
  Sparkles
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/guesstimates")({
  component: GuesstimatesPage,
});

const GUESSTIMATES = casebooks.filter(
  (c: any) => c.category === "guesstimate" || c.category === "case_study"
);

function GuesstimatesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const startGuesstimateFn = useServerFn(startGuesstimate);

  const [activeTab, setActiveTab] = useState<"practice" | "history">("practice");
  const [selectedCaseDomain, setSelectedCaseDomain] = useState<string>("All");
  const [selectedGuesstimate, setSelectedGuesstimate] = useState<string>("");
  const [guesstimateStarting, setGuesstimateStarting] = useState(false);



  const selectedCaseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedGuesstimate) {
      setTimeout(() => {
        selectedCaseRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [selectedGuesstimate]);

  // Queries
  const { data: previousSessions, isLoading: historyLoading } = useQuery({
    queryKey: ["previousGuesstimates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_sessions")
        .select("*, scorecards(overall_score)")
        .eq("company", "Guesstimate")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

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
      qc.invalidateQueries({ queryKey: ["previousGuesstimates"] });
      router.navigate({ to: "/guesstimate/$id", params: { id: sessionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start guesstimate");
    } finally {
      setGuesstimateStarting(false);
    }
  }

  const selectedCase = GUESSTIMATES.find(g => g.id === selectedGuesstimate);

  return (
    <AppShell title="Guesstimate & Case Practice" subtitle="Solve analytical cases, construct driver logic, and test estimations.">
      <div className="flex gap-4 border-b pb-4 mb-6">
        <Button
          variant={activeTab === "practice" ? "default" : "ghost"}
          onClick={() => setActiveTab("practice")}
          size="sm"
        >
          <Brain className="mr-1.5 h-4 w-4" /> Practice Cases
        </Button>
        <Button
          variant={activeTab === "history" ? "default" : "ghost"}
          onClick={() => setActiveTab("history")}
          size="sm"
        >
          <History className="mr-1.5 h-4 w-4" /> My Practice Runs ({previousSessions?.length ?? 0})
        </Button>
      </div>

      {activeTab === "practice" && (
        <div className="space-y-6">
          {/* Domain Filter Badges */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium">Filter by Sector / Domain:</p>
            <div className="flex flex-wrap gap-1.5">
              {["All", ...Array.from(new Set(GUESSTIMATES.map((g: any) => g.domain || "Consulting")))].map((domain) => (
                <Button
                  key={domain}
                  variant={selectedCaseDomain === domain ? "default" : "outline"}
                  size="xs"
                  className="h-7 text-xs rounded-full px-3.5"
                  onClick={() => {
                    setSelectedCaseDomain(domain);
                    setSelectedGuesstimate(""); // Reset selection on filter change
                  }}
                >
                  {domain}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 max-h-[480px] overflow-y-auto pr-2">
                {GUESSTIMATES.length === 0 ? (
                  <div className="col-span-2 text-center py-12 text-sm text-muted-foreground">
                    No cases loaded in casebook database. Please upload/add new cases.
                  </div>
                ) : (
                  GUESSTIMATES.filter((g: any) => {
                    if (selectedCaseDomain === "All") return true;
                    return (g.domain || "Consulting") === selectedCaseDomain;
                  }).map((g) => (
                    <Card
                      key={g.id}
                      className={`cursor-pointer border transition-all hover:border-primary/50 hover:shadow-md ${
                        selectedGuesstimate === g.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                      }`}
                      onClick={() => setSelectedGuesstimate(g.id)}
                      onDoubleClick={() => handleStartGuesstimate(g)}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold leading-snug">{g.title}</CardTitle>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                            {g.domain || "Consulting"}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {g.category === "case_study" ? "Case Study" : "Guesstimate"}
                          </span>
                        </div>
                      </CardHeader>
                    </Card>
                  ))
                )}
              </div>

              {selectedGuesstimate && selectedCase && (
                <Card ref={selectedCaseRef} className="border-primary/30 shadow-md">
                  <CardHeader className="pb-2 bg-primary/5 border-b flex flex-row justify-between items-center">
                    <CardTitle className="text-sm text-primary flex items-center gap-1.5">
                      <Calculator className="h-4 w-4" /> Selected Case Details
                    </CardTitle>
                    <Badge variant="outline">{selectedCase.domain}</Badge>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Problem Statement</span>
                      <p className="text-sm font-medium leading-relaxed text-foreground mt-1.5">
                        {selectedCase.question}
                      </p>
                    </div>
                    <Button
                      className="w-full flex items-center justify-center gap-2"
                      size="lg"
                      disabled={guesstimateStarting}
                      onClick={() => handleStartGuesstimate(selectedCase)}
                    >
                      {guesstimateStarting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing scratchpad…</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Start Case Practice Workspace <ArrowRight className="h-4 w-4" /></>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Framework sidebar panel */}
            <div className="md:col-span-1">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Estimation Guidelines
                  </CardTitle>
                  <CardDescription className="text-xs">Frameworks for guesstimating at SIDTM</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-4 leading-relaxed font-normal">
                  <div className="p-2.5 rounded-lg border bg-secondary/10">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" /> Population Segment
                    </h4>
                    <p>Start with total geographic population (e.g. Pune ~4M, India ~1.4B) and segment by age, gender, rural vs urban, income level, or digital literacy.</p>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-secondary/10">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-1">
                      <History className="h-3.5 w-3.5 text-primary" /> Replacement Lifecycle
                    </h4>
                    <p>For sales estimation (like devices sold daily), calculate replacement rate: total active user base divided by the average device lifespan (e.g. 2 years = 730 days).</p>
                  </div>
                  <div className="p-2.5 rounded-lg border bg-secondary/10">
                    <h4 className="font-semibold text-foreground mb-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Formula Blueprint
                    </h4>
                    <p>Interviews test if your formula scales cleanly. Always write out your logical formula before picking assumptions or doing arithmetic!</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Runs history tab */}
      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Practice History
            </CardTitle>
            <CardDescription>Browse through your previous guesstimate and case runs.</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading practice history...
              </div>
            ) : !previousSessions || previousSessions.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No past runs found. Start a new case study above.
              </div>
            ) : (
              <div className="divide-y">
                {previousSessions.map((session) => {
                  const score = (session.scorecards as any)?.overall_score;
                  return (
                    <div key={session.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-1.5">
                          <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                          {session.role}
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Started on: {new Date(session.created_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Status: <span className="capitalize font-medium">{session.status}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {score !== undefined && (
                          <div className="text-right">
                            <span className="text-sm font-bold block">{score}/100</span>
                            <span className="text-[10px] text-muted-foreground">readiness</span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={
                              session.status === "completed"
                                ? `/scorecard/${session.id}`
                                : `/guesstimate/${session.id}`
                            }
                          >
                            {session.status === "completed" ? "View Scorecard" : "Resume Workspace"}
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
