#!/usr/bin/env bash
# scripts/bendle-prep.sh — offline stem prep for Bendle. Not called by the
# app; run this locally, then upload the 4 output files through the Bendle
# Songs admin panel (BendleAdmin.jsx). See
# docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
#
# One-time setup:
#   pip install demucs yt-dlp
#
# Usage:
#   scripts/bendle-prep.sh "<youtube-url>" "<output-name>"
# Produces (in ./bendle-stems/<output-name>/):
#   drums.wav  bass.wav  other.wav  vocals.wav

set -euo pipefail

URL="${1:?Usage: bendle-prep.sh <youtube-url> <output-name>}"
NAME="${2:?Usage: bendle-prep.sh <youtube-url> <output-name>}"
OUT_DIR="./bendle-stems/${NAME}"

mkdir -p "${OUT_DIR}"
echo "Downloading audio from ${URL}..."
yt-dlp "${URL}" -x --audio-format wav -o "${OUT_DIR}/source.wav"

echo "Separating stems with Demucs..."
demucs -o "${OUT_DIR}/_demucs_tmp" "${OUT_DIR}/source.wav"

MODEL_DIR=$(find "${OUT_DIR}/_demucs_tmp" -mindepth 2 -maxdepth 2 -type d | head -1)
mv "${MODEL_DIR}/drums.wav" "${OUT_DIR}/drums.wav"
mv "${MODEL_DIR}/bass.wav" "${OUT_DIR}/bass.wav"
mv "${MODEL_DIR}/other.wav" "${OUT_DIR}/other.wav"
mv "${MODEL_DIR}/vocals.wav" "${OUT_DIR}/vocals.wav"
rm -rf "${OUT_DIR}/_demucs_tmp" "${OUT_DIR}/source.wav"

echo "Done — 4 stems in ${OUT_DIR}/"
echo "Upload them through the Bendle Songs admin panel in Trivia OS."
