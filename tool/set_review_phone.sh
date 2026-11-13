#!/usr/bin/env bash
# Adds the App Review / Play review test phone to Safi's Supabase project (Auth -> Test Phone
# Numbers). No SMS is sent for it; the fixed code always works until VALID_UNTIL.
# Uses the Supabase CLI login from the macOS Keychain (run `supabase login` first). Keeps any
# test numbers already configured. Prints no secrets.
set -euo pipefail

REF="${SAFI_SUPABASE_REF:-lfmhkxsjyvqlswmnppad}"
PHONE="${REVIEW_PHONE:-353870000101}"   # +353 87 000 0101, digits only
CODE="${REVIEW_CODE:?Set REVIEW_CODE to the fixed 6-digit code}"
VALID_UNTIL="${REVIEW_VALID_UNTIL:-2026-12-31T23:59:59Z}"

RAW=$(security find-generic-password -s "Supabase CLI" -a supabase -w 2>/dev/null || true)
case "$RAW" in go-keyring-base64:*) TOKEN=$(printf %s "${RAW#go-keyring-base64:}" | base64 -d);; *) TOKEN=$RAW;; esac
unset RAW
[ -n "$TOKEN" ] || { echo "Supabase CLI login not found (run: supabase login)"; exit 1; }

API="https://api.supabase.com/v1/projects/$REF/config/auth"
CURRENT=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API")

BODY=$(CURRENT="$CURRENT" PHONE="$PHONE" CODE="$CODE" VALID_UNTIL="$VALID_UNTIL" python3 - <<'PY'
import json, os
cfg = json.loads(os.environ["CURRENT"])
if not cfg.get("external_phone_enabled"):
    raise SystemExit("Phone sign-in is off in this project; turn it on first.")
pairs = {}
for item in filter(None, (cfg.get("sms_test_otp") or "").split(",")):
    k, _, v = item.partition("=")
    pairs[k.strip()] = v.strip()
pairs[os.environ["PHONE"]] = os.environ["CODE"]
print(json.dumps({
    "sms_test_otp": ",".join(f"{k}={v}" for k, v in pairs.items()),
    "sms_test_otp_valid_until": os.environ["VALID_UNTIL"],
}))
PY
)

code=$(printf '%s' "$BODY" | curl -s -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- "$API")
unset BODY TOKEN CURRENT
[ "$code" = 200 ] || { echo "Supabase returned HTTP $code; nothing confirmed."; exit 1; }
echo "Review phone +$PHONE added (code valid until $VALID_UNTIL)."
