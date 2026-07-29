#!/bin/sh
set -eu

response_file="${TMPDIR:-/tmp}/trakr-callable-response.json"
status="$(
  curl -sS \
    -o "$response_file" \
    -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d '{"data":{}}' \
    'http://127.0.0.1:5001/trakr-test/asia-southeast1/initializeUser'
)"

test "$status" = "401"
grep -Fq '"status":"UNAUTHENTICATED"' "$response_file"
