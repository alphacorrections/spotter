-- History brought in from somewhere else (a spreadsheet) is marked, so it stays out of friends' feeds.
alter table public.activities drop constraint if exists activities_source_check;
alter table public.activities add constraint activities_source_check check (source in ('manual', 'oura', 'garmin', 'strava', 'whoop', 'import'));
update public.activities set source = 'import' where note like 'Imported from your sheet%';
