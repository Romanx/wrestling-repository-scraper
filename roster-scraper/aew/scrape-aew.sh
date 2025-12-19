#!/bin/sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bun build "$SCRIPT_DIR/aew.ts" > "$SCRIPT_DIR/aew.js"

shot-scraper javascript -i "$SCRIPT_DIR/aew.js" https://www.allelitewrestling.com/aew-roster --raw | jq -f "$SCRIPT_DIR/order.jq" > "$SCRIPT_DIR/../../rosters/aew-roster.json"