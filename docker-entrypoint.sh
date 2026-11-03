#!/bin/sh
set -eu

# Named volumes can be created before the image's ownership layer, especially
# when restoring an older deployment. Repair only the storage mount, then drop
# privileges so the application never runs as root.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/storage
  chown -R node:node /app/storage
  exec gosu node "$@"
fi

exec "$@"
