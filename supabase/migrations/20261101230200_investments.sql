-- Inversiones: aportes + valoraciones manuales. De ahí sale la rentabilidad.

-- ---------------------------------------------------------------------------
-- investments
-- ---------------------------------------------------------------------------

create table public.investments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  account_id uuid null references public.accounts on delete set null,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create index investments_user_id_idx on public.investments (user_id);
create index investments_account_id_idx on public.investments (account_id);

alter table public.investments enable row level security;

create policy investments_select on public.investments
  for select to authenticated using (user_id = (select auth.uid()));
create policy investments_insert on public.investments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy investments_update on public.investments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy investments_delete on public.investments
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- investment_contributions (positivo = meto dinero, negativo = retiro)
-- ---------------------------------------------------------------------------

create table public.investment_contributions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  investment_id uuid not null references public.investments on delete cascade,
  date          date not null,
  amount        numeric(14,2) not null check (amount <> 0),
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create index investment_contributions_user_id_idx on public.investment_contributions (user_id);
create index investment_contributions_investment_id_idx on public.investment_contributions (investment_id, date);

alter table public.investment_contributions enable row level security;

create policy investment_contributions_select on public.investment_contributions
  for select to authenticated using (user_id = (select auth.uid()));
create policy investment_contributions_insert on public.investment_contributions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.investments i where i.id = investment_id and i.user_id = (select auth.uid()))
  );
create policy investment_contributions_update on public.investment_contributions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.investments i where i.id = investment_id and i.user_id = (select auth.uid()))
  );
create policy investment_contributions_delete on public.investment_contributions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- investment_valuations
-- contribution_id: valoración automática creada por un aporte. Al borrar el
-- aporte se borra con él, para que el dinero retirado no cuente como ganancia.
-- ---------------------------------------------------------------------------

create table public.investment_valuations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  investment_id   uuid not null references public.investments on delete cascade,
  date            date not null,
  value           numeric(14,2) not null check (value >= 0),
  contribution_id uuid null references public.investment_contributions on delete cascade,
  created_at      timestamptz not null default now()
);

create index investment_valuations_user_id_idx on public.investment_valuations (user_id);
create index investment_valuations_investment_id_idx on public.investment_valuations (investment_id, date desc, created_at desc);
create index investment_valuations_contribution_id_idx on public.investment_valuations (contribution_id);

alter table public.investment_valuations enable row level security;

create policy investment_valuations_select on public.investment_valuations
  for select to authenticated using (user_id = (select auth.uid()));
create policy investment_valuations_insert on public.investment_valuations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.investments i where i.id = investment_id and i.user_id = (select auth.uid()))
  );
create policy investment_valuations_update on public.investment_valuations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.investments i where i.id = investment_id and i.user_id = (select auth.uid()))
  );
create policy investment_valuations_delete on public.investment_valuations
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Crea la inversión con un aporte inicial y una valoración inicial iguales.
create function public.create_investment(
  p_name text,
  p_account_id uuid,
  p_amount numeric,
  p_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_contribution_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El aporte inicial debe ser mayor que cero';
  end if;
  if p_date is null then
    raise exception 'La fecha es obligatoria';
  end if;
  perform assert_usable_account(p_account_id);

  insert into investments (name, account_id)
  values (trim(p_name), p_account_id)
  returning id into v_id;

  insert into investment_contributions (investment_id, date, amount, note)
  values (v_id, p_date, round(p_amount, 2), 'Aporte inicial')
  returning id into v_contribution_id;

  insert into investment_valuations (investment_id, date, value, contribution_id)
  values (v_id, p_date, round(p_amount, 2), v_contribution_id);

  return v_id;
end;
$$;

-- Registra un aporte (o retirada) y una valoración automática con
-- valor = última valoración + aporte, para que meter dinero no sea ganancia.
create function public.add_contribution(
  p_investment_id uuid,
  p_date date,
  p_amount numeric,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_last numeric;
begin
  if p_date is null then
    raise exception 'La fecha es obligatoria';
  end if;
  if p_amount is null or round(p_amount, 2) = 0 then
    raise exception 'El importe no puede ser cero';
  end if;

  perform 1 from investments where id = p_investment_id for update;
  if not found then
    raise exception 'La inversión no existe';
  end if;

  select value into v_last
    from investment_valuations
   where investment_id = p_investment_id
   order by date desc, created_at desc
   limit 1;

  if coalesce(v_last, 0) + round(p_amount, 2) < 0 then
    raise exception 'La retirada supera el valor actual de la inversión';
  end if;

  insert into investment_contributions (investment_id, date, amount, note)
  values (p_investment_id, p_date, round(p_amount, 2), coalesce(trim(p_note), ''))
  returning id into v_id;

  insert into investment_valuations (investment_id, date, value, contribution_id)
  values (p_investment_id, p_date, coalesce(v_last, 0) + round(p_amount, 2), v_id);

  return v_id;
end;
$$;

revoke execute on function public.create_investment(text, uuid, numeric, date) from public, anon;
revoke execute on function public.add_contribution(uuid, date, numeric, text) from public, anon;
grant execute on function public.create_investment(text, uuid, numeric, date) to authenticated;
grant execute on function public.add_contribution(uuid, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Vista: rentabilidad por inversión
-- ---------------------------------------------------------------------------

create view public.v_investment_stats
with (security_invoker = true)
as
with contrib as (
  select investment_id, sum(amount) as invested, min(date) as first_date
  from public.investment_contributions
  group by investment_id
),
last_val as (
  select distinct on (investment_id) investment_id, value, date
  from public.investment_valuations
  order by investment_id, date desc, created_at desc
),
base as (
  select
    i.id,
    i.name,
    i.account_id,
    i.archived,
    i.created_at,
    coalesce(c.invested, 0)::numeric(14,2) as invested,
    coalesce(v.value, 0)::numeric(14,2)    as current_value,
    c.first_date,
    v.date as last_date
  from public.investments i
  left join contrib c on c.investment_id = i.id
  left join last_val v on v.investment_id = i.id
)
select
  id                                   as investment_id,
  name,
  account_id,
  archived,
  invested,
  current_value,
  (current_value - invested)::numeric(14,2) as gain,
  case when invested > 0
       then ((current_value - invested) / invested)::double precision
  end                                  as return_pct,
  case when invested > 0 and last_date - first_date >= 30
       then power((current_value / invested)::double precision, 365.0 / (last_date - first_date)) - 1
  end                                  as annualized_pct,
  first_date                           as first_contribution_date,
  last_date                            as last_valuation_date,
  created_at
from base;

revoke all on public.v_investment_stats from anon;
