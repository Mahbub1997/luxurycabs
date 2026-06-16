
-- Make has_role treat super_admin as admin (and keep exact-match semantics for other roles)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND approved = true
      AND (
        role = _role
        OR (_role = 'admin'::app_role AND role = 'super_admin'::app_role)
      )
  )
$function$;

-- Track last GPS ping time for online drivers
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
