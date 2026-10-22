#!/bin/sh
# Keep old builds' assets around so open tabs on an older version still load
set -eu

build_dir=/usr/share/nginx/html/assets
kept_root=/var/lib/btsearch
kept_dir="$kept_root/assets"
live_list="$kept_root/live-assets.txt"
keep_days="${BTSEARCH_ASSETS_KEEP_DAYS:-7}"

[ -d "$kept_root" ] || exit 0
mkdir -p "$kept_dir"

new_list=$(mktemp)
(cd "$build_dir" && find . -type f) | sort > "$new_list"

# Start the clock on files that just left the live build
if [ -f "$live_list" ]; then
  grep -vxFf "$new_list" "$live_list" | while IFS= read -r file; do
    if [ -f "$kept_dir/$file" ]; then touch "$kept_dir/$file"; fi
  done
fi

cp -R "$build_dir/." "$kept_dir/"
mv "$new_list" "$live_list"

find "$kept_dir" -type f -mtime +"$keep_days" -delete
find "$kept_dir" -mindepth 1 -type d -empty -delete
