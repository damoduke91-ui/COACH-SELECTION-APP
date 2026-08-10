DROP POLICY IF EXISTS "Admins can read team audit log" ON public.admin_team_audit_log;
DROP POLICY IF EXISTS "Admins can insert team audit log" ON public.admin_team_audit_log;

CREATE POLICY "Admins can read team audit log"
ON public.admin_team_audit_log FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND (
        profiles.environment = admin_team_audit_log.environment
        OR (admin_team_audit_log.environment = 'preview' AND profiles.environment = 'production')
      )
  )
);

CREATE POLICY "Admins can insert team audit log"
ON public.admin_team_audit_log FOR INSERT TO authenticated
WITH CHECK (
  admin_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND (
        profiles.environment = admin_team_audit_log.environment
        OR (admin_team_audit_log.environment = 'preview' AND profiles.environment = 'production')
      )
  )
);
