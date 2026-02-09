#!/bin/bash

set -e
set -o pipefail

# URLs for the JSON files
CHAMPIONS_URL="https://app.njpw1972.com/title-holder/all.json"
ROSTER_URL="https://app.njpw1972.com/profile/list/all.json"
OUTPUT_FILE="$(cd "$(dirname "$0")" && pwd)/../../rosters/njpw-roster.json"

# Curl both files
echo "Fetching champions.json..."
champions=$(curl -fsSL "$CHAMPIONS_URL")

echo "Fetching roster-base.json..."
roster=$(curl -fsSL "$ROSTER_URL")

echo "Processing data with jq..."

# Process with jq
jq -s \
  '{
    champions: .[0] | map({
        name: .title_holder.profiles[0].name | gsub("^\\s+|\\s+$"; ""),
        title: ((.classtitle_red + " " + .classtitle_black) | gsub("^\\s+|\\s+$"; "")),
        generation: (("The " + .title_holder.generation + " Champion") | gsub("^\\s+|\\s+$"; "")),
    }) | sort_by(.title),
    roster: .[1] | map({
        name: (.name | gsub("^\\s+|\\s+$"; ""))
    }) | sort_by(.name)
  }' <(echo "$champions") <(echo "$roster") > "$OUTPUT_FILE"

echo "Output written to $OUTPUT_FILE"
