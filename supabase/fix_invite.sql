-- 修复「生成邀请码失败」：原函数用了 pgcrypto 的 gen_random_bytes，在 Supabase 里不在 public 下。
-- 用法：SQL Editor 粘贴 → Run。
create or replace function public.make_invite()
returns text language plpgsql security definer set search_path = public as $$
declare v_code text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
begin
  insert into public.invites (code, created_by) values (v_code, auth.uid());
  return v_code;
end $$;
grant execute on function public.make_invite() to authenticated;
