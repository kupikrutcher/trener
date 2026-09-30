#!/bin/bash
# Вебинар → HLS (несколько качеств) → хранилище Яндекса → ссылка для поля «Видео» в уроке.
#   ./tools/webinar.sh "запись.mov" ["ещё.mp4" …]
# Нужны ffmpeg (brew install ffmpeg) и yc, вошедший в облако Маши.
set -euo pipefail
command -v ffmpeg >/dev/null || { echo "Нет ffmpeg: brew install ffmpeg"; exit 1; }
BUCKET=$(yc storage bucket list | grep -o 'trener-files-[a-z0-9]*' | head -1)
[ -n "$BUCKET" ] || { echo "Не нашёл бакет trener-files-… — yc вошёл в нужное облако?"; exit 1; }
# на Mac кодирует видеокарта (78 минут ≈ 8 минут), иначе — процессор
ffmpeg -hide_banner -encoders 2>/dev/null | grep -q h264_videotoolbox && ENC=(-c:v h264_videotoolbox -profile:v high) || ENC=(-c:v libx264 -preset veryfast)

for IN in "$@"; do
  H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$IN")
  # качества: высота:битрейт; 1080 — только если запись в 1080 (растягивать 720 бессмысленно)
  Q=("720:1500k" "360:450k"); [ "$H" -ge 1000 ] && Q=("1080:3500k" "${Q[@]}")
  N=${#Q[@]}; SPLIT="[0:v]split=$N"; MAPS=(); RATES=(); VMAP=""
  for i in "${!Q[@]}"; do
    h=${Q[$i]%%:*}; b=${Q[$i]##*:}; SPLIT+="[s$i]"
    MAPS+=(-map "[v$i]" -map 0:a:0); RATES+=(-b:v:$i "$b" -maxrate:v:$i "$b")
    VMAP+="v:$i,a:$i,name:$h "
  done
  F="$SPLIT"; for i in "${!Q[@]}"; do F+=";[s$i]scale=-2:${Q[$i]%%:*}[v$i]"; done
  OUT=$(mktemp -d); ID=$(openssl rand -hex 8)
  echo "→ $IN: режу в $(printf "%sp " "${Q[@]%%:*}")…"
  ffmpeg -v error -stats -y -i "$IN" -filter_complex "$F" "${MAPS[@]}" "${ENC[@]}" "${RATES[@]}" \
    -force_key_frames "expr:gte(t,n_forced*6)" -c:a aac -b:a 96k -ac 2 \
    -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename "$OUT/%v/s%04d.ts" \
    -master_pl_name index.m3u8 -var_stream_map "${VMAP% }" "$OUT/%v/p.m3u8"
  echo "→ загружаю ($(du -sh "$OUT" | cut -f1))…"
  # публичное чтение по случайному адресу: сотни кусочков нельзя подписывать по одному
  D="s3://$BUCKET/webinars/$ID"
  yc storage s3 cp --recursive --acl public-read --only-show-errors --exclude "*.m3u8" --content-type video/mp2t "$OUT/" "$D/"
  yc storage s3 cp --recursive --acl public-read --only-show-errors --exclude "*" --include "*.m3u8" --content-type application/vnd.apple.mpegurl "$OUT/" "$D/"
  rm -rf "$OUT"
  echo "✓ $IN"
  echo "  Ссылка для урока: https://storage.yandexcloud.net/$BUCKET/webinars/$ID/index.m3u8"
done
