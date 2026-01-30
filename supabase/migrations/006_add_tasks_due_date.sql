-- Ensure tasks has due_date column (date-only).
-- Note: tasks table is created in 003_create_assistant_inbox_tables.sql (with due_at timestamptz).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Helpful index for filtering/sorting by due date (optional).
CREATE INDEX IF NOT EXISTS tasks_user_id_due_date_idx
  ON public.tasks(user_id, due_date);

