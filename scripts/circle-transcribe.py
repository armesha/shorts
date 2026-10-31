#!/usr/bin/env python3
"""Transcribe a circle's extracted audio using a local multilingual Whisper model."""

import argparse
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="small")
    args = parser.parse_args()
    model_dir = Path(__file__).resolve().parents[1] / "data/output/circle-pipeline/models"
    model_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    staged = model_dir / "small-ready"
    model_name = str(staged) if args.model == "small" and (staged / "model.bin").is_file() else args.model
    model = WhisperModel(model_name, device="cpu", compute_type="int8", download_root=str(model_dir))
    segments, info = model.transcribe(args.audio, beam_size=5, vad_filter=False)
    result = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            result.append({"start": segment.start, "end": segment.end, "text": text,
                           "averageLogProbability": segment.avg_logprob,
                           "noSpeechProbability": segment.no_speech_prob})
    print(json.dumps({"language": info.language, "languageProbability": info.language_probability,
                      "segments": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
