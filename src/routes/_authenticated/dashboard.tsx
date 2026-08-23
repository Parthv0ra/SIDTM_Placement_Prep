import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { PlusCircle, Trophy, Target, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [sessions, scorecards] = await Promise.all([
        supabase
          .from("interview_sessions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("scorecards").select("*").order("created_at", { ascending: true }),
      ]);
      return { sessions: sessions.data ?? [], scorecards: scorecards.data ?? [] };
    },
  });

  const sessions = data?.sessions ?? [];
  const cards = data?.scorecards ?? [];
  const latest = cards[cards.length - 1];
  const best = cards.reduce((m, c) => Math.max(m, c.overall_score), 0);
  const chart = cards.map((c, i) => ({ attempt: `#${i + 1}`, score: c.overall_score }));

  return (
    <AppShell title="Dashboard" subtitle="Your placement readiness at a glance">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Latest readiness"
          value={latest ? `${latest.overall_score}/100` : "—"}
        />
        <StatCard
          icon={<Trophy className="h-4 w-4" />}
          label="Best score"
          value={best ? `${best}/100` : "—"}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Sessions completed"
          value={`${sessions.filter((s) => s.status === "completed").length}`}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Readiness trend</CardTitle>
            <Button asChild size="sm">
              <Link to="/new">
                <PlusCircle className="mr-1.5 h-4 w-4" />
                New interview
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="h-64">
            {chart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Complete an interview to see your trend
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="attempt" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: "var(--primary)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latest ? (
              Object.entries(latest.category_scores as Record<string, number>).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{k.replace("_", " ")}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                  <Progress value={v} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven't started any interviews yet. Click "New interview" to begin.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {s.company} — {s.role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()} · {s.status}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to={s.status === "completed" ? "/scorecard/$id" : "/interview/$id"}
                      params={{ id: s.id }}
                    >
                      {s.status === "completed" ? "View report" : "Resume"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
