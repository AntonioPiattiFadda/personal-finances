-- Resumen: patrimonio, dónde está la plata, uso de etiquetas y resumen del mes.
-- Además: no se borran cuentas con movimientos.

-- ---------------------------------------------------------------------------
-- accounts: no se borran si algo las referencia (se archivan)
-- ---------------------------------------------------------------------------

-- Las FK a accounts son "on delete set null" para que borrar un usuario en
-- cascada no falle; este trigger impide borrar a mano una cuenta con
-- movimientos. pg_trigger_depth() > 1 = borrado en cascada desde auth.users.
create function public.prevent_account_delete_with_movements()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (select 1 from expenses where account_id = old.id)
     or exists (select 1 from recurring_items where account_id = old.id)
     or exists (select 1 from investments where account_id = old.id)
     or exists (select 1 from debt_payments where account_id = old.id) then
    raise exception 'La cuenta tiene movimientos: archívala en lugar de borrarla';
  end if;

  return old;
end;
$$;

revoke execute on function public.prevent_account_delete_with_movements() from public, anon, authenticated;

create trigger accounts_prevent_delete_with_movements
  before delete on public.accounts
  for each row execute function public.prevent_account_delete_with_movements();

-- ---------------------------------------------------------------------------
-- Dónde está la plata: saldo + inversiones por cuenta. Las inversiones sin
-- cuenta (o cuya cuenta está archivada) van en la fila "Sin ubicación"
-- (account_id null), que solo aparece si hay alguna.
-- ---------------------------------------------------------------------------

drop view public.v_money_by_location;

create view public.v_money_by_location
with (security_invoker = true)
as
with inv as (
  select
    case when a.id is not null and not a.archived then s.account_id end as account_id,
    sum(s.current_value) as value
  from public.v_investment_stats s
  left join public.accounts a on a.id = s.account_id
  where not s.archived
  group by 1
)
select
  a.id                                      as account_id,
  a.name,
  a.type,
  a.balance                                 as cash,
  coalesce(inv.value, 0)::numeric(14,2)     as investments,
  (a.balance + coalesce(inv.value, 0))::numeric(14,2) as total
from public.accounts a
left join inv on inv.account_id = a.id
where not a.archived
union all
select
  null::uuid,
  'Sin ubicación',
  null::public.account_type,
  0::numeric(14,2),
  inv.value::numeric(14,2),
  inv.value::numeric(14,2)
from inv
where inv.account_id is null;

revoke all on public.v_money_by_location from anon;

-- ---------------------------------------------------------------------------
-- Patrimonio neto (siempre una fila)
-- ---------------------------------------------------------------------------

create view public.v_net_worth
with (security_invoker = true)
as
with t as (
  select
    (select coalesce(sum(balance), 0) from public.accounts where not archived)                         as accounts_total,
    (select coalesce(sum(current_value), 0) from public.v_investment_stats where not archived)         as investments_total,
    (select coalesce(sum(invested), 0) from public.v_investment_stats where not archived)              as investments_invested,
    (select coalesce(sum(remaining), 0) from public.v_debt_balances where direction = 'owed_to_me')    as owed_to_me,
    (select coalesce(sum(remaining), 0) from public.v_debt_balances where direction = 'i_owe')         as i_owe
)
select
  accounts_total::numeric(14,2),
  investments_total::numeric(14,2),
  investments_invested::numeric(14,2),
  (investments_total - investments_invested)::numeric(14,2)              as investments_gain,
  owed_to_me::numeric(14,2),
  i_owe::numeric(14,2),
  (accounts_total + investments_total + owed_to_me - i_owe)::numeric(14,2) as net_worth
from t;

revoke all on public.v_net_worth from anon;

-- ---------------------------------------------------------------------------
-- Uso de cada etiqueta (pantalla de etiquetas)
-- ---------------------------------------------------------------------------

create view public.v_tag_usage
with (security_invoker = true)
as
select
  t.id                                    as tag_id,
  t.name,
  t.color,
  coalesce(e.count, 0)::int               as expense_count,
  coalesce(r.count, 0)::int               as recurring_count,
  coalesce(e.total, 0)::numeric(14,2)     as expense_total
from public.tags t
left join (
  select et.tag_id, count(*) as count, sum(x.amount) as total
  from public.expense_tags et
  join public.expenses x on x.id = et.expense_id
  group by et.tag_id
) e on e.tag_id = t.id
left join (
  select tag_id, count(*) as count
  from public.recurring_item_tags
  group by tag_id
) r on r.tag_id = t.id;

revoke all on public.v_tag_usage from anon;

-- ---------------------------------------------------------------------------
-- RPC: resumen de un mes ("Este mes")
-- Fijos: solo activos y vigentes en el mes, en equivalente mensual.
-- ---------------------------------------------------------------------------

create function public.get_month_summary(p_month date)
returns table (
  month          date,
  fixed_income   numeric,
  fixed_expense  numeric,
  available      numeric,
  variable_total numeric,
  variable_count int,
  remaining      numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_income numeric;
  v_expense numeric;
  v_var numeric;
  v_count int;
begin
  if p_month is null then
    raise exception 'El mes es obligatorio';
  end if;

  v_start := date_trunc('month', p_month)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  select
    coalesce(sum(r.monthly_amount) filter (where r.kind = 'income'), 0),
    coalesce(sum(r.monthly_amount) filter (where r.kind = 'expense'), 0)
  into v_income, v_expense
  from recurring_items r
  where r.active
    and (r.start_date is null or r.start_date <= v_end)
    and (r.end_date is null or r.end_date >= v_start);

  select coalesce(sum(e.amount), 0), count(*)
  into v_var, v_count
  from expenses e
  where e.date between v_start and v_end;

  return query select
    v_start,
    v_income,
    v_expense,
    v_income - v_expense,
    v_var,
    v_count,
    v_income - v_expense - v_var;
end;
$$;

revoke execute on function public.get_month_summary(date) from public, anon;
grant execute on function public.get_month_summary(date) to authenticated;
