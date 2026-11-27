// First pass: walk the main path on one phone and take pictures. Not the full suite.
import { chromium, serveApp, phone, act, see, state, shot, onboard, logAll, check } from "./lib.mjs";
const out = process.argv[2] || "/tmp/spotter-shots";
const app = await serveApp();
const browser = await chromium.launch();
try {
  const p = await phone(browser, "kevin");
  await shot(p, "01-onboard", out);
  await onboard(p, "Kevin", { start: false });
  await p.goBack().catch(() => {});
  await p.goto("http://127.0.0.1:4173/");
  const s0 = await state(p);
  check(s0.me.settings.onboarded, "onboarding finishes");
  await act(p, "goPlans"); await shot(p, "02-plans", out);
  await act(p, "planDetail", '[data-id="block-2-hypertrophy-strength-lean"]'); await shot(p, "03-plan-detail", out);
  await act(p, "planStart");
  await see(p, "Up next"); await shot(p, "04-today", out);
  await act(p, "start"); await see(p, "Walking Lunge DB"); await shot(p, "05-log", out);
  await logAll(p, (i, n, cur) => (cur ? null : 100 + i * 10), (i, n, cur) => (cur ? null : 10));
  await shot(p, "06-log-done", out);
  await act(p, "finishAsk"); await shot(p, "07-finish", out);
  await act(p, "finishDo"); await see(p, "logged"); await shot(p, "08-done", out);
  console.log("errors:", p.errors);
} finally { await browser.close(); app.close(); }
