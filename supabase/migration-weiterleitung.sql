alter table public.tickets add column if not exists redirected_to text;
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('neu','geprueft','termin','in_arbeit','teile','erledigt','weitergeleitet'));

create or replace function public.submit_ticket(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_urgency text := case when p->>'urgency' in ('down','limited','none') then p->>'urgency' else 'none' end;
  v_email text := left(trim(coalesce(p->>'email','')), 160);
  v_photos text[];
  v_rname text; v_rurl text;
begin
  if length(trim(coalesce(p->>'name',''))) = 0 or length(trim(coalesce(p->>'studio',''))) = 0
     or length(trim(coalesce(p->>'phone',''))) = 0 or v_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'Bitte Studio, Name, Telefon und gültige E-Mail angeben.';
  end if;
  if (select count(*) from public.tickets where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Zu viele Meldungen. Bitte rufen Sie uns an.';
  end if;

  -- Marke mit Vertrag/Weiterleitung? Dann wird die Meldung gespeichert (Lead), aber als "weitergeleitet" markiert.
  select name, redirect_url into v_rname, v_rurl from public.brands
   where redirect_url is not null and lower(name) = lower(trim(coalesce(p->>'brand','')));
  if v_rname is null and concat_ws(' ', p->>'brand', p->>'model', p->>'description') ~* 'life[\s-]*fitness' then
    select name, redirect_url into v_rname, v_rurl from public.brands
     where redirect_url is not null and name ~* 'life[\s-]*fitness' limit 1;
    if v_rname is null then v_rname := 'Life Fitness'; v_rurl := 'https://www.lifefitness.com/de-de/kundendienst'; end if;
  end if;

  select coalesce(array_agg(x), '{}') into v_photos
    from jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) x
   where x like 'incoming/%' and length(x) < 120 limit 4;

  insert into public.tickets (status, priority, redirected_to, type, category, brand, model, urgency, description, studio, name, phone, email, location, photos)
  values (case when v_rname is not null then 'weitergeleitet' else 'neu' end,
          case when v_rname is not null then 'niedrig' else case v_urgency when 'down' then 'hoch' when 'limited' then 'mittel' else 'niedrig' end end,
          v_rname,
          left(p->>'type',40), left(p->>'category',60), left(p->>'brand',80), left(p->>'model',80), v_urgency,
          left(p->>'description',3000), left(trim(p->>'studio'),120), left(trim(p->>'name'),120),
          left(trim(p->>'phone'),40), v_email, left(p->>'location',120), v_photos)
  returning id into v_id;
  insert into public.ticket_events (ticket_id, kind, text)
  values (v_id, 'created', case when v_rname is not null then 'Meldung eingegangen – Kunde an ' || v_rname || ' verwiesen (Vertrag)' else 'Meldung über die Website eingegangen' end);
  return jsonb_build_object('id', v_id, 'ref', 'T-' || lpad(v_id::text, 4, '0'), 'redirect_name', v_rname, 'redirect_url', v_rurl);
end $$;
