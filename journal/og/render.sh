#!/bin/sh
# Re-render journal/og.png from journal/og/source.html (needs Google Chrome; macOS path).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --user-data-dir="$tmp" --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=5000 --window-size=1200,630 \
  --screenshot="$here/../og.png" "file://$here/source.html" >/dev/null 2>&1
rm -rf "$tmp"
sips -g pixelWidth -g pixelHeight "$here/../og.png"
