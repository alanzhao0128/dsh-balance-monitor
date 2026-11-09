#!/usr/bin/env python3
"""Google AI Pro (Gemini) 额度探测器 —— 调用事件驱动 + 冷静期硬锁。

只关心 Gemini 组的 5h 与 weekly 两个窗口（Claude/GPT 组不探测、不输出）。

触发条件（全部满足才会向上游发 1 次请求）：
  1. 距上次探测尝试 >= 1h（成功与失败的冷静期都是 1h，冷静期内无论多少会话都不探测）
  2. 冷静期**结束后**出现了新的成功调用：CPA auth-files 里该账号的 success 计数大于基线。
     基线在冷静期内的每个 30s tick 都跟随当前计数，所以冷静期内发生的会话**不算数**，
     必须等期满后的新会话才触发。
  （首次运行无状态时直接探测）
  success 计数在 CPA 内存里，容器重启会清零；计数回退时重置基线，不当作新会话。

上游：POST https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
  - 必须带较新的 antigravity UA（2.29.0）。旧 UA（hub/1.23.2）下服务端不返回 Gemini 组，
    只返回 Claude/GPT 组 —— 这是 2026-11-09 排查出的真实根因。
  - 响应缺 Gemini 组时一律视为失败，绝不兜底成 100%。

用法：
  gemini_quota_probe.py              正常（timer 每 30s 调用）
  gemini_quota_probe.py --dry-run    只打印结果，不落盘、不更新状态（仍受冷静期约束，需配 --force 才会探测）
  gemini_quota_probe.py --force      忽略冷静期与调用感知，强制探测一次

环境变量（均有默认值，按你的 CPA 部署调整；默认值是 docker 部署在 /root/cliproxyapi 的布局）：
  GQP_CPA_URL         CPA 本机地址（默认 http://127.0.0.1:18317，只用于读 /v0/management/auth-files，不出网）
  CPA_MGMT_KEY        CPA management key；未设置时从 GQP_SECRETS_FILE 里找 `MGMT_KEY=...` 一行
  GQP_SECRETS_FILE    默认 /root/cliproxyapi/.cpa-b1-secrets
  GQP_AUTH_DIR        CPA 的 auth 目录，里面有 antigravity-<email>.json（默认 /root/cliproxyapi/auth）
  GQP_CACHE_FILE      快照输出路径，nginx 把它作为 /v0/google/quota 静态提供
  GQP_STATE_FILE      探测状态文件（冷静期/基线）
  GQP_UA              请求 UA（默认 antigravity/2.29.0 windows/amd64，见上方说明）
  GQP_COOLDOWN_SECONDS / GQP_FAIL_BACKOFF_SECONDS   成功后冷静期 / 失败后退避，默认都是 3600

English summary: event-driven Google AI Pro (Gemini) quota probe. Wakes every 30s (systemd timer),
reads CPA's local `success` counter (no network), and calls Google ONCE only when (a) the cooldown
(default 1h after success OR failure) is over AND (b) at least one new successful request happened
after the cooldown ended. Writes a static JSON snapshot for the dsh-balance-monitor card.
"""
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

CPA = os.environ.get("GQP_CPA_URL", "http://127.0.0.1:18317")
SECRETS = os.environ.get("GQP_SECRETS_FILE", "/root/cliproxyapi/.cpa-b1-secrets")
AUTH_DIR = os.environ.get("GQP_AUTH_DIR", "/root/cliproxyapi/auth")
CACHE_FILE = os.environ.get("GQP_CACHE_FILE", "/var/www/cpa-static/google-quota-cache.json")
STATE_FILE = os.environ.get("GQP_STATE_FILE", "/root/cliproxyapi/data/gemini-probe-state.json")

ENDPOINT = "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"
UA = os.environ.get("GQP_UA", "antigravity/2.29.0 windows/amd64")

COOLDOWN_SECONDS = int(os.environ.get("GQP_COOLDOWN_SECONDS", "3600"))        # 成功探测后的冷静期
# 失败后的退避，默认与成功冷静期一致，防止 timer 每 30s 重试打上游
FAIL_BACKOFF_SECONDS = int(os.environ.get("GQP_FAIL_BACKOFF_SECONDS", "3600"))


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def iso(ts):
    return ts.isoformat() if ts else None


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def atomic_write(path, obj, mode=None):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    if mode is not None:
        os.chmod(tmp, mode)
    os.replace(tmp, path)


def mgmt_key():
    key = os.environ.get("CPA_MGMT_KEY", "").strip()
    if key:
        return key
    try:
        with open(SECRETS, encoding="utf-8") as f:
            for line in f:
                if line.startswith("MGMT_KEY="):
                    return line.split("=", 1)[1].strip()
    except OSError:
        pass
    raise SystemExit("[gemini-quota] management key not found (set CPA_MGMT_KEY or GQP_SECRETS_FILE)")


def active_antigravity_auth():
    """CPA 本地管理接口（不出网）：取第一个未禁用的 antigravity 账号。"""
    req = urllib.request.Request(
        f"{CPA}/v0/management/auth-files",
        headers={"Authorization": f"Bearer {mgmt_key()}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        files = json.load(resp).get("files", [])
    active = [a for a in files if a.get("provider") == "antigravity" and not a.get("disabled")]
    return active[0] if active else None


def access_token(email):
    d = load_json(os.path.join(AUTH_DIR, f"antigravity-{email}.json")) or {}
    return d.get("access_token"), d.get("project_id")


def fetch_summary(token, project):
    body = {"project": project} if project else {}
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "*/*",
            "User-Agent": UA,
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def build_snapshot(summary, email, now):
    """只取 Gemini 组的 5h / weekly；缺任何一个都抛 ValueError。"""
    gemini = None
    for g in summary.get("groups", []):
        name = (g.get("displayName") or "").lower()
        ids = " ".join(b.get("bucketId", "") for b in g.get("buckets", [])).lower()
        if name.startswith("gemini") or "gemini-" in ids:
            gemini = g
            break
    if gemini is None:
        got = [g.get("displayName") for g in summary.get("groups", [])]
        raise ValueError(f"no Gemini group in response (groups={got}); UA gate? refusing to fabricate")

    by_window = {b.get("window"): b for b in gemini.get("buckets", [])}
    windows = []
    for level in ("5h", "weekly"):
        b = by_window.get(level)
        if b is None or b.get("remainingFraction") is None:
            raise ValueError(f"Gemini group missing window {level}: {list(by_window)}")
        remaining = round(float(b["remainingFraction"]) * 100.0, 1)
        remaining = max(0.0, min(100.0, remaining))
        windows.append({
            "level": level,
            "remaining": remaining,
            "utilization": round(100.0 - remaining, 1),
            "resetAt": b.get("resetTime"),
            "status": "allowed" if remaining > 0 else "exhausted",
        })

    return {
        "observed_at": iso(now),
        "source": "antigravity-retrieveUserQuotaSummary",
        "plan": "pro",
        "account": email,
        "channel": "google-ai-pro",
        "groups": [{"id": "gemini", "plan": "pro", "account": email, "windows": windows}],
    }


def main():
    force = "--force" in sys.argv
    dry = "--dry-run" in sys.argv
    now = utcnow()

    auth = active_antigravity_auth()
    if not auth:
        print("[gemini-quota] no enabled antigravity credential")
        return 0
    email = auth.get("email")
    curr_success = int(auth.get("success", 0))

    state = load_json(STATE_FILE) or {}
    last_attempt_s = state.get("last_attempt_at")
    last_attempt = dt.datetime.fromisoformat(last_attempt_s) if last_attempt_s else None
    last_ok = state.get("last_status") == "ok"
    last_success = int(state.get("last_success_count", -1))

    elapsed = (now - last_attempt).total_seconds() if last_attempt else float("inf")
    wait = COOLDOWN_SECONDS if last_ok else FAIL_BACKOFF_SECONDS

    def follow_baseline(reason_tag):
        """基线跟随当前计数并落盘（仅在变化时写）。dry-run 不写。"""
        if curr_success != last_success and last_attempt is not None and not dry:
            state["last_success_count"] = curr_success
            atomic_write(STATE_FILE, state)
            print(f"[gemini-quota] baseline {last_success} -> {curr_success} ({reason_tag})")

    if not force:
        # CPA 的 success 计数在内存里，容器重启会清零：计数回退 = 重置基线，且不当作新会话
        if last_attempt is not None and curr_success < last_success:
            follow_baseline("counter reset, CPA restarted?")
            print(f"[gemini-quota] counter went backwards ({last_success} -> {curr_success}); baseline reset, skip")
            return 0
        if elapsed < wait:
            # 冷静期/退避期内：基线持续跟随，期内发生的会话不算数（必须等期满后的新会话）
            follow_baseline("in cooldown, sessions during cooldown do not count")
            print(f"[gemini-quota] cooldown ({int(wait - elapsed)}s left, status={state.get('last_status')}); skip")
            return 0
        # 无论上次成败：冷静期结束后，必须再出现新的成功调用才探测
        if last_attempt is not None and curr_success <= last_success:
            print(f"[gemini-quota] idle (no new session since cooldown ended, success={curr_success}); skip")
            return 0

    reason = "force" if force else ("first_run" if last_attempt is None else
                                    f"new_calls(+{curr_success - last_success}"
                                    + (",after_fail)" if not last_ok else ")"))
    print(f"[gemini-quota] probing upstream: reason={reason} success={curr_success} account={email}")

    token, project = access_token(email)
    status, err, snapshot = "ok", None, None
    if not token:
        status, err = "fail", "no access_token in auth file"
    else:
        try:
            snapshot = build_snapshot(fetch_summary(token, project), email, now)
        except urllib.error.HTTPError as e:
            status, err = "fail", f"HTTP {e.code} {e.read()[:160]!r}"
        except Exception as e:  # 网络/解析/缺组
            status, err = "fail", f"{type(e).__name__}: {e}"

    if dry:
        print("DRY-RUN", status, err or "")
        if snapshot:
            print(json.dumps(snapshot, indent=2, ensure_ascii=False))
        return 0 if status == "ok" else 1

    # 无论成败都记录本次尝试时间 -> 失败也进入退避，不会每 30s 重试
    new_state = {
        "last_attempt_at": iso(now),
        "last_status": status,
        "last_error": err,
        "last_reason": reason,
        "email": email,
        # 成败都推进基线：失败后同样要等"新会话"才会在退避结束后重试
        "last_success_count": curr_success,
    }
    atomic_write(STATE_FILE, new_state)

    if status == "ok":
        atomic_write(CACHE_FILE, snapshot, mode=0o644)
        w = {x["level"]: x["remaining"] for x in snapshot["groups"][0]["windows"]}
        print(f"[gemini-quota] ok: 5h remaining={w['5h']}% weekly remaining={w['weekly']}%")
        return 0

    print(f"[gemini-quota] FAIL ({err}); backoff {FAIL_BACKOFF_SECONDS}s, cache kept (will show stale)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
