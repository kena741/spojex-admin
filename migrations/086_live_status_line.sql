-- Short admin-fed ticker for live room matchup tap (who scored, fight status, etc.).

alter table public.live_events
  add column if not exists status_line text not null default '';

comment on column public.live_events.status_line is
  'Short live ticker from admin, e.g. "Goal · Kebede 67''" or "Knockdown · Round 3".';
