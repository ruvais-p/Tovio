#!/usr/bin/env bash

set -euo pipefail

container_name="excalidraw-livekit-dev"
docker_args=()

if ! docker info >/dev/null 2>&1; then
  if docker --context default info >/dev/null 2>&1; then
    docker_args=(--context default)
  else
    echo "Docker is required for the local LiveKit server, but no daemon is available." >&2
    exit 1
  fi
fi

docker_command=(docker "${docker_args[@]}")
started_livekit=false

if "${docker_command[@]}" container inspect "${container_name}" >/dev/null 2>&1; then
  if [[ "$("${docker_command[@]}" inspect --format '{{.State.Running}}' "${container_name}")" != "true" ]]; then
    "${docker_command[@]}" start "${container_name}" >/dev/null
    started_livekit=true
  fi
else
  "${docker_command[@]}" run --detach --rm \
    --name "${container_name}" \
    --network host \
    livekit/livekit-server:v1.13.1 \
    --dev \
    --bind 0.0.0.0 \
    --keys 'excalidraw-media: local-livekit-api-secret-not-for-production' \
    --udp-port 50000-50100 >/dev/null
  started_livekit=true
fi

cleanup() {
  if [[ "${started_livekit}" == "true" ]]; then
    "${docker_command[@]}" stop --time 2 "${container_name}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

./node_modules/.bin/tsx watch --env-file=.env.development src/index.ts
