import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { scoreResponse, finalizeSession } from "@/lib/interview.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, Square, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interview/$id")({
  component: LiveInterview,
});

const PER_QUESTION_SECONDS = 120;

function LiveInterview() {
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

  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(PER_QUESTION_SECONDS);
  const [finished, setFinished] = useState<boolean[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch {
        toast.error("Camera/mic permission required.");
      }
    })();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const questions = data?.questions ?? [];
  const current = questions[idx];
  const total = questions.length;

  function startRec() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
    mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    mr.onstop = handleStop;
    recorderRef.current = mr;
    mr.start();
    setRecording(true);
    setSeconds(PER_QUESTION_SECONDS);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { stopRec(); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function stopRec() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  async function handleStop() {
    if (!current) return;
    setProcessing(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user!.id;
      const path = `${uid}/${id}/q${idx}-${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from("recordings").upload(path, blob, { contentType: "video/webm" });
      if (upErr) throw new Error(upErr.message);

      const duration = PER_QUESTION_SECONDS - seconds;
      const { data: resp, error: rErr } = await supabase.from("responses").insert({
        user_id: uid,
        session_id: id,
        question_id: current.id,
        recording_path: path,
        duration_sec: duration,
        scores: {},
      }).select().single();
      if (rErr || !resp) throw new Error(rErr?.message ?? "Could not save response");
      await scoreFn({ data: { responseId: resp.id } });

      setFinished((f) => { const nf = [...f]; nf[idx] = true; return nf; });

      if (idx + 1 < total) {
        setIdx(idx + 1);
        setSeconds(PER_QUESTION_SECONDS);
      } else {
        toast.info("Finalizing your scorecard…");
        await finalizeFn({ data: { sessionId: id } });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        router.navigate({ to: "/scorecard/$id", params: { id } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not score response");
    } finally {
      setProcessing(false);
    }
  }

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!current) return <div className="p-6">No questions in this session.</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Question {idx + 1} of {total} · {current.category}</p>
          </div>
          <div className="font-mono text-lg tabular-nums text-primary">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </div>
        </div>
        <Progress value={((idx) / total) * 100} className="mb-6 h-1" />

        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-medium leading-relaxed">{current.question_text}</p>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="relative overflow-hidden rounded-lg border bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full" />
            {recording && <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> REC</span>}
          </div>
          <div className="flex flex-col gap-3">
            {!recording ? (
              <Button size="lg" onClick={startRec} disabled={processing}>
                {processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scoring…</> : <><Mic className="mr-2 h-4 w-4" /> Start answer</>}
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={stopRec}>
                <Square className="mr-2 h-4 w-4" /> Stop & submit
              </Button>
            )}
            <div className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
              One-shot recording per question. Speak clearly, use the STAR structure for behavioural answers.
            </div>
            <ul className="space-y-1 text-xs">
              {questions.map((q, i) => (
                <li key={q.id} className={`flex items-center gap-2 ${i === idx ? "text-foreground" : "text-muted-foreground"}`}>
                  {finished[i] ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5 rounded-full border" />}
                  Q{i + 1} · {q.category}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
