/**
 * @fileoverview Custom DictationAdapter for Cloudflare Whisper STT.
 *
 * Bridges assistant-ui's real-time DictationAdapter interface with
 * Cloudflare's batch Whisper model. Records audio via MediaRecorder,
 * uploads to /api/transcribe, and injects the transcript into the
 * composer via onSpeech({ transcript, isFinal: true }).
 *
 * UI is managed by ComposerPrimitive.Dictate and StopDictation —
 * no custom buttons needed.
 */

import type { DictationAdapter } from "@assistant-ui/react";

import { toast } from "../api-client";

export class CloudflareWhisperAdapter implements DictationAdapter {
  /** Disable typing while recording to prevent state conflicts */
  public disableInputDuringDictation = true;

  private endpoint: string;

  constructor(options: { endpoint: string }) {
    this.endpoint = options.endpoint;
  }

  listen(): DictationAdapter.Session {
    const callbacks = {
      start: new Set<() => void>(),
      end: new Set<(r: DictationAdapter.Result) => void>(),
      speech: new Set<(r: DictationAdapter.Result) => void>(),
    };

    let mediaRecorder: MediaRecorder | null = null;
    let chunks: BlobPart[] = [];
    let streamReference: MediaStream | null = null;

    const session: DictationAdapter.Session = {
      status: { type: "starting" },

      stop: async () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          // Triggers the onstop event where the upload happens
          mediaRecorder.stop();
        }
      },

      cancel: () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
        if (streamReference) {
          streamReference.getTracks().forEach((track) => track.stop());
        }
        (session as { status: DictationAdapter.Status }).status = {
          type: "ended",
          reason: "cancelled",
        };
      },

      onSpeechStart: (cb) => {
        callbacks.start.add(cb);
        return () => callbacks.start.delete(cb);
      },

      onSpeechEnd: (cb) => {
        callbacks.end.add(cb);
        return () => callbacks.end.delete(cb);
      },

      onSpeech: (cb) => {
        callbacks.speech.add(cb);
        return () => callbacks.speech.delete(cb);
      },
    };

    // Initialize the microphone and MediaRecorder
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamReference = stream;
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // Default to webm — native MediaRecorder format in most browsers
          const blob = new Blob(chunks, { type: "audio/webm" });
          const formData = new FormData();
          formData.append("audio", blob);

          let transcript = "";

          try {
            const response = await fetch(this.endpoint, {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`Transcription failed: ${response.statusText}`);
            }

            const data = (await response.json()) as { text?: string };

            // Push the final text into the assistant-ui composer
            if (data.text) {
              transcript = data.text;
              for (const cb of callbacks.speech) {
                cb({ transcript: data.text, isFinal: true });
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            toast({
              title: "Transcription failed",
              description: message,
              variant: "destructive",
              codingPrompt: `Please fix the following frontend transcription error in cloudflare-whisper-adapter.ts:\n\nError: ${message}\nEndpoint: ${this.endpoint}`,
            });
          } finally {
            // Cleanup hardware locks
            stream.getTracks().forEach((track) => track.stop());
            const endResult = { transcript, isFinal: true as const };
            for (const cb of callbacks.end) cb(endResult);
            (session as { status: DictationAdapter.Status }).status = {
              type: "ended",
              reason: "stopped",
            };
          }
        };

        mediaRecorder.start();
        (session as { status: DictationAdapter.Status }).status = {
          type: "running",
        };
        for (const cb of callbacks.start) cb();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({
          title: "Microphone access denied",
          description: message,
          variant: "destructive",
          codingPrompt: `Please fix the following frontend microphone access error in cloudflare-whisper-adapter.ts:\n\nError: ${message}`,
        });
        (session as { status: DictationAdapter.Status }).status = {
          type: "ended",
          reason: "error",
        };
      }
    })();

    return session;
  }
}
