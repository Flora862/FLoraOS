-- FloraOS 云端结构 v1
-- 用法：Supabase 控制台 → SQL Editor → 新建查询 → 粘贴全部 → Run。只需跑一次。
-- 设计：一张通用 documents 表存所有模块的数据（JSON），每行带 user_id。
--       行级权限：只有本人能读写自己的行。以后加模块不用改表。

create extension if not exists pgcrypto;

-- 1. 数据表
create table if not exists public.documents (
  id          uuid primary key,                       -- 客户端生成的 uid
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  table_name  text not null,                          -- entries / todos / issues / ...
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);
create index if not exists documents_user_table_idx on public.documents (user_id, table_name);
create index if not exists documents_user_updated_idx on public.documents (user_id, updated_at);

alter table public.documents enable row level security;

drop policy if exists "own rows select" on public.documents;
drop policy if exists "own rows insert" on public.documents;
drop policy if exists "own rows update" on public.documents;
drop policy if exists "own rows delete" on public.documents;
create policy "own rows select" on public.documents for select using (auth.uid() = user_id);
create policy "own rows insert" on public.documents for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.documents for delete using (auth.uid() = user_id);

-- 2. 邀请码：没有有效邀请码不能注册
create table if not exists public.invites (
  code        text primary key,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  used_by     uuid references auth.users(id) on delete set null,
  used_at     timestamptz
);
alter table public.invites enable row level security;
drop policy if exists "invites read own" on public.invites;
drop policy if exists "invites create" on public.invites;
create policy "invites read own" on public.invites for select using (auth.uid() = created_by);
create policy "invites create" on public.invites for insert with check (auth.uid() = created_by);

-- 注册时校验：raw_user_meta_data.invite_code 必须存在且未用；第一个用户免邀请（就是 Flora 自己）
create or replace function public.check_invite_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text := new.raw_user_meta_data ->> 'invite_code';
  v_users int;
begin
  select count(*) into v_users from auth.users;
  if v_users = 0 then return new; end if;          -- 第一个账号不需要邀请码
  if v_code is null or not exists (select 1 from public.invites where code = v_code and used_by is null) then
    raise exception 'INVITE_REQUIRED';
  end if;
  update public.invites set used_by = new.id, used_at = now() where code = v_code;
  return new;
end $$;

drop trigger if exists check_invite_on_signup on auth.users;
create trigger check_invite_on_signup before insert on auth.users
  for each row execute function public.check_invite_on_signup();

-- 3. 生成邀请码的函数（登录后在设置页点一下）
create or replace function public.make_invite()
returns text language plpgsql security definer set search_path = public as $$
declare v_code text := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
begin
  insert into public.invites (code, created_by) values (v_code, auth.uid());
  return v_code;
end $$;
grant execute on function public.make_invite() to authenticated;
