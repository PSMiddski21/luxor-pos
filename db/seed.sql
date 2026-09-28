-- Sample data matching src/lib/seed.ts, for bootstrapping a real environment.
-- Safe to re-run: clears the tables it touches first.

truncate table transaction_lines, transactions, timesheets, shifts, stock_items, products, customers, staff, beds cascade;

insert into beds (id, label, status) values
  ('11111111-0000-0000-0000-000000000001', 'Bed 1', 'available'),
  ('11111111-0000-0000-0000-000000000002', 'Bed 2', 'available'),
  ('11111111-0000-0000-0000-000000000003', 'Bed 3', 'maintenance'),
  ('11111111-0000-0000-0000-000000000004', 'Bed 4', 'available');

insert into customers (id, name, phone, minutes_balance) values
  ('22222222-0000-0000-0000-000000000001', 'Chloe Bennett', '07700 900001', 80),
  ('22222222-0000-0000-0000-000000000002', 'Megan Walsh', '07700 900002', 15),
  ('22222222-0000-0000-0000-000000000003', 'Jade Ferris', '07700 900003', 0);

insert into products (id, name, category, price_pence, minutes, track_stock) values
  ('33333333-0000-0000-0000-000000000001', '10 min session', 'tanning_minutes', 500, 10, false),
  ('33333333-0000-0000-0000-000000000002', '15 min session', 'tanning_minutes', 700, 15, false),
  ('33333333-0000-0000-0000-000000000003', '100 min pack', 'tanning_minutes', 4000, 100, false),
  ('33333333-0000-0000-0000-000000000004', '200 min pack (offer)', 'tanning_minutes', 7000, 200, false),
  ('33333333-0000-0000-0000-000000000005', 'Vape', 'retail', 1300, null, true),
  ('33333333-0000-0000-0000-000000000006', 'Tanning cream', 'retail', 1800, null, true),
  ('33333333-0000-0000-0000-000000000007', 'Pepsi', 'retail', 150, null, true),
  ('33333333-0000-0000-0000-000000000008', 'Diet Coke', 'retail', 150, null, true),
  ('33333333-0000-0000-0000-000000000009', 'Fanta', 'retail', 150, null, true),
  ('33333333-0000-0000-0000-00000000000a', 'Water', 'retail', 100, null, true),
  ('33333333-0000-0000-0000-00000000000b', 'Candy', 'retail', 90, null, true);

insert into stock_items (product_id, quantity_on_hand, reorder_level, supplier) values
  ('33333333-0000-0000-0000-000000000005', 12, 5, 'VapeWorld Wholesale'),
  ('33333333-0000-0000-0000-000000000006', 8, 3, 'SunGlow Supplies'),
  ('33333333-0000-0000-0000-000000000007', 24, 12, 'Local Cash & Carry'),
  ('33333333-0000-0000-0000-000000000008', 3, 12, 'Local Cash & Carry'),
  ('33333333-0000-0000-0000-000000000009', 18, 12, 'Local Cash & Carry'),
  ('33333333-0000-0000-0000-00000000000a', 30, 12, 'Local Cash & Carry'),
  ('33333333-0000-0000-0000-00000000000b', 20, 10, 'Local Cash & Carry');

insert into staff (id, name, role, pay_rate_pence, active) values
  ('44444444-0000-0000-0000-000000000001', 'Ellie Marsh', 'owner', 0, true),
  ('44444444-0000-0000-0000-000000000002', 'Sophie Turner', 'manager', 1250, true),
  ('44444444-0000-0000-0000-000000000003', 'Amy Coates', 'staff', 1100, true),
  ('44444444-0000-0000-0000-000000000004', 'Ryan Doyle', 'staff', 1100, true);

-- A representative week of shifts, anchored to the upcoming Monday so the
-- Rota page always shows something relevant regardless of when this runs.
with monday as (
  select date_trunc('week', current_date)::date as d
)
insert into shifts (staff_id, shift_date, planned_start, planned_end)
select * from (
  values
    ('44444444-0000-0000-0000-000000000002'::uuid, (select d from monday) + 0, '09:00'::time, '17:00'::time),
    ('44444444-0000-0000-0000-000000000003'::uuid, (select d from monday) + 0, '12:00'::time, '20:00'::time),
    ('44444444-0000-0000-0000-000000000002'::uuid, (select d from monday) + 1, '09:00'::time, '17:00'::time),
    ('44444444-0000-0000-0000-000000000004'::uuid, (select d from monday) + 1, '12:00'::time, '20:00'::time),
    ('44444444-0000-0000-0000-000000000003'::uuid, (select d from monday) + 2, '09:00'::time, '17:00'::time),
    ('44444444-0000-0000-0000-000000000002'::uuid, (select d from monday) + 2, '12:00'::time, '20:00'::time),
    ('44444444-0000-0000-0000-000000000004'::uuid, (select d from monday) + 3, '09:00'::time, '17:00'::time),
    ('44444444-0000-0000-0000-000000000003'::uuid, (select d from monday) + 4, '09:00'::time, '17:00'::time),
    ('44444444-0000-0000-0000-000000000002'::uuid, (select d from monday) + 5, '10:00'::time, '18:00'::time),
    ('44444444-0000-0000-0000-000000000004'::uuid, (select d from monday) + 6, '10:00'::time, '16:00'::time)
) as s(staff_id, shift_date, planned_start, planned_end);
