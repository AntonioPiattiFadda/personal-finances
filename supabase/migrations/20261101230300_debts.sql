-- Deudas: lo que me deben y lo que debo, con pagos parciales.

create type public.debt_direction as enum ('owed_to_me', 'i_owe');

-- ---------------------------------------------------------------------------
-- debts
-- ---------------------------------------------------------------------------

create table public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  person      text not null check (length(trim(person)) > 0),
  direction   public.debt_direction not null,
  amount      numeric(14,2) not null check (amount > 0),
  description text not null default '',
  date        date not null,
  created_at  timestamptz not null default now()
);

create index debts_user_id_idx on public.debts (user_id);

alter table public.debts enable row level security;

create policy debts_select on public.debts
  for select to authenticated using (user_id = (select auth.uid()));
create policy debts_insert on public.debts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy debts_update on public.debts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy debts_delete on public.debts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- debt_payments
-- ---------------------------------------------------------------------------

create table public.debt_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  debt_id    uuid not null references public.debts on delete cascade,
  date       date not null,
  amount     numeric(14,2) not null check (amount > 0),
  account_id uuid null references public.accounts on delete set null,
  created_at timestamptz not null default now()
);

create index debt_payments_user_id_idx on public.debt_payments (user_id);
create index debt_payments_debt_id_idx on public.debt_payments (debt_id);
create index debt_payments_account_id_idx on public.debt_payments (account_id);

alter table public.debt_payments enable row level security;

create policy debt_payments_select on public.debt_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy debt_payments_insert on public.debt_payments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.debts d where d.id = debt_id and d.user_id = (select auth.uid()))
    and (account_id is null or exists (
      select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  );
create policy debt_payments_delete on public.debt_payments
  for delete to authenticated using (user_id = (select auth.uid()));
-- Sin política de update: un pago se borra y se vuelve a crear (vía RPC).

-- Editar una deuda no puede dejarla por debajo de lo pagado ni cambiar el
-- sentido si ya tiene pagos (los saldos ajustados quedarían al revés).
create function public.debts_check_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid from debt_payments where debt_id = new.id;

  if new.amount < v_paid then
    raise exception 'El importe no puede ser menor que lo ya pagado';
  end if;
  if new.direction <> old.direction and v_paid > 0 then
    raise exception 'No se puede cambiar el sentido de una deuda que ya tiene pagos';
  end if;

  return new;
end;
$$;

revoke execute on function public.debts_check_update() from public, anon, authenticated;

create trigger debts_check_update
  before update of amount, direction on public.debts
  for each row execute function public.debts_check_update();

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Signo del ajuste de saldo de un pago: me pagan → suma, pago yo → resta.
create function public.debt_payment_sign(p_direction public.debt_direction)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_direction when 'owed_to_me' then 1 else -1 end;
$$;

create function public.add_debt_payment(
  p_debt_id uuid,
  p_date date,
  p_amount numeric,
  p_account_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debt debts%rowtype;
  v_remaining numeric;
  v_id uuid;
begin
  if p_date is null then
    raise exception 'La fecha es obligatoria';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'El importe debe ser mayor que cero';
  end if;

  select * into v_debt from debts where id = p_debt_id for update;
  if not found then
    raise exception 'La deuda no existe';
  end if;

  select v_debt.amount - coalesce(sum(amount), 0) into v_remaining
    from debt_payments where debt_id = p_debt_id;

  if v_remaining <= 0 then
    raise exception 'La deuda ya está saldada';
  end if;
  if round(p_amount, 2) > v_remaining then
    raise exception 'El pago supera lo pendiente';
  end if;

  perform assert_usable_account(p_account_id);

  insert into debt_payments (debt_id, date, amount, account_id)
  values (p_debt_id, p_date, round(p_amount, 2), p_account_id)
  returning id into v_id;

  perform adjust_account_balance(p_account_id, debt_payment_sign(v_debt.direction) * round(p_amount, 2));

  return v_id;
end;
$$;

create function public.delete_debt_payment(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payment debt_payments%rowtype;
  v_direction debt_direction;
begin
  select * into v_payment from debt_payments where id = p_id;
  if not found then
    raise exception 'El pago no existe';
  end if;

  -- Bloquea la deuda (los pagos no tienen privilegio de update).
  select direction into v_direction from debts where id = v_payment.debt_id for update;

  perform adjust_account_balance(v_payment.account_id, -debt_payment_sign(v_direction) * v_payment.amount);

  delete from debt_payments where id = p_id;
end;
$$;

-- Borra la deuda revirtiendo en las cuentas lo que movieron sus pagos.
create function public.delete_debt(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_debt debts%rowtype;
  v_payment record;
begin
  select * into v_debt from debts where id = p_id for update;
  if not found then
    raise exception 'La deuda no existe';
  end if;

  for v_payment in
    select account_id, sum(amount) as total
      from debt_payments
     where debt_id = p_id and account_id is not null
     group by account_id
  loop
    perform adjust_account_balance(v_payment.account_id, -debt_payment_sign(v_debt.direction) * v_payment.total);
  end loop;

  delete from debts where id = p_id;
end;
$$;

revoke execute on function public.debt_payment_sign(public.debt_direction) from public, anon;
revoke execute on function public.add_debt_payment(uuid, date, numeric, uuid) from public, anon;
revoke execute on function public.delete_debt_payment(uuid) from public, anon;
revoke execute on function public.delete_debt(uuid) from public, anon;
grant execute on function public.debt_payment_sign(public.debt_direction) to authenticated;
grant execute on function public.add_debt_payment(uuid, date, numeric, uuid) to authenticated;
grant execute on function public.delete_debt_payment(uuid) to authenticated;
grant execute on function public.delete_debt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------

create view public.v_debt_balances
with (security_invoker = true)
as
select
  d.id                                        as debt_id,
  d.person,
  d.direction,
  d.amount,
  coalesce(p.paid, 0)::numeric(14,2)          as paid,
  (d.amount - coalesce(p.paid, 0))::numeric(14,2) as remaining,
  d.amount - coalesce(p.paid, 0) <= 0         as settled,
  d.date,
  d.description,
  d.created_at
from public.debts d
left join (
  select debt_id, sum(amount) as paid from public.debt_payments group by debt_id
) p on p.debt_id = d.id;

-- Neto por persona (lo que me debe − lo que le debo). Agrupa sin distinguir
-- mayúsculas ni espacios sobrantes.
create view public.v_debt_people
with (security_invoker = true)
as
select
  min(trim(person))                                                                   as person,
  coalesce(sum(remaining) filter (where direction = 'owed_to_me'), 0)::numeric(14,2)  as owed_to_me,
  coalesce(sum(remaining) filter (where direction = 'i_owe'), 0)::numeric(14,2)       as i_owe,
  (coalesce(sum(remaining) filter (where direction = 'owed_to_me'), 0)
   - coalesce(sum(remaining) filter (where direction = 'i_owe'), 0))::numeric(14,2)   as net
from public.v_debt_balances
group by lower(trim(person));

revoke all on public.v_debt_balances from anon;
revoke all on public.v_debt_people from anon;
