import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scorecard/$id")({
  component: Scorecard,
});

function Scorecard() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["scorecard", id],
    queryFn: async () => {
      const [{ data: session }, { data: card }, { data: responses }, { data: questions }] = await Promise.all([
        supabase.from("interview_sessions").select("*").eq("id", id).single(),
        supabase.from("scorecards").select("*").eq("session_id", id).single(),
        supabase.from("responses").select("*").eq("session_id", id),
        supabase.from("questions").select("*").eq("session_id", id).order("order_index"),
      ]);
      return { session, card, responses: responses ?? [], questions: questions ?? [] };
    },
  });

  if (isLoading) return <AppShell title="Scorecard"><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div></AppShell>;
  if (!data?.card) return <AppShell title="Scorecard"><p className="text-sm text-muted-foreground">No scorecard yet.</p></AppShell>;

  const cats = data.card.category_scores as Record<string, number>;
  const radar = Object.entries(cats).map(([k, v]) => ({ category: k.replace("_", " "), score: v }));

  return (
    <AppShell title={`Scorecard · ${data.session?.company} — ${data.session?.role}`} subtitle="Detailed feedback and improvement plan">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardContent className="pt-6 text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall readiness</p>
            <p className="mt-2 text-6xl font-bold text-primary">{data.card.overall_score}</p>
            <p className="text-sm text-muted-foreground">/ 100</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Category breakdown</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Strengths</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {(data.card.strengths as string[] ?? []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Improvements</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {(data.card.recommendations as string[] ?? []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Per-question feedback</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {data.questions.map((q, i) => {
            const r = data.responses.find((x) => x.question_id === q.id);
            const scores = r?.scores as Record<string, number> | undefined;
            return (
              <div key={q.id} className="rounded-md border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Q{i + 1} · {q.category}</p>
                <p className="mt-1 text-sm font-medium">{q.question_text}</p>
                {r?.transcript && <p className="mt-2 rounded bg-secondary/40 p-2 text-xs text-muted-foreground">{r.transcript}</p>}
                {scores && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {Object.entries(scores).filter(([k, v]) => typeof v === "number").map(([k, v]) => (
                      <span key={k} className="rounded-full bg-secondary px-2 py-0.5 capitalize">{k.replace("_", " ")}: <b>{v}</b></span>
                    ))}
                  </div>
                )}
                {scores && typeof (scores as any).feedback === "string" && <p className="mt-2 text-sm font-normal text-muted-foreground leading-relaxed">{(scores as any).feedback}</p>}

                {/* Render STAR structure checkmark if behavioral */}
                {q.category === "behavioral" && (scores as any)?.star_structure && (
                  <div className="mt-3 p-3 rounded-md bg-secondary/10 border border-border/60 space-y-2">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" /> Behavioral Answer Structure (STAR framework):
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {Object.entries((scores as any).star_structure).map(([component, exists]) => (
                        <div key={component} className="flex items-center gap-1.5">
                          {exists ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border border-destructive/40 bg-destructive/10 flex items-center justify-center text-[10px] font-bold text-destructive shrink-0">✕</span>
                          )}
                          <span className={exists ? "text-foreground font-medium capitalize" : "text-muted-foreground capitalize"}>{component}</span>
                        </div>
                      ))}
                    </div>
                    {(scores as any).star_feedback && (
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1 italic border-l-2 pl-2">
                        {(scores as any).star_feedback}
                      </p>
                    )}
                  </div>
                )}

                {/* Render Vocabulary Nudges comparison if present */}
                {(scores as any)?.vocab_nudges && (scores as any).vocab_nudges.length > 0 && (
                  <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/10 space-y-2">
                    <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Placement Coach Vocab Nudges (Business Jargon):
                    </div>
                    <div className="divide-y divide-border/60">
                      {(scores as any).vocab_nudges.map((nudge: any, idx: number) => (
                        <div key={idx} className="py-2 first:pt-0 last:pb-0 space-y-1">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Candidate said: </span>
                              <span className="line-through text-destructive font-medium">"{nudge.generic}"</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Professional alternative: </span>
                              <span className="text-emerald-600 font-semibold">"{nudge.professional}"</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal">{nudge.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-2">
        <Button asChild><Link to="/new">Practice again</Link></Button>
        <Button asChild variant="outline"><Link to="/history">View history</Link></Button>
      </div>
    </AppShell>
  );
}