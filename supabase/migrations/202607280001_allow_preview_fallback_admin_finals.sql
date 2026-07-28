DROP POLICY IF EXISTS "Admins can insert finals results" ON public.finals_results;
CREATE POLICY "Admins can insert finals results"
ON public.finals_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND (
        profiles.environment = finals_results.environment
        OR (
          finals_results.environment = 'preview'
          AND profiles.environment = 'production'
        )
      )
  )
);

DROP POLICY IF EXISTS "Admins can update finals results" ON public.finals_results;
CREATE POLICY "Admins can update finals results"
ON public.finals_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND (
        profiles.environment = finals_results.environment
        OR (
          finals_results.environment = 'preview'
          AND profiles.environment = 'production'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND (
        profiles.environment = finals_results.environment
        OR (
          finals_results.environment = 'preview'
          AND profiles.environment = 'production'
        )
      )
  )
);
