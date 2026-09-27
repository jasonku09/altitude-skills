#!/usr/bin/env bash
# This outer process must succeed even when Node is missing. A nonzero command
# hook can fail closed in Copilot before JavaScript gets a chance to recover.
if [ -n "$PLUGIN_ROOT" ] && command -v node >/dev/null 2>&1; then
  if altitude_hook_output=$(node "$PLUGIN_ROOT/bin/altitude-copilot-hook.mjs" auto "$1"); then
    printf '%s\n' "$altitude_hook_output"
    exit 0
  fi
fi
printf '%s\n' 'Altitude Copilot hook bootstrap unavailable; check the plugin and Node installation.' >&2
printf '%s\n' '{}'
exit 0
