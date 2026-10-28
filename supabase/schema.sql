-- Fitnessgeräte Service Mack – Datenbank für Supabase.
-- Einfügen im Supabase-Dashboard unter "SQL Editor" und ausführen.

create table public.tickets (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  status      text not null default 'neu'    check (status   in ('neu','geprueft','termin','in_arbeit','teile','erledigt')),
  priority    text not null default 'mittel' check (priority in ('hoch','mittel','niedrig')),
  type text, category text, brand text, model text, urgency text, description text,
  studio text, name text, phone text, email text, location text,
  assignee    text not null default '',
  due         date,
  photos      text[] not null default '{}',
  archived    boolean not null default false
);

create table public.ticket_events (
  id        bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  at        timestamptz not null default now(),
  kind      text not null,
  text      text not null
);

-- Wer im Backend arbeiten darf (nach dem Anlegen des Logins eintragen, siehe README)
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

alter table public.tickets       enable row level security;
alter table public.ticket_events enable row level security;
alter table public.admins        enable row level security;

-- Aufträge und Verlauf: nur Admins. Besucher der Website haben KEINEN direkten Zugriff.
create policy "admins tickets" on public.tickets       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins events"  on public.ticket_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin sieht sich" on public.admins for select to authenticated using (user_id = auth.uid());

-- Neue Meldung von der Website: einzige Schreib-Möglichkeit für Besucher, mit Prüfungen.
create function public.submit_ticket(p jsonb) returns jsonb
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
revoke all on function public.submit_ticket(jsonb) from public;
grant execute on function public.submit_ticket(jsonb) to anon, authenticated;

-- Foto-Speicher: privat. Besucher dürfen nur hochladen (Ordner "incoming"), nur Admins dürfen lesen/löschen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-photos', 'ticket-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "upload incoming" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'ticket-photos' and (storage.foldername(name))[1] = 'incoming');
create policy "admins lesen fotos" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-photos' and public.is_admin());
create policy "admins loeschen fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'ticket-photos' and public.is_admin());
