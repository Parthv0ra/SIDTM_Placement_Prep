import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { scoreResponse, finalizeSession } from "@/lib/interview.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, Square, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
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

  // Eye and Face Tracking States
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const [currentInfractionType, setCurrentInfractionType] = useState<
    "none" | "out-of-frame" | "looking-away"
  >("none");
  const [terminated, setTerminated] = useState(false);

  const faceMeshRef = useRef<any>(null);
  const infractionStartRef = useRef<number | null>(null);

  // 1. Dynamic Script Loader for MediaPipe Face Mesh
  useEffect(() => {
    if ((window as any).FaceMesh) {
      setScriptsLoaded(true);
      return;
    }

    const existing = document.querySelector('script[src*="face_mesh.js"]');
    if (existing) {
      existing.addEventListener("load", () => setScriptsLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
    script.crossOrigin = "anonymous";
    script.onload = () => setScriptsLoaded(true);
    script.onerror = () => toast.error("Failed to load eye tracking library.");
    document.head.appendChild(script);
  }, []);

  // 2. Initialize FaceMesh Instance
  useEffect(() => {
    if (!scriptsLoaded) return;

    const FaceMeshClass = (window as any).FaceMesh;
    if (!FaceMeshClass) return;

    const fm = new FaceMeshClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    fm.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // required for eye iris coordinates
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    fm.onResults(handleTrackingResults);
    faceMeshRef.current = fm;

    return () => {
      fm.close();
    };
  }, [scriptsLoaded]);

  // 3. Process Video Frames when Recording
  useEffect(() => {
    let animId: number;
    let isProcessing = false;

    async function processFrame() {
      if (!recording || !videoRef.current || !faceMeshRef.current) {
        return;
      }

      const video = videoRef.current;
      if (video.readyState >= 2 && !isProcessing) {
        isProcessing = true;
        try {
          await faceMeshRef.current.send({ image: video });
        } catch (e) {
          console.error("Tracking process error:", e);
        }
        isProcessing = false;
      }
      animId = requestAnimationFrame(processFrame);
    }

    if (recording) {
      animId = requestAnimationFrame(processFrame);
    } else {
      infractionStartRef.current = null;
      setCurrentInfractionType("none");
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [recording]);

  // 4. Analyze Landmarks for Gaze and Head Pose
  function handleTrackingResults(results: any) {
    if (!recording) {
      infractionStartRef.current = null;
      setCurrentInfractionType("none");
      return;
    }

    let infraction = false;
    let type: "none" | "out-of-frame" | "looking-away" = "none";

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      infraction = true;
      type = "out-of-frame";
    } else {
      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[4];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];
      const forehead = landmarks[10];
      const chin = landmarks[152];

      // Calculate Yaw (looking left/right) and Pitch (looking up/down) ratios
      const yawRatio = (nose.x - leftCheek.x) / (rightCheek.x - leftCheek.x);
      const pitchRatio = (nose.y - forehead.y) / (chin.y - forehead.y);

      // Left eye corner bounds + iris
      const leftOuter = landmarks[33];
      const leftInner = landmarks[133];
      const leftIris = landmarks[468];
      const leftGazeRatio = (leftIris.x - leftOuter.x) / (leftInner.x - leftOuter.x);

      // Right eye corner bounds + iris
      const rightInner = landmarks[362];
      const rightOuter = landmarks[263];
      const rightIris = landmarks[473];
      const rightGazeRatio = (rightIris.x - rightInner.x) / (rightOuter.x - rightInner.x);

      // Define Head turned infraction thresholds
      const headTurned =
        yawRatio < 0.32 || yawRatio > 0.68 || pitchRatio < 0.34 || pitchRatio > 0.68;

      // Define Gaze shifted infraction thresholds
      const gazeShifted =
        (leftGazeRatio < 0.35 && rightGazeRatio < 0.35) ||
        (leftGazeRatio > 0.65 && rightGazeRatio > 0.65);

      if (headTurned || gazeShifted) {
        infraction = true;
        type = "looking-away";
      }
    }

    if (infraction) {
      if (infractionStartRef.current === null) {
        infractionStartRef.current = Date.now();
      } else {
        const durationSec = (Date.now() - infractionStartRef.current) / 1000;
        if (durationSec >= 3) {
          // Warning threshold met!
          infractionStartRef.current = null;
          setWarnings((w) => {
            const nextW = w + 1;
            if (nextW >= 3) {
              handleTerminateInterview();
            } else {
              toast.error(
                `Camera Warning ${nextW}/3: Please stay focused and look at the screen.`,
                {
                  duration: 4000,
                },
              );
            }
            return nextW;
          });
        }
      }
      setCurrentInfractionType(type);
    } else {
      infractionStartRef.current = null;
      setCurrentInfractionType("none");
    }
  }

  function handleTerminateInterview() {
    stopRec();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setTerminated(true);
    toast.error("Interview stopped due to eye tracking warning limit.");
  }

  // Camera and Audio Access Hook
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
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const questions = data?.questions ?? [];
  const current = questions[idx];
  const total = questions.length;

  function startRec() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const mr = new MediaRecorder(streamRef.current, { mimeType: mime });
    mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    mr.onstop = handleStop;
    recorderRef.current = mr;
    mr.start();
    setRecording(true);
    setSeconds(PER_QUESTION_SECONDS);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          stopRec();
          return 0;
        }
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
      const { error: upErr } = await supabase.storage
        .from("recordings")
        .upload(path, blob, { contentType: "video/webm" });
      if (upErr) throw new Error(upErr.message);

      const duration = PER_QUESTION_SECONDS - seconds;
      const { data: resp, error: rErr } = await supabase
        .from("responses")
        .insert({
          user_id: uid,
          session_id: id,
          question_id: current.id,
          recording_path: path,
          duration_sec: duration,
          scores: {},
        })
        .select()
        .single();
      if (rErr || !resp) throw new Error(rErr?.message ?? "Could not save response");
      await scoreFn({ data: { responseId: resp.id } });

      setFinished((f) => {
        const nf = [...f];
        nf[idx] = true;
        return nf;
      });

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

  if (terminated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full border-destructive/30 shadow-lg animate-in fade-in-50 zoom-in-95 duration-200">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Interview Disqualified</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This session was automatically stopped because you looked away from the camera or
              moved out of the frame 3 times.
            </p>
            <Button className="w-full mt-2" onClick={() => router.navigate({ to: "/dashboard" })}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!current) return <div className="p-6">No questions in this session.</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Question {idx + 1} of {total} · {current.category}
            </p>
          </div>
          <div className="font-mono text-lg tabular-nums text-primary">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </div>
        </div>
        <Progress value={(idx / total) * 100} className="mb-6 h-1" />

        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-medium leading-relaxed">{current.question_text}</p>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="relative overflow-hidden rounded-lg border bg-black aspect-video w-full flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {recording && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> REC
              </span>
            )}

            {recording && currentInfractionType !== "none" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-xs text-center p-4">
                <div className="text-white space-y-2 max-w-xs">
                  <AlertTriangle className="h-8 w-8 text-destructive mx-auto animate-bounce" />
                  <p className="text-sm font-bold text-destructive uppercase tracking-wider">
                    {currentInfractionType === "out-of-frame"
                      ? "Face Not Detected"
                      : "Please Look at Camera"}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Make sure you are centered in frame and looking at the screen. Warnings:{" "}
                    {warnings}/3
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {!recording ? (
              <Button size="lg" onClick={startRec} disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scoring…
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" /> Start answer
                  </>
                )}
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={stopRec}>
                <Square className="mr-2 h-4 w-4" /> Stop & submit
              </Button>
            )}

            {recording && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Camera Warnings:
                </span>
                <span className="font-semibold">{warnings} / 3</span>
              </div>
            )}

            <div className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
              One-shot recording per question. Speak clearly, use the STAR structure for behavioural
              answers.
            </div>
            <ul className="space-y-1 text-xs">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  className={`flex items-center gap-2 ${i === idx ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {finished[i] ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border" />
                  )}
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
