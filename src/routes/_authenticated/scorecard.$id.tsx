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
                    {Object.entries(scores).map(([k, v]) => (
                      <span key={k} className="rounded-full bg-secondary px-2 py-0.5 capitalize">{k.replace("_", " ")}: <b>{v}</b></span>
                    ))}
                  </div>
                )}
                {scores && typeof (scores as any).feedback === "string" && <p className="mt-2 text-sm">{(scores as any).feedback}</p>}
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