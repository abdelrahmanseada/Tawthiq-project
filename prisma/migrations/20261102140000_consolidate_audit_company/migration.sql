-- Audit rows are not foreign-keyed to Company, so move any rows that still point
-- at a company removed by the consolidation migration.
DO $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id FROM "Company" ORDER BY created_at ASC LIMIT 1;
  IF target_id IS NOT NULL THEN
    UPDATE "AuditLog"
    SET company_id = target_id
    WHERE company_id IS NOT NULL AND company_id <> target_id;
  END IF;
END $$;
