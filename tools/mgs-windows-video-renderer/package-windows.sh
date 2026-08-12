#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_dir="$root_dir/tools/mgs-windows-video-renderer"
scratch_dir="$root_dir/tmp/mgs-renderer-build"
archive="$scratch_dir/ffmpeg-release-essentials.7z"
checksum_file="$scratch_dir/ffmpeg-release-essentials.7z.sha256"
stage_dir="$scratch_dir/MGS-Shorts-Renderer-Windows"
output_zip="$source_dir/MGS-Shorts-Renderer-Windows.zip"

mkdir -p "$scratch_dir"
if [[ ! -f "$archive" ]]; then
  curl -fL --retry 3 -o "$archive" https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.7z
fi
if [[ ! -f "$checksum_file" ]]; then
  curl -fL --retry 3 -o "$checksum_file" https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.7z.sha256
fi

expected="$(tr -d '[:space:]' < "$checksum_file")"
actual="$(sha256sum "$archive" | awk '{print $1}')"
if [[ "$expected" != "$actual" ]]; then
  echo "FFmpeg checksum mismatch" >&2
  exit 1
fi

rm -rf "$stage_dir"
mkdir -p "$stage_dir/ffmpeg" "$stage_dir/КАРТИНКИ" "$stage_dir/ГОТОВЫЕ ВИДЕО"
cp "$source_dir/START-MGS-RENDERER.bat" "$stage_dir/"
cp "$source_dir/1 - ЗАПУСТИТЬ ПРОГРАММУ.bat" "$stage_dir/"
printf '\357\273\277' > "$stage_dir/MgsVideoRenderer.ps1"
cat "$source_dir/MgsVideoRenderer.ps1" >> "$stage_dir/MgsVideoRenderer.ps1"
cp "$source_dir/README-RU.txt" "$stage_dir/"
cp "$source_dir/THIRD-PARTY-NOTICES.txt" "$stage_dir/"

ffmpeg_root="$(7z l -ba "$archive" | awk '$NF ~ /-essentials_build\/bin\/ffmpeg\.exe$/ { sub(/\/bin\/ffmpeg\.exe$/, "", $NF); print $NF; exit }')"
if [[ -z "$ffmpeg_root" ]]; then
  echo "ffmpeg.exe not found in upstream archive" >&2
  exit 1
fi

7z e -y -o"$stage_dir/ffmpeg" "$archive" \
  "$ffmpeg_root/bin/ffmpeg.exe" \
  "$ffmpeg_root/LICENSE" \
  "$ffmpeg_root/README.txt" >/dev/null

rm -f "$output_zip"
(cd "$scratch_dir" && 7z a -tzip -mx=9 "$output_zip" "$(basename "$stage_dir")" >/dev/null)
(cd "$source_dir" && sha256sum "$(basename "$output_zip")" > "$(basename "$output_zip").sha256")
echo "$output_zip"
