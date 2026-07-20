import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PlacementPrep" },
      { name: "description", content: "Sign in to PlacementPrep with your SIDTM email." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.navigate({ to: "/dashboard", replace: true });
    });
  }, [router]);

  async function onSignIn(email: string, password: string) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    router.navigate({ to: "/dashboard", replace: true });
  }

  async function onSignUp(email: string, password: string, fullName: string) {
    if (!/@sidtm\.edu\.in$/i.test(email)) {
      toast.error("Only @sidtm.edu.in emails are allowed.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Signing you in…");
    router.navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <GraduationCap className="h-5 w-5 text-primary" /> PlacementPrep · SIDTM
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Use your @sidtm.edu.in email to access the placement platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <AuthForm submitLabel="Sign in" loading={loading} onSubmit={(e, p) => onSignIn(e, p)} />
              </TabsContent>
              <TabsContent value="signup">
                <AuthForm submitLabel="Create account" loading={loading} withName onSubmit={(e, p, n) => onSignUp(e, p, n ?? "")} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuthForm({
  onSubmit, submitLabel, loading, withName,
}: { onSubmit: (email: string, password: string, name?: string) => void; submitLabel: string; loading: boolean; withName?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  return (
    <form
      className="space-y-3 pt-4"
      onSubmit={(e) => { e.preventDefault(); onSubmit(email, password, name); }}
    >
      {withName && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">College email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@sidtm.edu.in" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Please wait…" : submitLabel}</Button>
    </form>
  );
}