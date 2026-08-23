import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  GraduationCap,
  LayoutDashboard,
  PlusCircle,
  History,
  Shield,
  LogOut,
  ClipboardCheck,
  Calculator,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function AppShell({
  children,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    supabase
      .from("user_roles")
      .select("role")
      .then(({ data }) => {
        setIsAdmin(!!data?.some((r) => r.role === "admin" || r.role === "faculty"));
      });
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-sidebar text-sidebar-foreground md:flex print:hidden">
        <div className="flex items-center gap-2 px-5 py-6">
          <GraduationCap className="h-6 w-6 text-sidebar-primary" />
          <div>
            <p className="text-sm font-semibold leading-none">PlacementPrep</p>
            <p className="mt-1 text-xs text-sidebar-foreground/60">SIDTM</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavItem
            to="/dashboard"
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
          />
          <NavItem
            to="/shortlist-evaluator"
            icon={<ClipboardCheck className="h-4 w-4" />}
            label="Shortlist Evaluator"
          />
          <NavItem
            to="/guesstimates"
            icon={<Calculator className="h-4 w-4" />}
            label="Guesstimates & Cases"
          />
          <NavItem to="/new" icon={<PlusCircle className="h-4 w-4" />} label="New Interview" />
          <NavItem to="/history" icon={<History className="h-4 w-4" />} label="History" />
          {isAdmin && <NavItem to="/admin" icon={<Shield className="h-4 w-4" />} label="Admin" />}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="truncate px-2 pb-2 text-xs text-sidebar-foreground/70">{email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="md:pl-60 print:pl-0">
        <header className="border-b bg-card print:border-b-0 print:bg-transparent">
          <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between gap-4">
            <div>
              {title && (
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              )}
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {action && <div className="flex-shrink-0 print:hidden">{action}</div>}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8 print:py-0">{children}</main>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      activeProps={{ className: "bg-sidebar-accent text-sidebar-foreground" }}
    >
      {icon}
      {label}
    </Link>
  );
}
