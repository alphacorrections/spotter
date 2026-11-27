# Spotter

A training app for a small group of friends. It tells you what to lift today, gives every set a target, and explains why.

- **Today:** the next session in your plan, a coach note, steps, mobility, something different to try.
- **Session:** one card per lift. The next set is filled in with its target. Log it and it is judged against last time.
- **Plans:** ten built-in plans (hypertrophy, strength, maintain, bodyweight). Any plan can be edited once started.
- **Progress:** every lift over time, the week at a glance, body numbers, history.
- **Friends:** groups joined by a six-character code, a feed, and plans you run side by side.
- **The + button:** cardio, steps, yoga, mobility, calisthenics and HIIT routines, body numbers, and links saved to try.
- **Look:** the Tally glass kit with a blue and gold palette, dark or light.

Without signing in, everything stays in that browser. Signed in (a 6-digit email code, no password), it syncs to a private account and groups switch on.

## Files

| Path | What it is |
|---|---|
| `index.html` | The whole app in one file. **Built, do not edit by hand** |
| `version.json` | The live version and its one-line note. This is what triggers "Update ready" |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Home Screen install and opening with no signal |
| `src/app/` | The app's source: one file per screen |
| `src/engine/` | The coaching rules as plain functions: targets, verdicts, stalls, deloads, calories |
| `src/data/` | Exercise library, plans, mobility and calisthenics routines |
| `templates/` | Every built-in plan as readable JSON, plus the format they follow |
| `supabase/migrations/` | The database: tables, privacy rules, group codes, the exercise seed |
| `.github/workflows/supabase.yml` | Applies `supabase/` to the live project when it changes on `main` |
| `tools/` | `build.mjs` (makes `index.html`), `build_data.py` (library and plans), `make_icons.mjs` |
| `tests/` | Engine tests, database privacy tests, and the browser suite |

## Shipping an update (remote updating, same as Tally)

1. Change the source under `src/`.
2. Bump `version` in `version.json` and write the one-line `note`.
3. `npm run build`
4. Commit and push. GitHub Pages redeploys in a minute or two.

Open copies of the app check `version.json` when they come to the front and every 30 minutes. A newer version shows the **Update ready** bar with your note; a tap reloads onto it. Nobody reinstalls anything.

## Accounts (Supabase)

- **Project:** `wypwbwprnjpfmqzywddh` ("Spotter", same organization as Tally). The app only holds the publishable key in `spotter.config.json`, which is meant to be public; privacy comes from row-level security.
- **Database:** both migrations are applied. All 19 tables have row-level security, signed-out visitors have no access at all, and the live schema matches the tested one column for column.
- **Deploys:** pushing changes under `supabase/` runs the GitHub Action. It needs three repository secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`.
- **Email:** sign-in codes need custom SMTP (Authentication > Emails > SMTP Settings), then `{{ .Token }}` added to the Magic Link template so the email carries the 6-digit code. Supabase's built-in mailer only reaches the project's own team.
- **Advisor warnings:** five "security definer function" warnings are expected. Those functions are how groups are created, joined and checked without exposing the tables.

## Checking it

```
node --test tests/engine/engine.test.mjs    # 21 rule tests, including a replay of 100 logged sets from the old spreadsheet
bash tests/db/run.sh                        # 54 privacy tests, with Supabase-style default permissions on a throwaway Postgres
node tests/e2e/run.mjs                      # 72 browser checks against a stand-in for Supabase
```

The browser suite runs the real build against real Postgres with these migrations, behind PostgREST (the API server Supabase itself runs), with a small stand-in for sign-in. It needs a PostgREST binary: set `POSTGREST=/path/to/postgrest`.

**Tested:** first run, every screen, logging and targets across two weeks, swaps, the plan editor, all other domains, calisthenics and HIIT, saved links, eating targets, sign-in, sync, a second phone, offline then back online, deletes, groups, per-group privacy, shared plans, the update bar, 390 and 340 wide.

**Not tested against live services:** the real Supabase project, real sign-in emails, GitHub Pages, and install to a real phone's Home Screen.

**Not built yet:** push notifications (training and mobility reminders), wearable sync (Oura, Garmin), heart-rate-zone coaching from a watch, event training plans.

## Credits

Exercise data and images: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain). UI kit: Tally glass, from `alphacorrections/tally`.
