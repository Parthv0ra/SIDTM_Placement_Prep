import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/history")({
  component: History,
});

function History() {
  const { data } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from("interview_sessions").select("*, scorecards(overall_score)")
        .order("created_at", { ascending: false });
      return sessions ?? [];
    },
  });

  return (
    <AppShell title="Interview history" subtitle="All your past attempts and reports">
      <Card>
        <CardHeader><CardTitle className="text-base">Sessions</CardTitle></CardHeader>
        <CardContent>
          {!data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell>{s.company}</TableCell>
                    <TableCell>{s.role}</TableCell>
                    <TableCell className="capitalize">{s.status}</TableCell>
                    <TableCell>{s.scorecards?.[0]?.overall_score ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={s.status === "completed" ? "/scorecard/$id" : "/interview/$id"} params={{ id: s.id }}>
                          {s.status === "completed" ? "Report" : "Resume"}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}