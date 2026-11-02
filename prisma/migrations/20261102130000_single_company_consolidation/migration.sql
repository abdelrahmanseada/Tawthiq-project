-- Preserve existing tenant records while consolidating the abandoned multi-company
-- build into the single Bremer company. Runs after the schema migration above.
DO $$
DECLARE
  target_id uuid;
  extra record;
BEGIN
  SELECT id INTO target_id FROM "Company" ORDER BY created_at ASC LIMIT 1;
  IF target_id IS NULL THEN
    RETURN;
  END IF;

  FOR extra IN SELECT id, slug FROM "Company" WHERE id <> target_id LOOP
    -- Avoid the (company_id, employee_code) unique collision while moving records.
    UPDATE "Employee" e
    SET employee_code = left(e.employee_code, 48) || '-' || left(extra.slug, 12)
    WHERE e.company_id = extra.id
      AND EXISTS (
        SELECT 1 FROM "Employee" t
        WHERE t.company_id = target_id AND t.employee_code = e.employee_code
      );

    UPDATE "Employee" SET company_id = target_id WHERE company_id = extra.id;
    UPDATE "AdminUser" SET company_id = target_id WHERE company_id = extra.id;
    UPDATE "ImportBatch" SET company_id = target_id WHERE company_id = extra.id;
    UPDATE "ScanLog" SET company_id = target_id WHERE company_id = extra.id;
    UPDATE "VerificationReport" SET company_id = target_id WHERE company_id = extra.id;
    DELETE FROM "Company" WHERE id = extra.id;
  END LOOP;

  UPDATE "Company"
  SET name = 'Bremer',
      slug = 'bremer',
      tagline = CASE WHEN tagline = '' THEN 'Established 1989' ELSE tagline END,
      primary_color = CASE WHEN primary_color IN ('#0F766E', '#0f766e') THEN '#000000' ELSE primary_color END,
      secondary_color = CASE WHEN secondary_color IN ('#F59E0B', '#f59e0b') THEN '#8F0015' ELSE secondary_color END
  WHERE id = target_id;
END $$;
