"""
process_audio.py — FFmpeg audio chunker for the Sandbox container.

This script is executed inside the Cloudflare Sandbox by the TranscriptionAgent.
Its ONLY job is to split a large audio file into ~30-second WAV chunks using FFmpeg.
It performs ZERO network calls or API requests.

Usage:
    python3 process_audio.py <input_path> <output_dir>

Arguments:
    input_path  — Path to the mounted R2 audio file (e.g., /mnt/r2/interviews/audio-{id}.m4a)
    output_dir  — Path to write chunks (e.g., /mnt/r2/chunks/{recordingId}/)

Stdout markers parsed by TranscriptionAgent:
    CHUNK_COUNT:{n}          — Total number of chunks created
    CHUNK_FILE:{filename}    — Each chunk filename in order
    DONE                     — FFmpeg complete, Sandbox can be destroyed
    ERROR:{message}          — On failure
"""

import os
import subprocess
import sys


def main():
    if len(sys.argv) < 2:
        print("ERROR:Usage: python3 process_audio.py <ping|input_path> [output_dir]")
        sys.exit(1)

    if sys.argv[1] == "ping":
        print("PONG")
        sys.exit(0)

    if len(sys.argv) < 3:
        print("ERROR:Usage: python3 process_audio.py <input_path> <output_dir>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]

    # Validate input file exists
    if not os.path.isfile(input_path):
        print(f"ERROR:Input file not found: {input_path}")
        sys.exit(1)

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Run FFmpeg: split into 30-second WAV chunks (16kHz mono, 16-bit PCM)
    # This produces chunks of ~960KB each — well under any API limit
    output_pattern = os.path.join(output_dir, "chunk_%03d.wav")

    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-f", "segment",
        "-segment_time", "30",
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        "-y",  # Overwrite output files without asking
        output_pattern,
    ]

    print(f"Running: {' '.join(cmd)}")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"ERROR:FFmpeg failed (exit {result.returncode}): {result.stderr[:500]}")
        sys.exit(1)

    # List and sort output chunk files
    chunk_files = sorted(
        f for f in os.listdir(output_dir)
        if f.startswith("chunk_") and f.endswith(".wav")
    )

    if not chunk_files:
        print("ERROR:FFmpeg produced no output chunks")
        sys.exit(1)

    # Emit structured markers for the Agent to parse
    print(f"CHUNK_COUNT:{len(chunk_files)}")

    for filename in chunk_files:
        print(f"CHUNK_FILE:{filename}")

    print("DONE")


if __name__ == "__main__":
    main()
