-- Etiquetas y gastos variables.

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  created_at timestamptz not null default now()
);

create unique index tags_user_name_key on public.tags (user_id, lower(name));

alter table public.tags enable row level security;

create policy tags_select on public.tags
  for select to authenticated using (user_id = (select auth.uid()));
create policy tags_insert on public.tags
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tags_update on public.tags
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tags_delete on public.tags
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  date        date not null,
  amount      numeric(14,2) not null check (amount > 0),
  description text not null default '',
  account_id  uuid null references public.accounts on delete set null,
  deducted    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint expenses_deducted_needs_account check (not deducted or account_id is not null)
);

create index expenses_user_date_idx on public.expenses (user_id, date);
create index expenses_account_id_idx on public.expenses (account_id);

alter table public.expenses enable row level security;

create policy expenses_select on public.expenses
  for select to authenticated using (user_id = (select auth.uid()));
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy expenses_update on public.expenses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy expenses_delete on public.expenses
  for delete to authenticated using (user_id = (select auth.uid()));

-- Si la cuenta desaparece (set null), el gasto deja de estar descontado.
create function public.expenses_clear_deducted()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.account_id is null then
    new.deducted := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.expenses_clear_deducted() from public, anon, authenticated;

create trigger expenses_clear_deducted
  before insert or update on public.expenses
  for each row execute function public.expenses_clear_deducted();

-- ---------------------------------------------------------------------------
-- expense_tags
-- ---------------------------------------------------------------------------

create table public.expense_tags (
  expense_id uuid not null references public.expenses on delete cascade,
  tag_id     uuid not null references public.tags on delete cascade,
  primary key (expense_id, tag_id)
);

create index expense_tags_tag_id_idx on public.expense_tags (tag_id);

alter table public.expense_tags enable row level security;

create policy expense_tags_select on public.expense_tags
  for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid())));
create policy expense_tags_insert on public.expense_tags
  for insert to authenticated
  with check (
    exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );
create policy expense_tags_delete on public.expense_tags
  for delete to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Helpers internos de las RPC
-- ---------------------------------------------------------------------------

-- Comprueba que la cuenta existe (para este usuario, vía RLS) y que se puede
-- usar para mover saldo.
create function public.assert_usable_account(p_account_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_archived boolean;
begin
  if p_account_id is null then
    return;
  end if;

  select archived into v_archived from accounts where id = p_account_id;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if v_archived then
    raise exception 'La cuenta está archivada';
  end if;
end;
$$;

create function public.assert_tags_exist(p_tag_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(coalesce(p_tag_ids, '{}')) as t(id)
    where t.id is null or not exists (select 1 from tags where tags.id = t.id)
  ) then
    raise exception 'Alguna etiqueta no existe';
  end if;
end;
$$;

-- Suma (o resta, con importe negativo) al saldo de una cuenta. No toca
-- balance_updated_at: eso solo cambia con la actualización manual.
create function public.adjust_account_balance(p_account_id uuid, p_delta numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_account_id is null or p_delta = 0 then
    return;
  end if;
  update accounts set balance = balance + p_delta where id = p_account_id;
end;
$$;

revoke execute on function public.assert_usable_account(uuid) from public, anon;
revoke execute on function public.assert_tags_exist(uuid[]) from public, anon;
revoke execute on function public.adjust_account_balance(uuid, numeric) from public, anon;
grant execute on function public.assert_usable_account(uuid) to authenticated;
grant execute on function public.assert_tags_exist(uuid[]) to authenticated;
-- adjust_account_balance solo se llama desde otras RPC, pero al ser security
-- invoker el usuario necesita poder ejecutarla. RLS limita a sus cuentas.
grant execute on function public.adjust_account_balance(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: gastos
-- ---------------------------------------------------------------------------

create function public.create_expense(
  p_date date,
  p_amount numeric,
  p_description text,
  p_account_id uuid,
  p_tag_ids uuid[],
  p_deduct boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_date is null then
    raise exception 'La fecha es obligatoria';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor que cero';
  end if;
  if coalesce(p_deduct, false) and p_account_id is null then
    raise exception 'Para descontar el gasto hay que elegir una cuenta';
  end if;

  perform assert_usable_account(p_account_id);
  perform assert_tags_exist(p_tag_ids);

  insert into expenses (date, amount, description, account_id, deducted)
  values (p_date, round(p_amount, 2), coalesce(trim(p_description), ''), p_account_id, coalesce(p_deduct, false))
  returning id into v_id;

  insert into expense_tags (expense_id, tag_id)
  select distinct v_id, t from unnest(coalesce(p_tag_ids, '{}')) as t;

  if coalesce(p_deduct, false) then
    perform adjust_account_balance(p_account_id, -round(p_amount, 2));
  end if;

  return v_id;
end;
$$;

create function public.update_expense(
  p_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_account_id uuid,
  p_tag_ids uuid[],
  p_deduct boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old expenses%rowtype;
begin
  if p_date is null then
    raise exception 'La fecha es obligatoria';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor que cero';
  end if;
  if coalesce(p_deduct, false) and p_account_id is null then
    raise exception 'Para descontar el gasto hay que elegir una cuenta';
  end if;

  select * into v_old from expenses where id = p_id for update;
  if not found then
    raise exception 'El gasto no existe';
  end if;

  -- Una cuenta archivada solo se acepta si ya era la del descuento anterior.
  if p_account_id is not null
     and not (v_old.deducted and v_old.account_id = p_account_id) then
    perform assert_usable_account(p_account_id);
  elsif p_account_id is not null and not exists (select 1 from accounts where id = p_account_id) then
    raise exception 'La cuenta no existe';
  end if;
  perform assert_tags_exist(p_tag_ids);

  if v_old.deducted then
    perform adjust_account_balance(v_old.account_id, v_old.amount);
  end if;

  update expenses
     set date = p_date,
         amount = round(p_amount, 2),
         description = coalesce(trim(p_description), ''),
         account_id = p_account_id,
         deducted = coalesce(p_deduct, false)
   where id = p_id;

  if coalesce(p_deduct, false) then
    perform adjust_account_balance(p_account_id, -round(p_amount, 2));
  end if;

  delete from expense_tags where expense_id = p_id;
  insert into expense_tags (expense_id, tag_id)
  select distinct p_id, t from unnest(coalesce(p_tag_ids, '{}')) as t;
end;
$$;

create function public.delete_expense(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old expenses%rowtype;
begin
  select * into v_old from expenses where id = p_id for update;
  if not found then
    raise exception 'El gasto no existe';
  end if;

  if v_old.deducted then
    perform adjust_account_balance(v_old.account_id, v_old.amount);
  end if;

  delete from expenses where id = p_id;
end;
$$;

revoke execute on function public.create_expense(date, numeric, text, uuid, uuid[], boolean) from public, anon;
revoke execute on function public.update_expense(uuid, date, numeric, text, uuid, uuid[], boolean) from public, anon;
revoke execute on function public.delete_expense(uuid) from public, anon;
grant execute on function public.create_expense(date, numeric, text, uuid, uuid[], boolean) to authenticated;
grant execute on function public.update_expense(uuid, date, numeric, text, uuid, uuid[], boolean) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vistas de gastos
-- ---------------------------------------------------------------------------

-- Gastos con sus etiquetas en un array (para filtrar por etiqueta sin perder
-- las demás etiquetas del gasto).
create view public.v_expenses
with (security_invoker = true)
as
select
  e.id,
  e.date,
  e.amount,
  e.description,
  e.account_id,
  e.deducted,
  e.created_at,
  coalesce(array_agg(et.tag_id order by et.tag_id) filter (where et.tag_id is not null), '{}')::uuid[] as tag_ids
from public.expenses e
left join public.expense_tags et on et.expense_id = e.id
group by e.id;

-- Un gasto con varias etiquetas suma su importe completo en cada una.
create view public.v_expenses_by_tag_month
with (security_invoker = true)
as
select
  date_trunc('month', e.date)::date as month,
  t.id                              as tag_id,
  coalesce(t.name, 'Sin etiqueta')  as tag_name,
  t.color                           as tag_color,
  sum(e.amount)::numeric(14,2)      as total,
  count(*)::int                     as count
from public.expenses e
left join public.expense_tags et on et.expense_id = e.id
left join public.tags t on t.id = et.tag_id
group by 1, t.id, t.name, t.color;

revoke all on public.v_expenses from anon;
revoke all on public.v_expenses_by_tag_month from anon;
