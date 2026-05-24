FROM docker.io/cloudflare/sandbox:0.10.2

# Install FFmpeg for audio segmentation + Python3 (minimal) for the chunker script
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 && rm -rf /var/lib/apt/lists/*

# Copy the audio chunker script
COPY scripts/container_src/process_audio.py /workspace/process_audio.py
COPY scripts/container_src/salary_analysis.py /workspace/salary_analysis.py

EXPOSE 8080
