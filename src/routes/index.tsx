import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GraduationCap, Sparkles, Video, BarChart3, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">PlacementPrep</span>
            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              SIDTM
            </span>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" /> AI-powered mock interviews
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Land your dream placement with data-backed practice.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Upload your resume, target a company and role, and take live mock interviews. Get a
              multi-dimensional scorecard, personalized feedback, and track your readiness over
              time.
            </p>
            <div className="mt-6 flex gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth">Faculty login</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Available to students with an @sidtm.edu.in email.
            </p>
          </div>
          <div className="grid gap-4">
            <Feature
              icon={<Video className="h-5 w-5" />}
              title="Live video mock interviews"
              body="Webcam + mic recording with per-question timers and transcription."
            />
            <Feature
              icon={<BarChart3 className="h-5 w-5" />}
              title="Multi-dimensional scoring"
              body="Relevance, communication, structure, fluency, confidence — every attempt."
            />
            <Feature
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Resume + JD matching"
              body="Gap analysis and personalized question sets tailored to each role."
            />
          </div>
        </div>
      </section>
      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground">
          © SIDTM Placement Cell
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
