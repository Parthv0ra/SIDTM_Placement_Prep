-- Grant execute permission on has_role function to authenticated and anonymous users
-- This is required because RLS policies on profiles, resumes, jds, sessions, etc. use public.has_role
grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;
