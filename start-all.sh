#!/usr/bin/env bash

set -Eeuo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
declare -a service_pids=()
stopping=false

start_service() {
  local name="$1"
  local directory="$2"
  local script="$3"

  echo "Starting ${name}..."
  setsid bash -c 'cd -- "$1" && exec yarn "$2"' _ "${directory}" "${script}" &
  service_pids+=("$!")
}

cleanup() {
  local exit_code=$?

  if [[ "${stopping}" == "true" ]]; then
    return
  fi
  stopping=true
  trap - EXIT INT TERM

  echo
  echo "Stopping local Excalidraw services..."
  for pid in "${service_pids[@]}"; do
    # Each service is started in its own process group by setsid.
    kill -TERM -- "-${pid}" 2>/dev/null || true
  done
  for pid in "${service_pids[@]}"; do
    wait "${pid}" 2>/dev/null || true
  done

  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

start_service \
  "collaboration room server (http://localhost:3002)" \
  "${project_root}/excalidraw-room-server" \
  "start:dev"

start_service \
  "media and LiveKit server (http://localhost:3003)" \
  "${project_root}/excalidraw-media-stream-server" \
  "start:dev"

start_service \
  "frontend (http://localhost:3001)" \
  "${project_root}" \
  "start"

echo
echo "All services are starting. Press Ctrl+C to stop them together."
echo

# Exit if any service stops; the EXIT trap then cleans up the others.
wait -n "${service_pids[@]}"
