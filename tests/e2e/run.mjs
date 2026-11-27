// The full browser suite. Real app build, real Postgres with Spotter's migrations,
// PostgREST in front of it, several "phones" at once. Prints one line per check.
import { execFileSync } from "node:child_process";
import { chromium, serveApp, phone, act, tap, see, state, setState, shot, onboard, signIn, logAll, check, ok, count, sql, fs, path, ROOT, APP } from "./lib.mjs";

const PGRST = process.env.POSTGREST || "/home/claude/vendor-data/postgrest/postgrest";
const SHOTS = process.env.SHOTS || "";
const work = execFileSync("bash", [path.join(ROOT, "tests/e2e/stack.sh"), "start", PGRST], { encoding: "utf8" }).trim().split("\n").pop();
const app = await serveApp();
const browser = await chromium.launch();
const pages = [];
const snap = async (page, name, w = 390) => { if (SHOTS) await shot(page, `${name}-${w}`, SHOTS); };
let failed = null;

try {
  // ============================================================ one phone, no account
  const k = await phone(browser, "kevin"); pages.push(k);
  await onboard(k, "Kevin", { focus: "hypertrophy", days: 5 });
  await see(k, "Up next");
  let s = await state(k);
  check(s.blocks.length === 1 && s.blocks[0].program_slug === "block-2-hypertrophy-strength-lean", "setup recommends the 5-day hypertrophy plan and starts it");
  check((await k.locator(".hero .heroT").innerText()) === "Legs A", "Today shows the first session of the plan");
  await snap(k, "today");

  await act(k, "start");
  await see(k, "Walking Lunge DB");
  check((await k.locator("#lift0 input[data-f=weight]").inputValue()) === "", "a first-time lift asks you to find your weight, no guess");
  check((await k.locator("#lift0 input[data-f=reps]").inputValue()) === "6", "and starts the reps at the bottom of the range");
  check(await k.getByText("Weight is both dumbbells added together").first().isVisible(), "dumbbell lifts say the weight is both dumbbells added");
  await snap(k, "log");

  // Why and how
  await act(k, "why", '[data-i="0"]'); await see(k, "No history for this lift yet"); ok("Why this target explains a first-time lift");
  await tap(k, "#sheet [data-close]");
  await act(k, "how", '[data-i="1"]'); await see(k, "Works"); ok("How-to sheet opens with the muscles worked");
  await tap(k, "#sheet [data-close]");

  // Swap the hip thrust for pain
  await act(k, "swapOpen", '[data-i="1"]');
  await see(k, "Barbell Glute Bridge"); await snap(k, "swap");
  await act(k, "swapPick", '[data-id="Barbell_Glute_Bridge"]');
  await act(k, "swapReason", '[data-v="pain"]');
  check(await k.locator("#swapToday").isHidden(), "a swap for pain cannot be today-only");
  await act(k, "swapDo", '[data-scope="block"]');
  s = await state(k);
  check(s.me.no_go.some((n) => n.exercise_id === "Barbell_Hip_Thrust"), "the lift that hurt goes on the no-go list");
  check(s.blocks[0].plan.sessions[0].slots[1].exercise === "Barbell_Glute_Bridge", "and is replaced for the rest of the block");
  check(s.changes[0].reason === "pain" && s.changes[0].scope === "block", "the reason for the swap is recorded");

  // Log the whole session
  await logAll(k, (i, n, cur) => (cur ? null : [70, 185, 70, 90, 50, 80, 45][i]), () => 10);
  s = await state(k);
  let a = s.activities[0];
  check(a.efforts.filter((e) => e.kind === "work").length === 27, "every set of the session logs (27 sets across 8 lifts)", String(a.efforts.length));
  check(a.efforts.every((e) => e.verdict === "first"), "first-time sets are marked First time, not judged");
  check(a.efforts.find((e) => e.exercise_id === "Sissy_Squat").weight === null, "bodyweight finisher logs reps with no weight");
  await act(k, "finishAsk"); await act(k, "rate", '[data-v="4"]'); await k.fill("#fnote", "Good start");
  await snap(k, "finish");
  await act(k, "finishDo"); await see(k, "Legs A logged"); await tap(k, "#sheet [data-close]");
  await see(k, "Done for today");
  s = await state(k);
  check(s.blocks[0].position === 1 && s.activities[0].checkin.rating === 4, "finishing moves the block on and saves the private rating");

  // A week later, same session: targets come from what was lifted
  await setState(k, (st) => {
    const back = (iso) => new Date(new Date(iso).getTime() - 7 * 86400000).toISOString();
    for (const x of st.activities) { x.started_at = back(x.started_at); x.ended_at = back(x.ended_at); x.efforts.forEach((e) => { e.logged_at = back(e.logged_at); }); }
    st.blocks[0].position = 7; st.blocks[0].last_done = null;
  });
  await see(k, "Up next");
  check((await k.locator(".top .who span").innerText()).startsWith("Week 2 of 8"), "position 7 of a 7-day rotation is week 2");
  await see(k, "start 70 × 11"); ok("Today previews next targets from last week's sets");
  await act(k, "start"); await see(k, "Walking Lunge DB");
  check((await k.locator("#lift0 input[data-f=weight]").inputValue()) === "70" && (await k.locator("#lift0 input[data-f=reps]").inputValue()) === "11", "lunge 70 × 10 inside 6–12: same weight, one more rep");
  check((await k.locator("#lift1 input[data-f=weight]").inputValue()) === "195" && (await k.locator("#lift1 input[data-f=reps]").inputValue()) === "8", "glute bridge 185 × 10 hit the top of 8–10: +10 lb, back to 8");
  await act(k, "why", '[data-i="1"]'); await see(k, "That is progressive overload"); ok("Why this target explains the weight jump in plain words");
  await tap(k, "#sheet [data-close]");
  await act(k, "logSet", '[data-i="0"]'); await see(k, "Beat it");
  await k.locator("#lift1 input[data-f=reps]").fill("6"); await k.locator("#lift1 input[data-f=reps]").blur();
  await act(k, "logSet", '[data-i="1"]'); await see(k, "Big jump");
  await k.locator("#lift2 input[data-f=weight]").fill("60"); await k.locator("#lift2 input[data-f=weight]").blur();
  await act(k, "logSet", '[data-i="2"]'); await see(k, "Down");
  ok("verdicts: more reps = Beat it, heavier but under the range = Big jump, lighter = Down");
  check(await k.locator("#restchip").isVisible(), "a rest timer starts after a logged set");
  await snap(k, "log-week2");
  // Stepper buttons and adding an exercise off plan
  await act(k, "stp", '[data-k="legs_a.calf"][data-f="weight"][data-d="1"]');
  check((await k.locator("#lift3 input[data-f=weight]").inputValue()) === "95", "the + button moves weight by one 5 lb step");
  await act(k, "addExercise"); await k.fill("#exq", "goblet"); await act(k, "addPick", '[data-id="Goblet_Squat"]');
  await see(k, "Goblet Squat"); ok("any of the 880 exercises can be added to a session");
  await act(k, "addExercise"); await k.fill("#exq", "zercher carry thing"); await act(k, "newExercise"); await act(k, "newExerciseSave");
  s = await state(k);
  check(s.exercises.length === 1 && s.exercises[0].id.startsWith("u_"), "a lift that is not in the library can be created on the spot");
  await logAll(k, (i, n, cur) => (cur ? null : 50), (i, n, cur) => (cur ? null : 8));
  await act(k, "finishAsk"); await act(k, "finishDo"); await tap(k, "#sheet [data-close]");

  // Other domains
  await tap(k, '[data-nav="add"]'); await tap(k, '#sheet [data-act="logCardio"]'); await k.fill("#cmin", "30"); await k.fill("#cdist", "3.1"); await act(k, "cardioZone", '[data-v="2"]'); await act(k, "cardioSave");
  await act(k, "logWalk"); await k.fill("#wsteps", "8200"); await act(k, "walkSave");
  await act(k, "logYoga"); await k.fill("#ymin", "45"); await k.fill("#ylink", "https://example.com/class/12"); await act(k, "yogaSave");
  await act(k, "goRoutines");
  check((await k.locator('[data-act="openRoutine"]').count()) >= 7 && (await k.getByText("Suggested today").count()) === 1, "mobility lists every routine with today's suggestion on top");
  await act(k, "openRoutine"); await see(k, "Controlled reps"); await snap(k, "mobility");
  await k.locator("#mb0").check(); await act(k, "mobDone");
  await tap(k, '[data-nav="add"]'); await tap(k, '#sheet [data-act="logBody"]'); await k.fill("#bw", "205"); await k.fill("#bsleep", "7.5"); await act(k, "bodySave");
  s = await state(k);
  const doms = s.activities.map((x) => x.domain).sort().join(",");
  check(doms === "cardio,mobility,strength,strength,walking,yoga", "cardio, steps, yoga and mobility all log as activities", doms);

  // Calisthenics and HIIT routines, and the saved-to-try list
  await see(k, "Try something different"); await snap(k, "today-try");
  await tap(k, '[data-nav="add"]'); await tap(k, '#sheet [data-act="pickRoutine"][data-kind="move"]');
  check((await k.locator('#sheet [data-act="openRoutine"]').count()) === 6, "six calisthenics and HIIT routines to follow along with");
  await tap(k, '#sheet [data-act="openRoutine"][data-key="cal_push"]'); await see(k, "3 rounds"); await snap(k, "calisthenics");
  await act(k, "mobRounds", '[data-d="-1"]'); await act(k, "mobDone");
  await tap(k, '[data-nav="add"]'); await tap(k, '#sheet [data-act="pickRoutine"][data-kind="move"]'); await tap(k, '#sheet [data-act="openRoutine"][data-key="hiit_ten"]'); await act(k, "mobDone");
  s = await state(k);
  const cal = s.activities.find((x) => x.title === "Push and Core"), hiit = s.activities.find((x) => x.title === "Ten-Minute HIIT");
  check(cal.domain === "strength" && cal.efforts.length === 10 && cal.efforts.filter((e) => e.exercise_id === "Pushups").every((e) => e.reps === 10), "a calisthenics circuit logs as strength work: 2 rounds of 5 moves");
  check(hiit.domain === "cardio" && hiit.efforts.length === 20 && hiit.efforts[0].hr_zone === 4 && hiit.duration_s === 600, "a HIIT routine logs as 10 minutes of hard cardio");
  await act(k, "savedAdd"); await k.fill("#svurl", "watch this https://www.instagram.com/reel/Cx123abc/?igsh=zz great"); await k.fill("#svtitle", "Cable shoulder circuit"); await act(k, "savedTag", '[data-v="Upper"]'); await act(k, "savedSave");
  await see(k, "1 saved workout to try"); await act(k, "goSaved"); await see(k, "Cable shoulder circuit"); await snap(k, "saved");
  s = await state(k);
  check(s.saved[0].url === "https://www.instagram.com/reel/Cx123abc/?igsh=zz" && s.saved[0].tag === "Upper", "a pasted reel link is saved clean, with a name and a tag");
  await act(k, "savedOpen");
  check((await k.locator('#sheet a[href^="https://www.instagram.com/reel/"]').getAttribute("target")) === "_blank", "opening it goes to the original link in a new tab");
  await act(k, "savedTried"); await see(k, "Tried");
  await act(k, "goToday");
  check(s.activities.find((x) => x.domain === "cardio").efforts[0].distance_m === 4989 && s.health[0].sleep_minutes === 450, "distance is stored in metres, sleep in minutes");
  await see(k, "8,200 steps"); await snap(k, "today-done");

  // Coach: eating target
  await act(k, "goCoach"); await act(k, "eatOpen");
  await k.locator('#eatphase [data-v="cut"]').click(); await k.fill("#eatm", "2900"); await act(k, "eatSave");
  await see(k, "2300"); await see(k, "205 g");
  ok("eating target: 2,900 maintenance on a cut gives 2,300 calories and 205 g protein");
  await snap(k, "coach");
  await act(k, "gloss", '[data-i="0"]'); await see(k, "one more rep"); await tap(k, "#sheet [data-close]");
  s = await state(k);
  check(s.blocks[0].nutrition_phase === "cut", "the running block knows you are on a cut");

  // Progress
  await act(k, "goToday"); await tap(k, '[data-nav="progress"]'); await see(k, "Lifts"); await snap(k, "progress");
  await act(k, "liftOpen", '[data-id="Dumbbell_Walking_Lunge"]'); await see(k, "Estimated one-rep max"); await snap(k, "lift-chart"); await tap(k, "#sheet [data-close]");
  ok("Progress charts a lift across sessions");

  // Plans and the editor
  await tap(k, '[data-nav="plans"]'); await see(k, "Running now"); await snap(k, "plans");
  await act(k, "planFocus", '[data-v="strength"]');
  check((await k.locator('[data-act="planDetail"]').count()) === 3, "filtering plans by Strength leaves the two strength plans");
  await act(k, "editPlan"); await see(k, "Edit plan");
  const sets = k.locator('input[data-chg="edSets"][data-k="legs_a.lunge"]'); await sets.fill("5"); await sets.blur();
  await act(k, "edAdd", '[data-s="legs_a"]'); await k.fill("#exq", "hack squat"); await act(k, "edAddPick", '[data-id="Hack_Squat"]');
  await snap(k, "editor");
  s = await state(k);
  const la = s.blocks[0].plan.sessions[0];
  check(la.slots[0].sets === 5 && la.slots.some((x) => x.exercise === "Hack_Squat"), "the plan editor changes sets and adds a lift to your copy of the plan");
  await act(k, "edSaveAs"); await act(k, "edSaveDo");
  s = await state(k);
  check(s.programs.length === 1 && s.programs[0].slug.startsWith("my-"), "an edited plan can be saved as your own");

  // Settings: light mode, sizes
  await act(k, "goToday");
  const days = await k.locator(".wkday").count();
  check(days >= 3 && (await k.locator(".wkday.sel").count()) === 1, "Today shows the week as tabs, one per day of the plan");
  await k.locator(".wkday").nth(1).click();
  check(await k.locator(".wkday").nth(1).evaluate((e) => e.classList.contains("sel")), "tapping a day shows that day");
  if (await k.locator('[data-act="startNext"]').count()) {
    const before = (await state(k)).activities.length;
    await act(k, "startNext"); await k.goto(APP + "#today");
    check((await k.locator(".wkday").count()) >= 3, "the week tabs stay on Today while a session is in progress");
    await act(k, "cancelAsk"); await act(k, "discard");
    check((await state(k)).activities.length === before && (await k.locator('[data-act="resume"]').count()) === 0, "a session started by accident can be cancelled from Today");
  }
  {
    const b0 = (await state(k)).blocks.find((x) => x.status === "active");
    await k.goto(APP + "#plans"); await k.locator('[data-act="planDetail"]').last().click();
    await act(k, "planWeekAsk"); await act(k, "planStartAt", '[data-w="3"]');
    const s3 = await state(k), nb = s3.blocks.find((x) => x.status === "active");
    check(nb.position === 2 * nb.plan.rotation.length && nb.id !== b0.id, "a plan can be started part-way through, at the week you are on");
    await setState(k, (s, id) => { s.blocks = s.blocks.filter((x) => x.status !== "active"); s.blocks.find((x) => x.id === id).status = "active"; }, b0.id);
    await k.goto(APP + "#today");
  }
  if (await k.locator('[data-act="otherDay"]').count()) {
    await act(k, "otherDay");
    check((await k.locator('#sheet [data-act="weekStart"]').count()) >= 2, "Up next is a suggestion: you can pick a different day");
    await k.locator("#sheet [data-close]").first().click();
  }
  await k.goto(APP + "#calendar");
  check((await k.locator(".cald").count()) >= 28 && (await k.locator(".cald.lift").count()) >= 1, "the calendar shows the month with lifting days marked");
  await snap(k, "calendar");
  await k.locator('.cald[data-act="calDay"]').first().click();
  await snap(k, "calendar-day");
  check((await k.locator("#sheet .calrow").count()) >= 1, "tapping a day says what happened");
  await k.locator("#sheet [data-close]").first().click(); await k.goto(APP + "#today");
  await act(k, "goSettings");
  check((await k.locator('[data-act="setPage"]').count()) === 4 && (await k.locator("#setname").count()) === 0, "Settings is a short menu of topics");
  await act(k, "setPage", '[data-p="nogo"]'); check((await k.locator('[data-act="noGoAdd"]').count()) === 1, "the no-go list has its own page with an Add button");
  await act(k, "goSettings"); await act(k, "setPage", '[data-p="look"]'); await act(k, "setMode", '[data-v="light"]');
  check((await k.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light", "light mode switches on");
  await act(k, "goSettings"); await snap(k, "settings-light"); await act(k, "goToday"); await snap(k, "today-light");
  await act(k, "goSettings"); await act(k, "setPage", '[data-p="look"]'); await act(k, "setMode", '[data-v="dark"]'); await act(k, "goSettings"); await act(k, "goToday");

  // ============================================================ accounts and sync
  await tap(k, '[data-nav="friends"]'); await see(k, "Sign in to train with friends"); await snap(k, "friends-signed-out");
  await act(k, "signIn"); await signIn(k, "kevin@example.test");
  await k.waitForFunction(() => JSON.parse(localStorage.getItem("spotter.v1")).sync.at > 0, null, { timeout: 15000 });
  s = await state(k);
  check(!s.sync.error, "first sync after sign-in succeeds", s.sync.error || "");
  const n = (q) => +sql(q);
  const localEfforts = s.activities.reduce((t, x) => t + x.efforts.length, 0);
  check(n("select count(*) from activities") === 8 && n("select count(*) from efforts") === localEfforts && localEfforts === 94, "all eight sessions and all 94 sets and efforts reached the database", sql("select (select count(*) from activities) || ' / ' || (select count(*) from efforts)") + " local " + localEfforts);
  check(n("select count(*) from session_checkins") === 2 && n("select count(*) from blocks") === 1 && n("select count(*) from block_changes") === 1 && n("select count(*) from programs") === 1, "check-ins, the block, the swap record and the saved plan synced");
  check(sql("select no_go->0->>'exercise_id' from profile_private") === "Barbell_Hip_Thrust" && sql("select settings->>'focus' from profile_private") === "hypertrophy", "profile, no-go list and settings synced");
  check(n("select count(*) from exercises where source = 'user'") === 1 && n("select count(*) from nutrition_targets") === 1 && n("select count(*) from body_metrics") === 1 && n("select count(*) from daily_health") === 1 && n("select count(*) from saved_links where tried_on is not null") === 1, "custom lift, eating target, weight, sleep and the saved link synced");

  // Groups
  await see(k, "Start one, or join with a code");
  await act(k, "grCreate"); await k.fill("#grname", "Saturday Lifters"); await act(k, "grCreateDo");
  await k.locator(".code").waitFor();
  const code = (await k.locator(".code").innerText()).trim();
  check(/^[A-HJKMNP-Z2-9]{6}$/.test(code), "creating a group gives a six-character code", code);

  const j = await phone(browser, "jake"); pages.push(j);
  await onboard(j, "Jake", { focus: "hypertrophy", days: 3, start: false });
  await tap(j, '[data-nav="friends"]'); await act(j, "signIn"); await signIn(j, "jake@example.test");
  await see(j, "Start one, or join with a code");
  await act(j, "grJoin"); await j.fill("#grcode", "zzzzzz"); await act(j, "grJoinDo"); await see(j, "No group has that code"); ok("a wrong code is refused with a plain message");
  await j.fill("#grcode", code.toLowerCase()); await act(j, "grJoinDo");
  await see(j, "Saturday Lifters"); await see(j, "Kevin · Legs A");
  check(await j.getByText("Dumbbell Walking Lunge").first().isVisible(), "Jake joins with the code and sees Kevin's session with sets and weights");
  check((await j.getByText("Good start").count()) > 0, "the line Kevin wrote for friends shows on the feed");
  check((await j.locator("body").innerText()).indexOf("Solid") < 0 && n("select count(*) from session_checkins") === 2, "Kevin's private rating is not on Jake's screen");
  await snap(j, "friends-feed");
  await j.locator('[data-act="react"][data-e="💪"]').first().click();
  await j.locator('[data-act="cmtOpen"]').first().click(); await j.fill("#cmtbody", "Strong week"); await act(j, "cmtSend");
  await see(j, "Strong week");
  check(n("select count(*) from reactions") === 1 && n("select count(*) from comments") === 1, "Jake's reaction and comment are saved");

  // Kevin shares his plan as a group block; Jake runs it
  await act(k, "frReload"); await see(k, "Strong week"); ok("Kevin sees Jake's comment");
  await act(k, "gbShareAsk"); await k.fill("#gbtitle", "Block 2 together"); await act(k, "gbShareDo");
  await see(k, "Shared by You");
  await act(j, "frReload"); await see(j, "Block 2 together");
  await act(j, "gbJoin"); await see(j, "Jump to week 2"); ok("joining late offers week 1 or the group's current week");
  await act(j, "gbJoinDo", '[data-w="1"]'); await see(j, "Up next");
  s = await state(j);
  check(s.blocks[0].group_block_id && s.blocks[0].plan.sessions[0].slots.some((x) => x.exercise === "Hack_Squat"), "Jake gets his own copy of Kevin's edited plan");
  await act(j, "start"); await see(j, "Walking Lunge DB");
  await j.locator("#lift0 input[data-f=weight]").fill("40"); await j.locator("#lift0 input[data-f=weight]").blur(); await act(j, "logSet", '[data-i="0"]');
  await act(j, "swapOpen", '[data-i="1"]'); await act(j, "swapPick", '[data-id="Single_Leg_Glute_Bridge"]'); await act(j, "swapDo", '[data-scope="block"]');
  await act(j, "finishAsk"); await act(j, "finishDo"); await tap(j, "#sheet [data-close]");
  await j.waitForFunction(() => { const st = JSON.parse(localStorage.getItem("spotter.v1")); return st.activities.every((x) => !x._d) && st.blocks.every((b) => !b._d); }, null, { timeout: 15000 });
  s = await state(k);
  check(s.blocks[0].plan.sessions[0].slots[1].exercise === "Barbell_Glute_Bridge", "Jake's swap did not touch Kevin's plan");
  await tap(k, '[data-nav="today"]'); await tap(k, '[data-nav="friends"]'); await act(k, "frReload");
  await see(k, "Jake · Legs A"); await see(k, "Week 1");
  ok("Kevin sees Jake's session and which week Jake is on");
  await snap(k, "friends-group");

  // Per-group privacy
  await act(k, "grPrivacy"); await see(k, "session names only");
  await act(j, "goToday").catch(() => {}); await tap(j, '[data-nav="friends"]'); await act(j, "frReload"); await see(j, "Kevin · Legs A");
  check((await j.locator(".feed", { hasText: "Kevin · Legs A" }).first().locator(".feedsets").count()) === 0, "names only: Jake still sees that Kevin trained, but not the sets");
  check((await j.locator(".feed", { hasText: "You · Legs A" }).first().locator(".feedsets").count()) === 1, "and Jake's own session still shows his own sets");
  await act(k, "grPrivacy"); await see(k, "full detail");

  // A new phone: sign in and everything comes back
  const k2 = await phone(browser, "kevin-new-phone"); pages.push(k2);
  await act(k2, "signIn"); await signIn(k2, "kevin@example.test");
  await see(k2, "Today");
  s = await state(k2);
  check(s.me.display_name === "Kevin" && s.me.settings.onboarded && s.blocks.length === 1 && s.activities.length === 8 && s.saved.length === 1, "signing in on a new phone restores the profile, the plan, all history and saved links, and skips setup");
  check(s.activities.find((x) => x.session_key === "legs_a").efforts.length >= 27 && s.activities.some((x) => x.checkin), "sets and private check-ins come back too");
  await k2.locator(".top .who b").waitFor();
  check(/Week 2/.test(await k2.locator(".top .who span").innerText()), "and the block picks up at the same week");

  // Offline: log with no connection, sync when it returns
  await j.context().setOffline(true);
  await tap(j, '[data-nav="add"]'); await act(j, "menuFree");
  await act(j, "addExercise"); await act(j, "addPick", '[data-id="Pushups"]');
  await j.locator("#lift0 input[data-f=reps]").fill("12"); await j.locator("#lift0 input[data-f=reps]").blur(); await act(j, "logSet", '[data-i="0"]');
  await act(j, "finishAsk"); await act(j, "finishDo"); await tap(j, "#sheet [data-close]");
  const before = n("select count(*) from activities");
  s = await state(j);
  check(s.activities.length === 2 && s.activities[1]._d === 1, "offline: the session is saved on the phone and waits");
  await j.context().setOffline(false);
  await j.evaluate(() => window.dispatchEvent(new Event("online")));
  await j.waitForFunction(() => JSON.parse(localStorage.getItem("spotter.v1")).activities.every((x) => !x._d), null, { timeout: 15000 });
  check(n("select count(*) from activities") === before + 1, "back online: it syncs with nothing lost");

  // Deleting a session removes it everywhere
  await tap(j, '[data-nav="progress"]'); await j.locator('[data-act="actOpen"]').first().click(); await act(j, "actDelete"); await act(j, "actDelete");
  await j.waitForFunction(() => { const st = JSON.parse(localStorage.getItem("spotter.v1")); return st.activities.length === 1 && st.dels.length === 0; }, null, { timeout: 15000 });
  check(n("select count(*) from activities") === before, "a deleted session is removed from the account too");
  await j.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await j.waitForTimeout(1200);
  check((await state(j)).activities.length === 1, "and does not come back on the next sync");

  // Remote update, the way Tally does it
  fs.writeFileSync(path.join(app.dir, "version.json"), JSON.stringify({ version: "2099.1.1.1", note: "New things inside" }));
  await k.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(k, "goSettings").catch(() => {}); await tap(k, '[data-nav="today"]').catch(() => {});
  await k.goto(APP + "#prefs"); await act(k, "updateTap");
  await k.locator(".updbar").waitFor({ timeout: 8000 });
  check((await k.locator(".updbar").innerText()).includes("New things inside"), "a newer version.json shows the Update ready bar with its note");
  const box = await k.locator(".updbar").boundingBox();
  check(box.x >= 0 && box.x + box.width <= 390 && Math.abs(box.x + box.width / 2 - 195) < 2, "the update bar is centred and fully on screen", JSON.stringify(box));
  await snap(k, "update-bar");
  await k.locator(".updbar").click(); await k.waitForURL(/\?v=2099/);
  ok("tapping it reloads the app onto the new version");

  // Small phone
  const small = await phone(browser, "small", { width: 340 }); pages.push(small);
  await onboard(small, "Sam", { focus: "strength", days: 4 });
  await see(small, "Up next");
  s = await state(small);
  check(s.blocks[0].program_slug === "strength-4", "a strength goal at 4 days recommends the four-lift strength plan");
  await snap(small, "today", 340);
  await act(small, "start"); await see(small, "Barbell Squat");
  await small.locator("#lift0 input[data-f=weight]").fill("225"); await small.locator("#lift0 input[data-f=weight]").blur(); await act(small, "logSet", '[data-i="0"]');
  await snap(small, "log", 340);
  for (const [name, pg] of [["small log", small]]) {
    const wide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!wide, `no sideways scroll at 340 wide (${name})`);
  }
  await setState(small, (st) => {
    const back = (iso) => new Date(new Date(iso).getTime() - 7 * 86400000).toISOString();
    const a0 = st.activities[0]; a0.started_at = back(a0.started_at); a0.ended_at = a0.started_at; delete a0.open; delete a0.items; delete a0.draft; delete a0.swaps;
    a0.efforts[0].reps = 6; st.blocks[0].position = 7; st.blocks[0].last_done = null;
  });
  await small.goto(APP + "#today");
  await act(small, "start"); await see(small, "Barbell Squat");
  check((await small.locator("#lift0 input[data-f=weight]").inputValue()) === "235" && (await small.locator("#lift0 input[data-f=reps]").inputValue()) === "4", "strength plan: 225 × 6 hit the top of 4–6, so the top set goes to 235 × 4");
  await act(small, "logSet", '[data-i="0"]');
  await see(small, "Back-off set");
  check((await small.locator("#lift0 input[data-f=weight]").inputValue()) === "210", "and the back-off sets come in 10 percent lighter");
  await snap(small, "log-backoff", 340);

  const errors = pages.flatMap((p) => p.errors);
  check(errors.length === 0, "no page errors on any phone", errors.join(" | "));
  // ============================================================ two accounts, one phone
  {
    const codeFor = async (email) => (await (await fetch(`http://127.0.0.1:54321/__test/code?email=${encodeURIComponent(email)}`)).json()).code;
    const swap = async (email) => {
      await k.goto(APP + "#prefs"); await act(k, "signOutAsk"); await act(k, "signOutDo"); await act(k, "signIn");
      await k.fill("#sgemail", email); await act(k, "signSend"); await k.locator("#sgcode").waitFor();
      await k.fill("#sgcode", await codeFor(email)); await act(k, "signVerify"); await see(k, "A different account");
    };
    const mine = (await state(k)).activities.length;
    await swap("burner@example.test");
    check((await state(k)).activities.length === mine && mine > 0, "signing in as someone else leaves the phone's data alone until you choose");
    await act(k, "switchYes"); await k.locator("#obname").waitFor();
    check((await state(k)).activities.length === 0, "switching opens the second account on a clean slate");
    await onboard(k, "Burner");
    const rows = await sql(`select count(*) from public.activities a join auth.users u on u.id = a.user_id where u.email = 'burner@example.test'`);
    check(String(rows).trim() === "0", "none of the first account's training reaches the second account");
    await swap("kevin@example.test"); await act(k, "switchYes"); await k.locator("#sheet").waitFor({ state: "detached", timeout: 10000 });
    const back = await state(k);
    check(back.activities.length === mine && back.me.display_name !== "Burner", "switching back brings the first account's data back, nothing lost");
  }
} catch (e) {
  failed = e;
  for (const [i, p] of pages.entries()) { try { await p.screenshot({ path: `/tmp/spotter-fail-${i}.png` }); } catch (x) { /* page gone */ } }
  console.log(String(e.message || e).split("\n").slice(0, 6).join("\n"));
  console.log("page errors:", pages.flatMap((p) => p.errors).join(" | ") || "none");
} finally {
  await browser.close(); app.close();
  execFileSync("bash", [path.join(ROOT, "tests/e2e/stack.sh"), "stop", work]);
}
console.log("---");
console.log(`passed: ${count()}   failed: ${failed ? 1 : 0}`);
process.exit(failed ? 1 : 0);
