import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

function Admin() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user!.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isStaff = roles?.some((r) => r.role === "admin" || r.role === "faculty") ?? false;
      if (!isStaff) return { isStaff: false, sessions: [] as any[], scorecards: [] as any[] };
      const [{ data: sessions }, { data: scorecards }] = await Promise.all([
        supabase.from("interview_sessions").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(50),
        supabase.from("scorecards").select("*"),
      ]);
      return { isStaff: true, sessions: sessions ?? [], scorecards: scorecards ?? [] };
    },
  });

  if (isLoading) return <AppShell title="Admin"><p>Loading…</p></AppShell>;
  if (!data?.isStaff) return <AppShell title="Admin"><p className="text-sm text-muted-foreground">You need faculty or admin permissions to view this page.</p></AppShell>;

  const avg = data.scorecards.length ? Math.round(data.scorecards.reduce((s, c) => s + c.overall_score, 0) / data.scorecards.length) : 0;
  const buckets = [0,20,40,60,80].map((lo) => ({
    range: `${lo}-${lo+20}`,
    count: data.scorecards.filter((c) => c.overall_score >= lo && c.overall_score < lo + 20).length,
  }));

  return (
    <AppShell title="Faculty panel" subtitle="Aggregate performance across students">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total sessions" value={`${data.sessions.length}`} />
        <StatCard label="Scorecards" value={`${data.scorecards.length}`} />
        <StatCard label="Average readiness" value={`${avg}/100`} />
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Score distribution</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="range" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
              <Bar dataKey="count" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Recent sessions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Student</TableHead><TableHead>Domain</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.sessions.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>{s.profiles?.full_name ?? s.profiles?.email ?? "—"}</TableCell>
                  <TableCell>{s.company}</TableCell>
                  <TableCell>{s.role}</TableCell>
                  <TableCell className="capitalize">{s.status}</TableCell>
                  <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {s.status === "completed" ? (
                      <Button asChild size="xs" variant="outline" className="h-7 px-2.5 text-[11px] font-medium">
                        <Link to="/scorecard/$id" params={{ id: s.id }}>
                          View Report
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground italic capitalize">{s.status}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </CardContent></Card>
  );
}