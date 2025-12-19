#!/bin/sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bun build "$SCRIPT_DIR/wwe.ts" > "$SCRIPT_DIR/wwe.js"

shot-scraper javascript -i "$SCRIPT_DIR/wwe.js" https://www.wwe.com/superstars --raw | jq -f "$SCRIPT_DIR/order.jq" > "$SCRIPT_DIR/../../rosters/wwe-roster.json"