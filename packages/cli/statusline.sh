#!/bin/bash

# Read the JSON from stdin
json=$(cat)

# Extract values using jq
model=$(echo "${json}" | jq -r '.model.display_name')
branch=$(echo "${json}" | jq -r '.git.branch // "none"')
context_left=$(echo "${json}" | jq -r '.usage.context_left_percent // 100')
total_in=$(echo "${json}" | jq -r '.usage.total_input_tokens // 0')
total_out=$(echo "${json}" | jq -r '.usage.total_output_tokens // 0')
total=$(echo "${json}" | jq -r '.usage.total_tokens // 0')
tps=$(echo "${json}" | jq -r '.usage.output_tokens_per_second // 0')

# Define some ANSI colors
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
MAGENTA='\033[35m'
RESET='\033[0m'

# Output the formatted status line (Multiline)
echo -e "${CYAN}🤖 ${model}${RESET} | ${GREEN}🌿 ${branch}${RESET} | ${MAGENTA}📊 Context Left: ${context_left}%${RESET}"
echo -e "${YELLOW}🪙 Tokens: ${total} (In: ${total_in} / Out: ${total_out}) | ⚡ Speed: ${tps} tok/s${RESET}"