#!/bin/bash
# cap.sh <outfile> <capjson> [w] [h]
OUT="$1"; CAP="$2"; W="${3:-1000}"; H="${4:-720}"
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$CAP")
timeout 120 "$CHROME" --headless=new --no-sandbox --disable-gpu-sandbox \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=$W,$H --virtual-time-budget=25000 \
  --screenshot="$OUT" "http://127.0.0.1:8731/designer.html?cap=$ENC" >/dev/null 2>&1
[ -f "$OUT" ] && echo "captured $(basename $OUT) $(du -h "$OUT"|cut -f1)" || echo "FAILED $OUT"
