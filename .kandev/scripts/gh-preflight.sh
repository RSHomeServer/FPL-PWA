#!/usr/bin/env bash
# KanDev GitHub CLI lease preflight — PASS/FAIL only; never prints secrets.
# Usage: bash .kandev/scripts/gh-preflight.sh
# Exit 0 = PASS (safe to draft PR body / run gh pr create). Exit 1 = FAIL (stop).

set -u

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

shim_dir="${KANDEV_GITHUB_CLI_SHIM_DIR:-}"
if [[ -z "$shim_dir" ]]; then
  fail "KANDEV_GITHUB_CLI_SHIM_DIR is unset (lease shim not injected for this session)"
fi
if [[ ! -x "$shim_dir/gh" && ! -L "$shim_dir/gh" ]]; then
  fail "shim gh missing at \$KANDEV_GITHUB_CLI_SHIM_DIR/gh ($shim_dir)"
fi
pass "shim dir present ($shim_dir)"

required_vars=(
  KANDEV_GITHUB_CREDENTIAL_BROKER_URL
  KANDEV_GITHUB_CREDENTIAL_LEASE
  KANDEV_GITHUB_CREDENTIAL_HOST
  KANDEV_GITHUB_CREDENTIAL_OWNER
  KANDEV_GITHUB_CREDENTIAL_REPO
  KANDEV_GITHUB_CREDENTIAL_SESSION_ID
  KANDEV_GITHUB_CREDENTIAL_TASK_ID
)
missing=()
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if ((${#missing[@]} > 0)); then
  fail "lease env unset: ${missing[*]} (do not invent values; escalate)"
fi
pass "lease env names present (values not printed)"

# Real CLI must exist somewhere for the shim to wrap — after the shim dir.
export PATH="$shim_dir:$PATH"
resolved="$(command -v gh || true)"
if [[ -z "$resolved" ]]; then
  fail "gh not on PATH even after prepending shim dir"
fi
if [[ "$resolved" != "$shim_dir/gh" ]]; then
  fail "gh resolves to $resolved — expected $shim_dir/gh (PATH order wrong; prepend shim)"
fi
pass "gh resolves to lease shim"

# Auth check without dumping tokens (avoid `gh auth status`, which prints PAT prefixes).
api_out="$(gh api user -q .login 2>&1)" || {
  fail "lease broker / gh api failed: ${api_out//$'\n'/ | }"
}
if [[ -z "$api_out" ]]; then
  fail "gh api user returned empty login"
fi
pass "authenticated as ${api_out}"
pass "ready for gh pr create (draft PR body only after this)"
exit 0
