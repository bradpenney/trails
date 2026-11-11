#!/bin/sh
# Smoke-test a built image the way the cluster runs it: read-only root
# filesystem, uid 65532, no backend. Pages that need PocketBase return 500
# here, so this checks only what the image itself owns: it starts, it listens,
# it runs as the right user, and it SERVES the patched content (the branded
# About page and a stylesheet carrying the overrides).
#
# Usage: test/smoke.sh <image>      e.g. test/smoke.sh trails:local
set -eu

IMAGE="${1:?usage: smoke.sh <image>}"
PORT="${SMOKE_PORT:-39300}"
NAME="trails-smoke-$$"
BASE="http://127.0.0.1:$PORT"

fail() { echo "SMOKE FAIL: $*" >&2; docker logs "$NAME" >&2 2>&1 || true; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" --read-only --tmpfs /tmp \
  -e ORIGIN="$BASE" -e PUBLIC_POCKETBASE_URL=http://127.0.0.1:1 -e MEILI_URL=http://127.0.0.1:1 \
  "$IMAGE" >/dev/null

i=0
until curl -fsS -o /dev/null "$BASE/md/about.md" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -le 30 ] || fail "server did not answer within 30s"
  sleep 1
done

[ "$(docker exec "$NAME" id -u)" = 65532 ] || fail "not running as uid 65532"

curl -fsS "$BASE/md/about.md" | grep -q "personal trail log" \
  || fail "About page is upstream's, not ours"

css=$(docker exec "$NAME" sh -c 'find /app/build/client -name "*.css" | head -1')
[ -n "$css" ] || fail "no stylesheet in the image"
curl -fsS "$BASE/${css#/app/build/client/}" | grep -qF '/*brad-css*/' \
  || fail "served stylesheet lacks the overrides (stale .br/.gz served?)"

echo "smoke ok: $IMAGE starts read-only as 65532 and serves the branded content"
