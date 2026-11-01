-- Ingresos y gastos fijos (recurrentes). Son una previsión: no mueven saldos.

create type public.recurring_kind as enum ('income', 'expense');
create type public.recurring_frequency as enum ('monthly', 'quarterly', 'semiannual', 'yearly');

-- ---------------------------------------------------------------------------
-- recurring_items
-- ---------------------------------------------------------------------------

create table public.recurring_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  kind           public.recurring_kind not null,
  amount         numeric(14,2) not null check (amount > 0),
  frequency      public.recurring_frequency not null,
  -- Equivalente mensual: mensual 1, trimestral 1/3, semestral 1/6, anual 1/12.
  monthly_amount numeric generated always as (
    case frequency
      when 'monthly'    then amount
      when 'quarterly'  then amount / 3
      when 'semiannual' then amount / 6
      when 'yearly'     then amount / 12
    end
  ) stored,
  account_id     uuid null references public.accounts on delete set null,
  active         boolean not null default true,
  start_date     date null,
  end_date       date null,
  created_at     timestamptz not null default now(),
  constraint recurring_items_dates check (start_date is null or end_date is null or end_date >= start_date)
);

create index recurring_items_user_id_idx on public.recurring_items (user_id);
create index recurring_items_account_id_idx on public.recurring_items (account_id);

alter table public.recurring_items enable row level security;

create policy recurring_items_select on public.recurring_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy recurring_items_insert on public.recurring_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy recurring_items_update on public.recurring_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy recurring_items_delete on public.recurring_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- recurring_item_tags
-- ---------------------------------------------------------------------------

create table public.recurring_item_tags (
  recurring_item_id uuid not null references public.recurring_items on delete cascade,
  tag_id            uuid not null references public.tags on delete cascade,
  primary key (recurring_item_id, tag_id)
);

create index recurring_item_tags_tag_id_idx on public.recurring_item_tags (tag_id);

alter table public.recurring_item_tags enable row level security;

create policy recurring_item_tags_select on public.recurring_item_tags
  for select to authenticated
  using (exists (select 1 from public.recurring_items r where r.id = recurring_item_id and r.user_id = (select auth.uid())));
create policy recurring_item_tags_insert on public.recurring_item_tags
  for insert to authenticated
  with check (
    exists (select 1 from public.recurring_items r where r.id = recurring_item_id and r.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );
create policy recurring_item_tags_delete on public.recurring_item_tags
  for delete to authenticated
  using (exists (select 1 from public.recurring_items r where r.id = recurring_item_id and r.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- RPC: crear o actualizar un fijo con sus etiquetas
-- ---------------------------------------------------------------------------

create function public.set_recurring_item(
  p_id uuid,
  p_name text,
  p_kind public.recurring_kind,
  p_amount numeric,
  p_frequency public.recurring_frequency,
  p_account_id uuid,
  p_active boolean,
  p_start_date date,
  p_end_date date,
  p_tag_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_kind is null then
    raise exception 'Indica si es un ingreso o un gasto';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor que cero';
  end if;
  if p_frequency is null then
    raise exception 'La frecuencia es obligatoria';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio';
  end if;
  if p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then
    raise exception 'La cuenta no existe';
  end if;
  perform assert_tags_exist(p_tag_ids);

  if p_id is null then
    insert into recurring_items (name, kind, amount, frequency, account_id, active, start_date, end_date)
    values (trim(p_name), p_kind, round(p_amount, 2), p_frequency, p_account_id, coalesce(p_active, true), p_start_date, p_end_date)
    returning id into v_id;
  else
    update recurring_items
       set name = trim(p_name),
           kind = p_kind,
           amount = round(p_amount, 2),
           frequency = p_frequency,
           account_id = p_account_id,
           active = coalesce(p_active, true),
           start_date = p_start_date,
           end_date = p_end_date
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'El elemento fijo no existe';
    end if;

    delete from recurring_item_tags where recurring_item_id = v_id;
  end if;

  insert into recurring_item_tags (recurring_item_id, tag_id)
  select distinct v_id, t from unnest(coalesce(p_tag_ids, '{}')) as t;

  return v_id;
end;
$$;

revoke execute on function public.set_recurring_item(uuid, text, public.recurring_kind, numeric, public.recurring_frequency, uuid, boolean, date, date, uuid[]) from public, anon;
grant execute on function public.set_recurring_item(uuid, text, public.recurring_kind, numeric, public.recurring_frequency, uuid, boolean, date, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Vista: fijos con su equivalente mensual y etiquetas
-- ---------------------------------------------------------------------------

create view public.v_recurring_monthly
with (security_invoker = true)
as
select
  r.id             as recurring_item_id,
  r.name,
  r.kind,
  r.frequency,
  r.amount,
  r.monthly_amount,
  r.active,
  r.account_id,
  r.start_date,
  r.end_date,
  coalesce(array_agg(rt.tag_id order by rt.tag_id) filter (where rt.tag_id is not null), '{}')::uuid[] as tag_ids
from public.recurring_items r
left join public.recurring_item_tags rt on rt.recurring_item_id = r.id
group by r.id;

revoke all on public.v_recurring_monthly from anon;
