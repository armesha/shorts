#!/usr/bin/env python3
"""Read video notes from the explicitly selected public channel using an existing session."""

import argparse
import asyncio
import json
import os
from pathlib import Path

from telethon import TelegramClient


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", required=True)
    parser.add_argument("--api-id-file", required=True)
    parser.add_argument("--api-hash-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--before", type=int, default=0)
    parser.add_argument("--limit", type=int, default=50, choices=range(1, 101))
    parser.add_argument("--exclude-file", required=True)
    args = parser.parse_args()
    excluded = {int(value) for value in json.loads(Path(args.exclude_file).read_text(encoding="utf-8"))}
    session = Path(args.session).resolve()
    if session.suffix != ".session" or not session.is_file():
        raise RuntimeError("Existing Telegram session is required")
    api_id = int(Path(args.api_id_file).read_text(encoding="utf-8").strip())
    api_hash = Path(args.api_hash_file).read_text(encoding="utf-8").strip()
    output = Path(args.output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    client = TelegramClient(str(session), api_id, api_hash)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session is not authorized")
        channel = await client.get_entity("kruglyashiki")
        results = []
        last_id = 0
        async for message in client.iter_messages(channel, limit=args.limit, offset_id=args.before):
            last_id = message.id
            if not message.video_note or message.id in excluded:
                continue
            destination = output / f"{message.id}.mp4"
            if destination.exists():
                results.append({"id": message.id, "date": message.date.isoformat(), "file": str(destination)})
                break
            temporary = output / f"{message.id}.part"
            try:
                downloaded = await client.download_media(message, file=str(temporary))
                if not downloaded or not temporary.is_file() or not temporary.stat().st_size:
                    raise RuntimeError("Telegram download failed")
                os.chmod(temporary, 0o600)
                temporary.replace(destination)
            finally:
                temporary.unlink(missing_ok=True)
            results.append({"id": message.id, "date": message.date.isoformat(), "file": str(destination)})
            break
        print(json.dumps({"items": results, "nextBefore": last_id}, ensure_ascii=False))
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
