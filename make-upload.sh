#!/bin/sh
# Collects only the files the website needs into ./_upload, ready to drag
# into GitHub (Add file → Upload files). Run again after any change.
#
# Leaves out on purpose:
#   slider-photos/  full-size originals (+ an unrelated billing screenshot)
#   reference/      design mood-board screenshots
#   connection-test.html, config.example.js, make-upload.sh, .DS_Store

set -e
cd "$(dirname "$0")"

OUT="_upload"
rm -rf "$OUT"
mkdir -p "$OUT/data" "$OUT/photos" "$OUT/icons"

cp index.html styles.css app.js sheets.js config.js manifest.webmanifest README.md "$OUT/"
cp data/weekly.csv "$OUT/data/"
cp photos/*.jpg "$OUT/photos/"
cp icons/*.png "$OUT/icons/"

echo "Ready: $(pwd)/$OUT"
find "$OUT" -type f | sort | sed 's/^/  /'
