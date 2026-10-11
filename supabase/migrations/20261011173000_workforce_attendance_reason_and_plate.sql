-- Store a driver's plate as employee profile information, not as an implicit vehicle/team assignment.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plate_number text;

-- Preserve plate values already entered through the old registration flow.
UPDATE public.profiles AS p
SET plate_number = v.plate_number
FROM public.vehicles AS v
WHERE p.vehicle_id = v.id
  AND p.plate_number IS NULL;

-- Keep an explicit reason alongside the daily attendance record.
ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS reason text;
