create table public.brands (
  id           bigint generated always as identity primary key,
  name         text not null unique check (length(trim(name)) between 1 and 60),
  redirect_url text check (redirect_url is null or redirect_url ~ '^https://[^\s]+$'),
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.brands enable row level security;
create policy "alle lesen marken" on public.brands for select to anon, authenticated using (true);
create policy "admins pflegen marken" on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.brands (name, redirect_url, sort) values
  ('Technogym', null, 1), ('Matrix', null, 2),
  ('Life Fitness', 'https://www.lifefitness.com/de-de/kundendienst', 3);

create or replace function public.submit_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_urgency text := case when p->>'urgency' in ('down','limited','none') then p->>'urgency' else 'none' end;
  v_email text := left(trim(coalesce(p->>'email','')), 160);
  v_photos text[];
begin
  if length(trim(coalesce(p->>'name',''))) = 0 or length(trim(coalesce(p->>'studio',''))) = 0
     or length(trim(coalesce(p->>'phone',''))) = 0 or v_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'Bitte Studio, Name, Telefon und gültige E-Mail angeben.';
  end if;
  -- Marken mit Weiterleitung (im Backend gesetzt) werden nicht angenommen
  if exists (select 1 from public.brands where redirect_url is not null and lower(name) = lower(trim(coalesce(p->>'brand','')))) then
    raise exception 'BRAND_REDIRECT';
  end if;
  -- Vertraglich: Life-Fitness-Geräte werden nicht über dieses Formular angenommen
  if concat_ws(' ', p->>'brand', p->>'model', p->>'description') ~* 'life[\s-]*fitness' then
    raise exception 'LIFE_FITNESS';
  end if;
  -- Spamschutz: höchstens 5 Meldungen pro E-Mail und Stunde
  if (select count(*) from public.tickets where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Zu viele Meldungen. Bitte rufen Sie uns an.';
  end if;
  select coalesce(array_agg(x), '{}') into v_photos
    from jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) x
   where x like 'incoming/%' and length(x) < 120 limit 4;

  insert into public.tickets (priority, type, category, brand, model, urgency, description, studio, name, phone, email, location, photos)
  values (case v_urgency when 'down' then 'hoch' when 'limited' then 'mittel' else 'niedrig' end,
          left(p->>'type',40), left(p->>'category',60), left(p->>'brand',80), left(p->>'model',80), v_urgency,
          left(p->>'description',3000), left(trim(p->>'studio'),120), left(trim(p->>'name'),120),
          left(trim(p->>'phone'),40), v_email, left(p->>'location',120), v_photos)
  returning id into v_id;
  insert into public.ticket_events (ticket_id, kind, text) values (v_id, 'created', 'Meldung über die Website eingegangen');
  return jsonb_build_object('id', v_id, 'ref', 'T-' || lpad(v_id::text, 4, '0'));
end $$;
