import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminDashboardData } from "@/lib/interview.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

function Admin() {
  const getAdminDashboardDataFn = useServerFn(getAdminDashboardData);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"students" | "sessions">("students");

  const { data, isLoading } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      return getAdminDashboardDataFn();
    },
  });

  if (isLoading)
    return (
      <AppShell title="Admin">
        <p>Loading…</p>
      </AppShell>
    );
  if (!data?.isStaff)
    return (
      <AppShell title="Admin">
        <p className="text-sm text-muted-foreground">
          You need faculty or admin permissions to view this page.
        </p>
      </AppShell>
    );

  const avg = data.scorecards.length
    ? Math.round(data.scorecards.reduce((s, c) => s + c.overall_score, 0) / data.scorecards.length)
    : 0;
  const buckets = [0, 20, 40, 60, 80].map((lo) => ({
    range: `${lo}-${lo + 20}`,
    count: data.scorecards.filter((c) => c.overall_score >= lo && c.overall_score < lo + 20).length,
  }));

  // Group data by student
  const studentMap: Record<
    string,
    {
      id: string;
      name: string;
      email: string;
      sessions: any[];
      scorecards: any[];
      avgReadiness: number;
    }
  > = {};

  data.sessions.forEach((s: any) => {
    const userId = s.user_id;
    const profile = s.profiles;
    const name = profile?.full_name ?? profile?.email ?? "Unknown";
    const email = profile?.email ?? "—";

    if (!studentMap[userId]) {
      studentMap[userId] = {
        id: userId,
        name,
        email,
        sessions: [],
        scorecards: [],
        avgReadiness: 0,
      };
    }
    studentMap[userId].sessions.push(s);
  });

  // Attach scorecards to students
  data.scorecards.forEach((c: any) => {
    const userId = c.user_id;
    if (studentMap[userId]) {
      studentMap[userId].scorecards.push(c);
    }
  });

  // Compute average readiness per student
  Object.values(studentMap).forEach((student) => {
    if (student.scorecards.length > 0) {
      const sum = student.scorecards.reduce((sum, c) => sum + c.overall_score, 0);
      student.avgReadiness = Math.round(sum / student.scorecards.length);
    } else {
      student.avgReadiness = 0;
    }
  });

  const studentsList = Object.values(studentMap).sort(
    (a, b) => b.sessions.length - a.sessions.length,
  );

  // Render Student Detail View
  if (selectedStudentId && studentMap[selectedStudentId]) {
    const student = studentMap[selectedStudentId];
    return (
      <AppShell
        title={`Student Profile · ${student.name}`}
        subtitle="Individual progress and mock interview history"
      >
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setSelectedStudentId(null)}
            className="gap-2 text-sm pl-0 hover:bg-transparent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Faculty Panel
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total sessions" value={`${student.sessions.length}`} />
          <StatCard label="Scorecards" value={`${student.scorecards.length}`} />
          <StatCard
            label="Average readiness"
            value={student.scorecards.length ? `${student.avgReadiness}/100` : "—"}
          />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Profile info
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <span className="text-muted-foreground font-medium block">Full Name</span>{" "}
                {student.name}
              </div>
              <div>
                <span className="text-muted-foreground font-medium block mt-1">Email Address</span>{" "}
                {student.email}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Practice history</CardTitle>
              <CardDescription>
                Mock interviews and case studies taken by this student
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.sessions.map((s: any) => {
                    const card = student.scorecards.find((c: any) => c.session_id === s.id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.company}</TableCell>
                        <TableCell>{s.role}</TableCell>
                        <TableCell className="capitalize">{s.status}</TableCell>
                        <TableCell className="font-semibold text-primary">
                          {card ? `${card.overall_score}/100` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(s.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.status === "completed" ? (
                            <Button
                              asChild
                              size="xs"
                              variant="outline"
                              className="h-7 px-2.5 text-[11px] font-medium"
                            >
                              <Link to="/scorecard/$id" params={{ id: s.id }}>
                                View Report
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic capitalize">
                              {s.status}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Faculty panel" subtitle="Aggregate performance across students">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total sessions" value={`${data.sessions.length}`} />
        <StatCard label="Scorecards" value={`${data.scorecards.length}`} />
        <StatCard label="Average readiness" value={`${avg}/100`} />
      </div>

      <div className="mt-6 flex border-b border-border">
        <button
          onClick={() => setActiveTab("students")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "students"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Students Directory
        </button>
        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "sessions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Score Distribution & Sessions
        </button>
      </div>

      {activeTab === "students" ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Students list</CardTitle>
            <CardDescription>
              Select a student to view their personal dashboard and individual sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sessions Taken</TableHead>
                  <TableHead>Average Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsList.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-semibold">{student.name}</TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>{student.sessions.length} sessions</TableCell>
                    <TableCell className="font-medium text-primary">
                      {student.scorecards.length ? `${student.avgReadiness}/100` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        className="h-7 px-2.5 text-[11px] font-medium"
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Score distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="range" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  />
                  <Bar dataKey="count" fill="var(--primary)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sessions.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.profiles?.full_name ?? s.profiles?.email ?? "—"}</TableCell>
                      <TableCell>{s.company}</TableCell>
                      <TableCell>{s.role}</TableCell>
                      <TableCell className="capitalize">{s.status}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(s.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "completed" ? (
                          <Button
                            asChild
                            size="xs"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] font-medium"
                          >
                            <Link to="/scorecard/$id" params={{ id: s.id }}>
                              View Report
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic capitalize">
                            {s.status}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
