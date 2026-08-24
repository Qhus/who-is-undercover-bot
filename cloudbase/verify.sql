-- 只读核验：在 CloudBase PostgreSQL SQL 编辑器执行，不会修改任何对象或数据。
-- 期望所有行的 ok 均为 true。

with checks(object_type, object_name, expected, actual) as (
  values
    ('table', 'public.games', 'exists', case when to_regclass('public.games') is null then 'missing' else 'exists' end),
    ('table', 'public.game_members', 'exists', case when to_regclass('public.game_members') is null then 'missing' else 'exists' end),
    ('column_type', 'public.games.owner_uid', 'text', coalesce((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'games' and column_name = 'owner_uid'), 'missing')),
    ('column_type', 'public.game_members.user_uid', 'text', coalesce((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'game_members' and column_name = 'user_uid'), 'missing')),
    ('function', 'public.is_game_member(text)', 'exists', case when to_regprocedure('public.is_game_member(text)') is null then 'missing' else 'exists' end),
    ('function', 'public.create_game(text,text,jsonb)', 'exists', case when to_regprocedure('public.create_game(text,text,jsonb)') is null then 'missing' else 'exists' end),
    ('function', 'public.join_game(text,text,text)', 'exists', case when to_regprocedure('public.join_game(text,text,text)') is null then 'missing' else 'exists' end),
    ('rls', 'public.games', 'enabled', coalesce((select case when relrowsecurity then 'enabled' else 'disabled' end from pg_class where oid = to_regclass('public.games')), 'missing')),
    ('rls', 'public.game_members', 'enabled', coalesce((select case when relrowsecurity then 'enabled' else 'disabled' end from pg_class where oid = to_regclass('public.game_members')), 'missing')),
    ('policy', 'games_member_select', 'exists', case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'games' and policyname = 'games_member_select') then 'exists' else 'missing' end),
    ('policy', 'games_member_update', 'exists', case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'games' and policyname = 'games_member_update') then 'exists' else 'missing' end),
    ('policy', 'members_same_room_select', 'exists', case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_members' and policyname = 'members_same_room_select') then 'exists' else 'missing' end)
)
select object_type, object_name, expected, actual, expected = actual as ok
from checks
order by object_type, object_name;
