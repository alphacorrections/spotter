-- Imported history is private to its owner, whatever version of the app a friend is running.
drop policy if exists activities_no_imports on public.activities;
create policy activities_no_imports on public.activities as restrictive for select to authenticated using (user_id = auth.uid() or source <> 'import');
