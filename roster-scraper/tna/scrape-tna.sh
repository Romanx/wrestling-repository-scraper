#!/bin/bash
set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bun build "$SCRIPT_DIR/tna.ts" > "$SCRIPT_DIR/tna.js"

shot-scraper javascript -i "$SCRIPT_DIR/tna.js" https://tnawrestling.com/roster/ --raw | jq -f "$SCRIPT_DIR/order.jq" > "$SCRIPT_DIR/../../rosters/tna-roster.json"