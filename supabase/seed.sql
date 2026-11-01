-- Datos de ejemplo para desarrollo local (supabase db reset).
-- Crea el usuario demo@example.com: entra con magic link (el correo llega a
-- Mailpit, ver `supabase status`). Los datos se cargan con las RPC, como si
-- fuera ese usuario, para pasar por las mismas reglas que la app.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'demo@example.com', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'email',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"demo@example.com","email_verified":true}',
  now(), now(), now()
);

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
declare
  n26 uuid; cash uuid; tr uuid; savings uuid;
  t_super uuid; t_ocio uuid; t_casa uuid; t_transporte uuid; t_salud uuid;
  etf uuid; btc uuid;
  d1 uuid;
begin
  insert into accounts (name, type, balance) values ('N26', 'bank', 2350.40) returning id into n26;
  insert into accounts (name, type, balance) values ('Efectivo', 'cash', 120) returning id into cash;
  insert into accounts (name, type, balance) values ('Trade Republic', 'broker', 310.25) returning id into tr;
  insert into accounts (name, type, balance) values ('Cuenta ahorro', 'savings', 6000) returning id into savings;

  insert into tags (name, color) values ('Supermercado', '#16a34a') returning id into t_super;
  insert into tags (name, color) values ('Ocio', '#4f46e5') returning id into t_ocio;
  insert into tags (name, color) values ('Casa', '#d97706') returning id into t_casa;
  insert into tags (name, color) values ('Transporte', '#0891b2') returning id into t_transporte;
  insert into tags (name, color) values ('Salud', '#db2777') returning id into t_salud;

  perform create_expense('2026-10-02', 64.30, 'Mercadona', n26, array[t_super], true);
  perform create_expense('2026-10-04', 18.00, 'Cine', cash, array[t_ocio], true);
  perform create_expense('2026-10-09', 42.10, 'Gasolina', n26, array[t_transporte], false);
  perform create_expense('2026-10-12', 35.00, 'Cena con amigos', null, array[t_ocio, t_super], false);
  perform create_expense('2026-10-18', 22.50, 'Farmacia', n26, array[t_salud], true);
  perform create_expense('2026-10-21', 12.90, 'Bombillas', null, array[t_casa], false);
  perform create_expense('2026-10-25', 9.99, 'Varios', null, '{}', false);

  perform set_recurring_item(null, 'Sueldo', 'income', 2400, 'monthly', n26, true, null, null, '{}');
  perform set_recurring_item(null, 'Alquiler', 'expense', 850, 'monthly', n26, true, null, null, array[t_casa]);
  perform set_recurring_item(null, 'Seguro del coche', 'expense', 420, 'yearly', n26, true, null, null, array[t_transporte]);
  perform set_recurring_item(null, 'Gimnasio', 'expense', 90, 'quarterly', n26, true, null, null, array[t_salud]);

  etf := create_investment('ETF MSCI World', tr, 3000, '2025-03-01');
  insert into investment_valuations (investment_id, date, value) values (etf, '2025-12-31', 3350);
  perform add_contribution(etf, '2026-01-15', 500, 'Aporte mensual');
  insert into investment_valuations (investment_id, date, value) values (etf, '2026-10-28', 4120);

  btc := create_investment('Bitcoin', null, 800, '2025-11-10');
  insert into investment_valuations (investment_id, date, value) values (btc, '2026-10-28', 710);

  insert into debts (person, direction, amount, description, date)
  values ('Lucía', 'owed_to_me', 60, 'Entradas del concierto', '2026-09-20') returning id into d1;
  perform add_debt_payment(d1, '2026-10-01', 20, n26);
  insert into debts (person, direction, amount, description, date)
  values ('Marcos', 'i_owe', 25, 'Cena', '2026-10-15');
  insert into debts (person, direction, amount, description, date)
  values ('Lucía', 'i_owe', 15, 'Taxi', '2026-10-20');
end;
$$;

commit;
