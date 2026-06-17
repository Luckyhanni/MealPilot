create table if not exists mealpilot_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into mealpilot_data (key, value)
values
  ('recipes', '[]'::jsonb),
  ('history', '[]'::jsonb),
  ('settings', '{}'::jsonb),
  ('pantry', '{"items":{},"names":{},"categories":{}}'::jsonb),
  ('shoppingState', '{"checked":{}}'::jsonb)
on conflict (key) do nothing;
