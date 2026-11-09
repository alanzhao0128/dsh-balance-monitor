#!/usr/bin/env python3
"""Offline decision-flow test for gemini_quota_probe.py (no network, no CPA needed).

Run:  python3 test_gemini_quota_probe.py
Exit code 0 = all scenarios pass.
"""
import datetime as dt
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("probe", os.path.join(HERE, "gemini_quota_probe.py"))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

tmp = tempfile.mkdtemp()
p.STATE_FILE = os.path.join(tmp, "state.json")
p.CACHE_FILE = os.path.join(tmp, "cache.json")

upstream_calls = {"n": 0}
success = {"v": 10}
mode = {"v": "fail"}

p.active_antigravity_auth = lambda: {"email": "x@y", "success": success["v"]}
p.access_token = lambda email: ("tok", "proj")


def fake_fetch(token, project):
    upstream_calls["n"] += 1
    if mode["v"] == "fail":
        raise urllib.error.HTTPError("u", 500, "boom", {}, io.BytesIO(b"err"))
    if mode["v"] == "no-gemini-group":  # what the server returns for an outdated User-Agent
        return {"groups": [{"displayName": "Claude and GPT models", "buckets": [
            {"bucketId": "3p-5h", "window": "5h", "remainingFraction": 1, "resetTime": "2026-11-09T07:00:00Z"},
            {"bucketId": "3p-weekly", "window": "weekly", "remainingFraction": 1, "resetTime": "2026-11-16T00:00:00Z"}]}]}
    return {"groups": [
        {"displayName": "Gemini Models", "buckets": [
            {"bucketId": "gemini-5h", "window": "5h", "remainingFraction": 0.9, "resetTime": "2026-11-09T07:00:00Z"},
            {"bucketId": "gemini-weekly", "window": "weekly", "remainingFraction": 0.95, "resetTime": "2026-11-16T00:00:00Z"}]},
        {"displayName": "Claude and GPT models", "buckets": [
            {"bucketId": "3p-5h", "window": "5h", "remainingFraction": 1, "resetTime": "2026-11-09T07:00:00Z"}]},
    ]}


p.fetch_summary = fake_fetch


def age_state(seconds):
    s = json.load(open(p.STATE_FILE))
    t = dt.datetime.fromisoformat(s["last_attempt_at"]) - dt.timedelta(seconds=seconds)
    s["last_attempt_at"] = t.isoformat()
    json.dump(s, open(p.STATE_FILE, "w"))


def baseline():
    return json.load(open(p.STATE_FILE))["last_success_count"]


failures = []


def run(label, expect_calls, expect_baseline):
    sys.argv = ["probe"]
    before = upstream_calls["n"]
    p.main()
    got = upstream_calls["n"] - before
    ok = got == expect_calls and baseline() == expect_baseline
    print(f"  [{'ok' if ok else 'FAIL'}] {label}: upstream calls={got} (expect {expect_calls}), "
          f"baseline={baseline()} (expect {expect_baseline})\n")
    if not ok:
        failures.append(label)


print("1) first run, upstream fails");                              run("first run (fail)", 1, 10)
success["v"] = 50
print("2) sessions during the failure backoff are ignored");        run("sessions in backoff ignored", 0, 50)
age_state(3601)
print("3) backoff over, but no NEW session since -> no probe");     run("backoff over, no new session", 0, 50)
success["v"] = 51; mode["v"] = "ok"
print("4) new session after backoff -> probe (recovers)");          run("new session -> probe", 1, 51)
success["v"] = 99
print("5) sessions during success cooldown are ignored");           run("sessions in cooldown ignored", 0, 99)
mtime = os.path.getmtime(p.STATE_FILE); time.sleep(0.05)
print("6) unchanged tick must not rewrite the state file");         run("no-change tick", 0, 99)
if os.path.getmtime(p.STATE_FILE) != mtime:
    print("  [FAIL] state file was rewritten without change\n"); failures.append("needless write")
age_state(3601)
print("7) cooldown over, sessions DURING cooldown don't count");    run("cooldown over, no new session", 0, 99)
success["v"] = 100
print("8) new session after cooldown -> probe");                    run("new session -> probe", 1, 100)
age_state(3601)
success["v"] = 3
print("9) CPA restarted (counter reset) -> rebase, no probe");      run("counter reset", 0, 3)
success["v"] = 4
print("10) session after the reset -> probe");                      run("session after reset", 1, 4)

snap = json.load(open(p.CACHE_FILE))  # snapshot written by scenario 10
age_state(3601)
success["v"] = 5; mode["v"] = "no-gemini-group"
print("11) response WITHOUT the Gemini group (outdated UA) -> fail, keep old cache, never fabricate 100%")
run("missing Gemini group", 1, 5)
if json.load(open(p.STATE_FILE))["last_status"] != "fail":
    print("  [FAIL] missing Gemini group must be recorded as a failure\n"); failures.append("missing group not a failure")
if json.load(open(p.CACHE_FILE)) != snap:
    print("  [FAIL] cache must be left untouched on failure\n"); failures.append("cache overwritten on failure")

w = {x["level"]: x["remaining"] for x in snap["groups"][0]["windows"]}
if snap["groups"][0]["id"] != "gemini" or w != {"5h": 90.0, "weekly": 95.0} or len(snap["groups"]) != 1:
    print("  [FAIL] snapshot should contain only the gemini group with 5h/weekly:", snap); failures.append("snapshot")

print("ALL PASS" if not failures else f"FAILED: {failures}")
sys.exit(1 if failures else 0)
