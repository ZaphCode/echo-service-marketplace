-- =============================================
-- PWA (web/): notificaciones push y dos correcciones del esquema
-- =============================================

-- 1. notification.type: la app ya inserta PROVIDER:NEW_APPLICATION al aplicar a una contratación,
--    pero el CHECK original no lo permitía y la inserción fallaba en silencio.
alter table public.notification drop constraint if exists notification_type_check;
alter table public.notification add constraint notification_type_check check (
  type in ('PROVIDER:NEW_REQUEST', 'PROVIDER:NEW_APPLICATION', 'CLIENT:NEW_OFFER', 'PROVIDER:NEW_OFFER', 'SYSTEM:INFO')
);

-- 2. contracting no actualizaba updated_at, y la cola offline de la app lo usa para detectar conflictos.
drop trigger if exists set_contracting_updated_at on public.contracting;
create trigger set_contracting_updated_at
  before update on public.contracting
  for each row execute function public.handle_updated_at();

-- 3. Suscripciones Web Push de cada navegador. Un usuario puede tener varias (celular, laptop).
create table if not exists public.web_push_subscription (
  id bigint generated always as identity primary key,
  "user" uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists web_push_subscription_user_idx on public.web_push_subscription("user");

alter table public.web_push_subscription enable row level security;
grant select, insert, update, delete on public.web_push_subscription to authenticated;

create policy "Users manage their own push subscriptions"
on public.web_push_subscription
for all
to authenticated
using (auth.uid() = "user")
with check (auth.uid() = "user");

-- 4. Eventos que disparan el push: una notificación nueva (la crea la app o la PWA) y un mensaje
--    nuevo en el chat. pg_net llama a la Edge Function «web-push» sin bloquear la transacción.
--    La URL y el secreto compartido viven en Vault (no en el repositorio):
--      select vault.create_secret('<url de la función>', 'echo_web_push_url');
--      select vault.create_secret('<secreto>', 'echo_web_push_secret');
create extension if not exists pg_net;

create or replace function private.notify_web_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'echo_web_push_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'echo_web_push_secret';
  if fn_url is null or fn_secret is null then
    return new; -- Sin configuración (por ejemplo, el stack local): no hay push.
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-echo-secret', fn_secret),
    body := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function private.notify_web_push() from public, anon, authenticated;

drop trigger if exists notification_web_push on public.notification;
create trigger notification_web_push
  after insert on public.notification
  for each row execute function private.notify_web_push();

drop trigger if exists message_web_push on public.message;
create trigger message_web_push
  after insert on public.message
  for each row execute function private.notify_web_push();
