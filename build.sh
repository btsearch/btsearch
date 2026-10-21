#!/bin/bash
set -eo pipefail

export COMMIT_SHA=$(git log -1 --format="%h")
ASSETS_DIR="${OPENBTS_ASSETS_DIR:-/var/www/openbts/assets}"
ASSETS_KEEP_DAYS=7

keep_client_assets() {
  local container
  container=$(docker create "btsearch-client:$COMMIT_SHA")
  docker cp "$container:/usr/share/nginx/html/assets" - | tar -x -m -C "$ASSETS_DIR" --strip-components=1
  docker rm "$container" > /dev/null
  find "$ASSETS_DIR" -mindepth 1 -type f -mtime +$ASSETS_KEEP_DAYS -delete
  find "$ASSETS_DIR" -mindepth 1 -type d -empty -delete
}

if [[ "$1" == "swarm" ]]; then
  COMMIT_SHA=$COMMIT_SHA docker compose build client server discord-bot
  keep_client_assets
  set -a && source .env && set +a
  docker stack deploy -c docker-compose.swarm.yml btsearch
elif [[ "$1" == "deploy" ]]; then
  export COMMIT_SHA=$(docker service inspect btsearch_server --format '{{index (split .Spec.TaskTemplate.ContainerSpec.Image ":") 1}}')
  set -a && source .env && set +a
  docker stack deploy -c docker-compose.swarm.yml btsearch
elif [[ "$1" == "server" ]]; then
  COMMIT_SHA=$COMMIT_SHA docker compose build server
  docker compose up -d --no-deps server og-renderer importer
elif [[ "$1" == "client" ]]; then
  COMMIT_SHA=$COMMIT_SHA docker compose build client
  docker compose up -d --no-deps client
else
  COMMIT_SHA=$COMMIT_SHA docker compose build "$@"
fi
