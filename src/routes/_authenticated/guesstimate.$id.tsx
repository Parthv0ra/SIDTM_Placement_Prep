import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { scoreResponse, finalizeSession } from "@/lib/interview.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Calculator, Lightbulb, CheckCircle2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/guesstimate/$id")({
  component: GuesstimateSession,
});

function GuesstimateSession() {
  const { id } = Route.useParams();
  const router = useRouter();
  const scoreFn = useServerFn(scoreResponse);
  const finalizeFn = useServerFn(finalizeSession);

  const { data, isLoading } = useQuery({
    queryKey: ["session", id],
    queryFn: async () => {
      const [{ data: session }, { data: questions }] = await Promise.all([
        supabase.from("interview_sessions").select("*").eq("id", id).single(),
        supabase.from("questions").select("*").eq("session_id", id).order("order_index"),
      ]);
      return { session, questions: questions ?? [] };
    },
  });

  const [scratchpad, setScratchpad] = useState("");
  const [finalValue, setFinalValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <AppShell title="Guesstimate Practice">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const session = data?.session;
  const question = data?.questions?.[0];

  if (!session || !question) {
    return (
      <AppShell title="Guesstimate Practice">
        <p className="text-sm text-muted-foreground">Session or question not found.</p>
      </AppShell>
    );
  }

  async function handleSubmit() {
    if (!scratchpad.trim()) {
      return toast.error("Please draft your drivers and calculations in the scratchpad.");
    }
    if (!finalValue.trim()) {
      return toast.error("Please enter your final numerical estimate.");
    }

    setSubmitting(true);
    try {
      // 1. Create a dummy response row in database
      const { data: user } = await supabase.auth.getUser();
      const { data: respRow, error: respErr } = await supabase
        .from("responses")
        .insert({
          session_id: id,
          question_id: question.id,
          user_id: user.user!.id,
          transcript: `FINAL ESTIMATE: ${finalValue.trim()}\n\nSCRATCHPAD CALCULATIONS:\n${scratchpad.trim()}`,
        })
        .select()
        .single();

      if (respErr || !respRow) throw new Error(respErr?.message ?? "Response insert failed");

      // 2. Call scoreResponse server function
      await scoreFn({
        data: {
          responseId: respRow.id,
        },
      });

      // 3. Finalize session to build scorecard
      await finalizeFn({ data: { sessionId: id } });

      toast.success("Solution submitted successfully!");
      router.navigate({ to: "/scorecard/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title={`Case Practice · ${session.role}`} subtitle="Draft your breakdown, state your assumptions, and compute your final estimate.">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                Estimation Question
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="text-sm font-semibold p-4 rounded-lg bg-primary/5 text-primary border border-primary/10 leading-relaxed">
                {question.question_text}
              </div>

              <div className="space-y-2">
                <Label htmlFor="scratchpad" className="text-sm font-medium">Your Scratchpad Workspace</Label>
                <Textarea
                  id="scratchpad"
                  rows={12}
                  value={scratchpad}
                  onChange={(e) => setScratchpad(e.target.value)}
                  placeholder="Draft your solution here. Best practices:
1. Define your formula and core drivers (e.g. population -> age filters -> frequency -> market share).
2. Explicitly state assumptions for each value.
3. Walk through the math step-by-step.
4. Perform a quick sanity check at the end."
                  className="font-mono text-xs leading-normal resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="final-value">Final Estimated Number / Value</Label>
                  <Input
                    id="final-value"
                    placeholder="e.g. 5,000 phones/day or Rs. 12 Lakhs"
                    value={finalValue}
                    onChange={(e) => setFinalValue(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Evaluating with AI Placement Coach...
                    </>
                  ) : (
                    <>
                      Submit Solution <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Lightbulb className="h-4 w-5 text-amber-500" />
                Case Prep Advice
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-4 leading-relaxed">
              <div>
                <h4 className="font-semibold text-foreground mb-1">1. Don't worry about exact facts</h4>
                <p>Interviewer wants to see your **logical breakdown** (drivers) rather than a perfectly correct population or market value. Logical consistency is everything.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">2. Use round numbers for calculations</h4>
                <p>Round Pune's population to 40 Lakhs (4 million) or India's population to 140 Crore (1.4 billion) to keep calculations simple and speed up mental math.</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">3. Document assumptions clearly</h4>
                <p>Instead of jumping to a number, say "Assuming the average lifespan of a smartphone is 2 years, the daily replacement rate is population / (2 * 365)..."</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Sanity Check Rule:</span> Compare your final number to global benchmarks. If you estimate Pune phone sales at 10 million a day (higher than Pune's population), your drivers are scaled incorrectly!
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
