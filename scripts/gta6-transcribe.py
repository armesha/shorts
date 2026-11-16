#!/usr/bin/env python3
"""Timed local transcript for the GTA 6 highlight cutter. Offline faster-whisper only."""

import argparse
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("media")
    parser.add_argument("--model", default="small")
    args = parser.parse_args()
    model_dir = Path(__file__).resolve().parents[1] / "data/output/circle-pipeline/models"
    model_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    staged = model_dir / "small-ready"
    model_name = str(staged) if args.model == "small" and (staged / "model.bin").is_file() else args.model
    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        cpu_threads=1,
        num_workers=1,
        download_root=str(model_dir),
    )
    segments, info = model.transcribe(
        args.media,
        beam_size=5,
        temperature=0.0,
        vad_filter=False,
        condition_on_previous_text=False,
        without_timestamps=False,
    )
    result = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            result.append({"start": float(segment.start), "end": float(segment.end), "text": text})
    print(json.dumps({
        "language": info.language,
        "languageProbability": info.language_probability,
        "segments": result,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
