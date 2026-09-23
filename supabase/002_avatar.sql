-- Аватарки: картинка профиля хранится прямо в профиле (маленький JPEG, ~10 КБ).
-- Выполнить один раз: SQL Editor → New query → вставить → Run.

alter table public.profiles add column if not exists avatar text;

-- менять можно только свою картинку и только её — роль и имя остаются за учителем
create or replace function public.set_avatar(img text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужно войти';
  end if;
  if img is not null and (img not like 'data:image/%' or length(img) > 150000) then
    raise exception 'Картинка слишком большая или не картинка';
  end if;
  update public.profiles set avatar = img where id = auth.uid();
end $$;

revoke all on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;
