import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { scoreResponse, finalizeSession, askCaseAssistant } from "@/lib/interview.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Calculator, Lightbulb, CheckCircle2, ChevronRight, Sparkles, Brain, Mic, MicOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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

  const [clarifyingQuestion, setClarifyingQuestion] = useState("");
  const [clarifyingChat, setClarifyingChat] = useState<Array<{ role: "candidate" | "interviewer"; text: string }>>([]);
  const [clarifyingLoading, setClarifyingLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  function toggleListening() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in your browser. Try Google Chrome.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setClarifyingQuestion((prev) => {
              const cleanedPrev = prev.trim();
              return cleanedPrev ? `${cleanedPrev} ${transcript}` : transcript;
            });
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
          if (event.error === "not-allowed") {
            toast.error("Microphone permission denied. Please allow microphone access.");
          } else if (event.error !== "aborted") {
            toast.error(`Voice input error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        setIsListening(false);
      }
    }
  }

  const askCaseAssistantFn = useServerFn(askCaseAssistant);

  async function handleAskClarifying(manualQuery?: string) {
    const query = manualQuery || clarifyingQuestion;
    if (!query.trim()) return;

    setClarifyingLoading(true);

    // Append candidate question to chat log
    const newChat = [...clarifyingChat, { role: "candidate" as const, text: query }];
    setClarifyingChat(newChat);
    setClarifyingQuestion("");

    try {
      // Query the AI coach server function
      const response = await askCaseAssistantFn({
        data: {
          question: `Act as the case interviewer. Answer the candidate's clarifying question: "${query}". Keep the response realistic, short, and structured. Return raw text without json formats.`,
          contextCaseText: `Role: ${session?.role || "Consulting Candidate"}\nQuestion: ${question?.question_text || ""}`
        }
      });

      setClarifyingChat([...newChat, { role: "interviewer" as const, text: response.answer }]);
    } catch (e) {
      toast.error("Failed to reach interviewer");
    } finally {
      setClarifyingLoading(false);
    }
  }

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

    setSubmitting(true);
    try {
      // 1. Create a dummy response row in database
      const { data: user } = await supabase.auth.getUser();
      const chatLog = clarifyingChat.length > 0
        ? `INTERVIEWER DISCUSSION CHAT LOG:\n${clarifyingChat.map(c => `${c.role === "candidate" ? "Candidate" : "Interviewer"}: ${c.text}`).join("\n")}\n\n`
        : "";
      const finalValText = finalValue.trim() || "N/A (Approach-only Case)";

      const { data: respRow, error: respErr } = await supabase
        .from("responses")
        .insert({
          session_id: id,
          question_id: question.id,
          user_id: user.user!.id,
          transcript: `${chatLog}FINAL ESTIMATE: ${finalValText}\n\nSCRATCHPAD CALCULATIONS:\n${scratchpad.trim()}`,
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

              {/* Clarifying Questions Section (Inline Interviewer Discussion) */}
              <div className="p-4 rounded-lg border border-primary/20 bg-secondary/5 space-y-3">
                <div className="flex justify-between items-center pb-1.5 border-b border-primary/10">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Interviewer Discussion Feed</span>
                  </div>
                  {clarifyingChat.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="xs" 
                      className="h-5 text-[10px] px-1.5 text-muted-foreground hover:bg-transparent"
                      onClick={() => setClarifyingChat([])}
                    >
                      Reset Discussion
                    </Button>
                  )}
                </div>

                {/* Inline Chat Log */}
                {clarifyingChat.length > 0 && (
                  <div className="max-h-[220px] overflow-y-auto pr-1 space-y-3 border-b border-dashed pb-3">
                    {clarifyingChat.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`flex flex-col ${msg.role === "candidate" ? "items-end" : "items-start"}`}
                      >
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">
                          {msg.role === "candidate" ? "You (Candidate)" : "Interviewer"}
                        </span>
                        <div className={`p-2.5 rounded-lg text-xs leading-relaxed max-w-[85%] font-normal whitespace-pre-wrap ${
                          msg.role === "candidate" 
                            ? "bg-primary text-primary-foreground rounded-tr-none" 
                            : "bg-secondary/40 text-foreground rounded-tl-none border border-secondary"
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {clarifyingLoading && (
                      <div className="flex justify-start items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span className="text-[10px] text-muted-foreground animate-pulse">Interviewer is replying...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Input row */}
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={clarifyingQuestion}
                        onChange={(e) => setClarifyingQuestion(e.target.value)}
                        placeholder="Ask a clarifying question... e.g. What is the geographical scope? Or what is the core objective?"
                        className="w-full text-xs pl-3 pr-10 py-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                        disabled={clarifyingLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAskClarifying();
                        }}
                      />
                      <button
                        type="button"
                        onClick={toggleListening}
                        disabled={clarifyingLoading}
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all duration-200 ${
                          isListening
                            ? "bg-destructive/10 text-destructive animate-pulse ring-2 ring-destructive/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        title={isListening ? "Stop listening" : "Ask with voice"}
                      >
                        {isListening ? (
                          <MicOff className="h-3.5 w-3.5" />
                        ) : (
                          <Mic className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <Button 
                      onClick={() => handleAskClarifying()} 
                      disabled={clarifyingLoading || !clarifyingQuestion.trim()} 
                      size="sm" 
                      className="text-xs h-8"
                    >
                      {clarifyingLoading ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Replying...</>
                      ) : (
                        "Ask Interviewer"
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Ask Clarifying Questions to gather key parameters before drafting your solution. The interviewer's answers will appear right here!
                  </p>
                </div>
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
                  <Label htmlFor="final-value">Final Estimated Number / Value (Optional)</Label>
                  <Input
                    id="final-value"
                    placeholder="e.g. Rs. 12 Lakhs or leave blank for approach-only"
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
            <CardHeader className="pb-3">
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
