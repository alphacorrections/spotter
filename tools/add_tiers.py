"""Gives every built-in plan three sizes. Each slot gets a tier: 1 Starter, 2 Standard, 3 Full.
A plan run at size N keeps the slots with tier <= N. Re-runnable: it rewrites tiers and adds any missing slots.
usage: python3 tools/add_tiers.py"""
import json, pathlib, copy
from jsonschema import Draft202012Validator
root = pathlib.Path(__file__).resolve().parent.parent
LIB = {e["id"]: e for e in json.loads((root / "src/data/exercises.json").read_text()) + json.loads((root / "src/data/builtin-exercises.json").read_text())}

def N(key, exercise, like):            # a weighted lift, rep ranges copied from a similar slot in the same plan
    return ("like", key, exercise, like)
def BW(key, exercise, lo, hi, seconds=False, role="accessory"):   # bodyweight, same range every phase
    return ("bw", key, exercise, lo, hi, seconds, role)
def FIN(key, exercise):                # bodyweight finisher, to failure
    return ("fin", key, exercise)

P = {
 "block-2-hypertrophy-strength-lean": {
  "legs_a": (["lunge", "hip_thrust", "leg_curl", "calf"], ["pendulum", "crunch"], ["back_ext", "finisher"]),
  "upper_1": (["incline_press", "pulldown", "row", "lateral"], ["curl", "pushdown"], ["finisher"]),
  "legs_b": (["leg_press", "split_squat", "leg_curl", "leg_ext"], ["calf", "leg_raise"], ["finisher"]),
  "upper_2": (["bench", "row", "fly", "face_pull"], ["curl", "tricep"], ["finisher"]),
  "upper_3": (["press", "pulldown", "fly", "lateral"], ["curl", "pushdown"], ["finisher"])},
 "upper-lower-4": {
  "upper_a": (["bench", "row", "press", "pulldown"], ["lateral", "pushdown", "curl"], [N("face_pull", "Face_Pull", "lateral"), FIN("finisher", "Pushups")]),
  "lower_a": (["squat", "rdl", "leg_ext", "leg_curl"], ["calf", "crunch"], [N("lunge", "Dumbbell_Walking_Lunge", "calf"), N("back_ext", "Hyperextensions_Back_Extensions", "crunch")]),
  "upper_b": (["pullup", "incline", "row", "fly"], ["face_pull", "curl", "tricep"], [N("lateral", "Side_Lateral_Raise", "face_pull"), FIN("finisher", "Dips_-_Chest_Version")]),
  "lower_b": (["hip_thrust", "leg_press", "split_squat", "leg_curl"], ["calf", "leg_raise"], [N("leg_ext", "Leg_Extensions", "calf"), N("adductor", "Thigh_Adductor", "calf")])},
 "push-pull-legs-6": {
  "push": (["bench", "press", "incline", "lateral"], ["pushdown", "overhead"], [N("fly", "Cable_Crossover", "pushdown"), FIN("finisher", "Dips_-_Chest_Version")]),
  "pull": (["row", "pulldown", "cable_row", "face_pull"], ["curl", "hammer"], [N("straight_arm", "Straight-Arm_Pulldown", "curl"), N("rear_fly", "Reverse_Flyes", "curl")]),
  "legs": (["squat", "rdl", "leg_press", "leg_curl"], ["calf", "crunch"], [N("leg_ext", "Leg_Extensions", "calf"), N("hip_thrust", "Barbell_Hip_Thrust", "calf")])},
 "full-body-3": {
  "full_a": (["squat", "bench", "row", "press", "plank"], [N("leg_curl", "Lying_Leg_Curls", "press"), N("curl", "Barbell_Curl", "press")], [N("calf", "Standing_Calf_Raises", "press"), N("face_pull", "Face_Pull", "press")]),
  "full_b": (["rdl", "pulldown", "incline", "leg_ext", "curl"], [N("lateral", "Side_Lateral_Raise", "curl"), N("pushdown", "Triceps_Pushdown", "curl")], [N("calf", "Seated_Calf_Raise", "curl"), N("crunch", "Cable_Crunch", "curl")]),
  "full_c": (["leg_press", "db_bench", "db_row", "lateral", "pushdown"], [N("leg_curl", "Seated_Leg_Curl", "pushdown"), N("hammer", "Hammer_Curls", "pushdown")], [N("rear_fly", "Reverse_Flyes", "lateral"), BW("leg_raise", "Hanging_Leg_Raise", 8, 15)])},
 "dumbbell-home-3": {
  "home_a": (["squat", "bench", "row", "lateral"], ["curl", "finisher"], [N("fly", "Dumbbell_Flyes", "curl"), N("calf", "Standing_Dumbbell_Calf_Raise", "curl")]),
  "home_b": (["sldl", "press", "row", "tricep"], ["calf", "finisher"], [N("incline_curl", "Incline_Dumbbell_Curl", "tricep"), N("rear_fly", "Reverse_Flyes", "tricep")]),
  "home_c": (["split_squat", "incline", "lunge", "hammer"], ["plank", "finisher"], [N("row", "One-Arm_Dumbbell_Row", "hammer"), N("lateral", "Side_Lateral_Raise", "hammer")])},
 "strength-4": {
  "squat_day": (["squat", "rdl", "plank"], ["leg_press"], [N("leg_ext", "Leg_Extensions", "leg_press"), N("calf", "Standing_Calf_Raises", "leg_press")]),
  "bench_day": (["bench", "row", "pushdown"], ["db_press", "face_pull"], [N("incline", "Incline_Dumbbell_Press", "db_press")]),
  "deadlift_day": (["deadlift", "front_squat", "leg_raise"], ["leg_curl"], [N("pulldown", "Wide-Grip_Lat_Pulldown", "leg_curl"), N("back_ext", "Hyperextensions_Back_Extensions", "leg_curl")]),
  "press_day": (["press", "pullup", "close_bench"], ["curl", "lateral"], [N("rear_fly", "Reverse_Flyes", "lateral")])},
 "strength-3": {
  "str_a": (["squat", "bench", "row"], ["plank"], [N("pushdown", "Triceps_Pushdown", "row"), N("leg_curl", "Lying_Leg_Curls", "row")]),
  "str_b": (["deadlift", "press", "chin"], ["leg_raise"], [N("lateral", "Side_Lateral_Raise", "chin"), N("leg_ext", "Leg_Extensions", "chin")]),
  "str_c": (["incline", "leg_press", "cable_row"], ["curl"], [N("rdl", "Romanian_Deadlift", "leg_press"), N("face_pull", "Face_Pull", "curl")])},
 "maintain-2": {
  "keep_a": (["squat", "bench", "row", "lateral"], ["plank"], [N("leg_curl", "Lying_Leg_Curls", "lateral"), N("face_pull", "Face_Pull", "lateral")]),
  "keep_b": (["rdl", "press", "pulldown", "curl"], ["pushdown"], [N("leg_ext", "Leg_Extensions", "curl"), N("calf", "Standing_Calf_Raises", "curl")])},
 "bodyweight-basics-3": {
  "move_a": (["squat", "pushup", "bridge"], ["plank"], [BW("superman", "Superman", 8, 15), BW("dips", "Bench_Dips", 6, 15)]),
  "move_b": (["lunge", "pushup", "bridge"], ["dead_bug"], [BW("plank", "Plank", 20, 60, True), BW("squat", "Bodyweight_Squat", 10, 20)]),
  "move_c": (["squat", "dips", "superman"], ["climbers"], [BW("dead_bug", "Dead_Bug", 6, 12), BW("bridge", "Single_Leg_Glute_Bridge", 8, 15)])},
}
P["push-pull-legs-3"] = P["push-pull-legs-6"]

schema = json.loads((root / "templates/program-template.schema.json").read_text())
order = [t["slug"] for t in json.loads((root / "src/data/templates.json").read_text())]
out = []
for slug in order:
    path = root / f"templates/{slug}.json"; t = json.loads(path.read_text()); phases = [p["key"] for p in t["phases"]]
    for s in t["sessions"]:
        tiers = P[slug][s["key"]]; by = {x["key"].split(".", 1)[1]: x for x in s["slots"]}; new = []; seen = set()
        for n, group in enumerate(tiers, 1):
            for g in group:
                if isinstance(g, str): slot = by[g]
                else:
                    k = g[1]; ex = g[2]; assert ex in LIB, ex
                    if k in by: slot = by[k]
                    elif g[0] == "like":
                        slot = copy.deepcopy(by[g[3]])
                        for drop in ("display_name", "alternates", "intensifier", "superset", "load", "measure", "sets", "effort", "rest_s"): slot.pop(drop, None)
                        assert all(isinstance(v, list) for v in slot["reps"].values()), (slug, k)
                        slot["increment"] = 10 if LIB[ex].get("region") == "lower" and LIB[ex].get("equipment") in ("barbell", "machine", "cable") else 5
                    elif g[0] == "bw":
                        slot = {"role": g[6], "reps": {p: [g[3], g[4]] for p in phases}, "load": "bodyweight"}
                        if g[5]: slot["measure"] = "seconds"
                        donor = next((x for x in s["slots"] if "progression" in x and x["role"] == "accessory"), None)
                        if donor: slot["progression"] = copy.deepcopy(donor["progression"])
                    else:
                        slot = {"role": "finisher", "reps": {p: "amrap" for p in phases}, "load": "bodyweight"}
                    slot = {"key": f'{s["key"]}.{k}', **{a: b for a, b in slot.items() if a != "key"}}
                    slot["exercise"] = ex; slot["swap_tags"] = (LIB[ex].get("muscles") or LIB[ex].get("primary_muscles") or [])[:1]
                    by[k] = slot
                slot["tier"] = n; kk = slot["key"]; assert kk not in seen, kk; seen.add(kk); new.append(slot)
        assert len(new) == len(by), (slug, s["key"], set(by) - {x["key"].split(".", 1)[1] for x in new})
        s["slots"] = new
    if "finisher" not in t["roles"] and any(x["role"] == "finisher" for s in t["sessions"] for x in s["slots"]):
        t["roles"]["finisher"] = {"sets": 2, "rest_s": 60, "effort": {"last_set": "to_failure", "text": "Two rounds to failure"}}
    errs = list(Draft202012Validator(schema).iter_errors(t)); assert not errs, (slug, errs[0].message, list(errs[0].path))
    path.write_text(json.dumps(t, indent=2, ensure_ascii=False) + "\n"); out.append(t)
    print(f"{slug:36s}", " | ".join(f'{s["title"]}: ' + "/".join(str(sum(1 for x in s["slots"] if x["tier"] <= n)) for n in (1, 2, 3)) for s in t["sessions"]))
(root / "src/data/templates.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
