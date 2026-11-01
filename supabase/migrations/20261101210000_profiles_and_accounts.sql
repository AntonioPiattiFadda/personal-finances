-- Perfiles (uno por usuario) y cuentas: "dónde está la plata".

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  currency   text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Crea el perfil al registrarse. Tiene que ser security definer porque se
-- dispara desde auth.users, donde el usuario no tiene permisos.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuarios que ya existieran antes de esta migración.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

create type public.account_type as enum ('bank', 'cash', 'savings', 'broker', 'crypto', 'other');

create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  type               public.account_type not null,
  balance            numeric(14,2) not null default 0,
  balance_updated_at timestamptz not null default now(),
  archived           boolean not null default false,
  created_at         timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);

alter table public.accounts enable row level security;

create policy accounts_select on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy accounts_insert on public.accounts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy accounts_update on public.accounts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy accounts_delete on public.accounts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- RPC: actualizar el saldo a mano
-- ---------------------------------------------------------------------------

create function public.set_account_balance(p_account_id uuid, p_balance numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_balance is null then
    raise exception 'El saldo es obligatorio';
  end if;

  update accounts
     set balance = round(p_balance, 2),
         balance_updated_at = now()
   where id = p_account_id;

  if not found then
    raise exception 'La cuenta no existe';
  end if;
end;
$$;

revoke execute on function public.set_account_balance(uuid, numeric) from public, anon;
grant execute on function public.set_account_balance(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Vista: dónde está la plata
-- Por ahora solo saldos de cuentas. Cuando existan las inversiones se
-- redefine para sumar su valor y añadir la fila "Sin ubicación".
-- ---------------------------------------------------------------------------

create view public.v_money_by_location
with (security_invoker = true)
as
select
  a.id               as account_id,
  a.name,
  a.type,
  a.balance          as cash,
  0::numeric(14,2)   as investments,
  a.balance          as total
from public.accounts a
where not a.archived;

revoke all on public.v_money_by_location from anon;
