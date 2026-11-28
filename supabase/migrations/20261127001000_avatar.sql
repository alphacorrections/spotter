-- A profile picture, kept small (the app shrinks it to 192 px before saving) and stored with the profile,
-- so it is covered by the same rule as your name: only you and people in your groups can see it.
alter table public.profiles add column if not exists avatar text
  check (avatar is null or (char_length(avatar) <= 80000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
