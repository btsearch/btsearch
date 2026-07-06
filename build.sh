#!/bin/bash
set -e

export COMMIT_SHA=$(git log -1 --format="%h")

if [[ "$1" == "swarm" ]]; then
  COMMIT_SHA=$COMMIT_SHA docker compose build client server discord-bot
  docker build -t btsearch-postgres -f docker/postgres/Dockerfile .
  set -a && source .env && set +a
  docker stack deploy -c docker-compose.swarm.yml btsearch
elif [[ "$1" == "deploy" ]]; then
  export COMMIT_SHA=$(docker service inspect btsearch_server --format '{{index (split .Spec.TaskTemplate.ContainerSpec.Image ":") 1}}')
  set -a && source .env && set +a
  docker stack deploy -c docker-compose.swarm.yml btsearch
elif [[ "$1" == "client" || "$1" == "server" ]]; then
  SERVICE=$1
  COMMIT_SHA=$COMMIT_SHA docker compose build "$SERVICE"
  docker compose up -d --no-deps "$SERVICE"
else
  COMMIT_SHA=$COMMIT_SHA docker compose build "$@"
fi
