-- Privilegios explícitos. No dependemos de los "default privileges" del
-- proyecto (cambian entre versiones de Supabase): anon no toca nada y
-- authenticated solo lo que necesita. RLS sigue filtrando por usuario.

revoke all on all tables in schema public from anon, authenticated;

grant select, update                 on public.profiles                 to authenticated;
grant select, insert, update, delete on public.accounts                 to authenticated;
grant select, insert, update, delete on public.tags                     to authenticated;
grant select, insert, update, delete on public.expenses                 to authenticated;
grant select, insert, delete         on public.expense_tags             to authenticated;
grant select, insert, update, delete on public.recurring_items          to authenticated;
grant select, insert, delete         on public.recurring_item_tags      to authenticated;
grant select, insert, update, delete on public.investments              to authenticated;
grant select, insert, update, delete on public.investment_contributions to authenticated;
grant select, insert, update, delete on public.investment_valuations    to authenticated;
grant select, insert, update, delete on public.debts                    to authenticated;
grant select, insert, delete         on public.debt_payments            to authenticated;

grant select on
  public.v_expenses,
  public.v_expenses_by_tag_month,
  public.v_recurring_monthly,
  public.v_investment_stats,
  public.v_debt_balances,
  public.v_debt_people,
  public.v_money_by_location,
  public.v_net_worth,
  public.v_tag_usage
to authenticated;
