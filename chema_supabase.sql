/* ============================================================
   SCHEMA SUPABASE CHO APP "SỔ THU CHI ĐA VÍ"
   Dùng CHUNG 1 project Supabase với app Quán Ăn (cwjuvxktediyfjyazakm) -
   chỉ thêm 3 bảng mới, không đụng gì tới các bảng của app Quán Ăn.

   Cách dùng:
   1. Vào project Supabase (cwjuvxktediyfjyazakm) > SQL Editor > New query.
   2. Dán TOÀN BỘ file này > Run.
   ============================================================ */

/* ---------- FIN_WALLETS (danh sách ví) ---------- */
create table if not exists fin_wallets (
  id text primary key,
  name text default '',
  icon text default '💰',
  "colorBg" text default '#e2e8f0',
  "colorFg" text default '#334155',
  "createdAt" bigint
);

/* ---------- FIN_TRANSACTIONS (giao dịch thu/chi) ---------- */
create table if not exists fin_transactions (
  id bigint primary key,
  wallet text references fin_wallets(id) on delete cascade,
  type text,
  amount numeric default 0,
  cat text default '',
  date text,
  note text default '',
  "updatedAt" bigint
);

/* ---------- FIN_DEBTS (công nợ / cho vay) ---------- */
create table if not exists fin_debts (
  id bigint primary key,
  type text,
  name text,
  principal numeric default 0,
  rate numeric default 0,
  date text,
  note text default '',
  paid boolean default false,
  "paidDate" text
);

/* ============================================================
   BẢO MẬT (RLS) - mở đọc/ghi công khai (anon), giống cách app Quán Ăn
   đang làm với các bảng menu/orders/... App này không có tài khoản
   đăng nhập thật, chỉ bảo vệ bằng mã "cổng ngầm" ở giao diện.
   ============================================================ */
alter table fin_wallets enable row level security;
alter table fin_transactions enable row level security;
alter table fin_debts enable row level security;

create policy "public all fin_wallets" on fin_wallets for all to anon using (true) with check (true);
create policy "public all fin_transactions" on fin_transactions for all to anon using (true) with check (true);
create policy "public all fin_debts" on fin_debts for all to anon using (true) with check (true);