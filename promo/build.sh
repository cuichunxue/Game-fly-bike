#!/usr/bin/env bash
# Sky Pedal promo — soundtrack + encode, after promo/capture.js has written <work>/frames and events-*.json
# usage: promo/build.sh <work-dir> [out.mp4]
set -euo pipefail
W="$1"; OUT="${2:-$W/sky-pedal-promo-30s.mp4}"; DIR="$(cd "$(dirname "$0")" && pwd)"
# merge the event logs of split renders (one 'cut' per shot)
node -e '
  const fs = require("fs"), w = process.argv[1];
  const all = fs.readdirSync(w).filter(f => /^events-\d+\.json$/.test(f)).flatMap(f => JSON.parse(fs.readFileSync(w + "/" + f)));
  const seen = new Set(), ev = all.sort((a, b) => a.t - b.t).filter(e => { const k = e.name + "@" + e.t; if (seen.has(k)) return false; seen.add(k); return true; });
  fs.writeFileSync(w + "/events.json", JSON.stringify(ev, null, 1)); console.log(ev.length, "events");' "$W"
node "$DIR/soundtrack.js" "$W/events.json" "$W/soundtrack.wav"
ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "$W/frames/%04d.jpg" -i "$W/soundtrack.wav" \
  -filter_complex "[1:a]highpass=f=32,equalizer=f=90:t=q:w=1:g=-3,loudnorm=I=-14:TP=-1.5:LRA=9,afade=t=in:d=0.15,afade=t=out:st=29.3:d=0.7[a]" \
  -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 20 -maxrate 10M -bufsize 20M -pix_fmt yuv420p -profile:v high -level 4.2 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t 30 "$OUT"
# a cover image for posting (the moon shot)
ffmpeg -hide_banner -loglevel error -y -i "$W/frames/0800.jpg" -q:v 2 "${OUT%.mp4}-cover.jpg"
echo "wrote $OUT"
