/**
 * @fileoverview Custom SpeechSynthesisAdapter for Deepgram Aura-2 TTS.
 *
 * Implements the assistant-ui SpeechSynthesisAdapter interface to route
 * text-to-speech through our Hono /api/tts endpoint.
 */

import type { SpeechSynthesisAdapter } from "@assistant-ui/react";

import { toast } from "../api-client";

export class CustomTTSAdapter implements SpeechSynthesisAdapter {
  private apiUrl: string;

  constructor(options: { apiUrl: string }) {
    this.apiUrl = options.apiUrl;
  }

  speak(text: string): SpeechSynthesisAdapter.Utterance {
    const audio = new Audio();
    let cancelled = false;

    const subscribers = new Set<() => void>();

    const utterance: SpeechSynthesisAdapter.Utterance = {
      status: { type: "running" },
      cancel: () => {
        cancelled = true;
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
        utterance.status = { type: "ended", reason: "cancelled" };
        for (const cb of subscribers) cb();
      },
      subscribe: (cb: () => void) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
      },
    };

    // Fire and forget — fetch audio and play
    (async () => {
      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok || cancelled) {
          if (!response.ok) {
            toast({
              title: "TTS Error",
              description: response.statusText,
              variant: "destructive",
              codingPrompt: `Please fix the following frontend error in custom-tts-adapter.ts:\n\nTTS API responded with ${response.status} ${response.statusText}`,
            });
          }
          utterance.status = { type: "ended", reason: cancelled ? "cancelled" : "error" };
          for (const cb of subscribers) cb();
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;

        audio.src = URL.createObjectURL(blob);

        audio.onended = () => {
          URL.revokeObjectURL(audio.src);
          utterance.status = { type: "ended", reason: "finished" };
          for (const cb of subscribers) cb();
        };

        audio.onerror = () => {
          toast({
            title: "TTS Playback Failed",
            description: "Failed to play audio stream.",
            variant: "destructive",
            codingPrompt: `Please fix the following frontend error in custom-tts-adapter.ts:\n\nAudio playback failed (audio.onerror).`,
          });
          URL.revokeObjectURL(audio.src);
          utterance.status = { type: "ended", reason: "error" };
          for (const cb of subscribers) cb();
        };

        await audio.play();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast({
          title: "TTS Network Error",
          description: message,
          variant: "destructive",
          codingPrompt: `Please fix the following frontend error in custom-tts-adapter.ts:\n\nError: ${message}`,
        });
        utterance.status = { type: "ended", reason: "error" };
        for (const cb of subscribers) cb();
      }
    })();

    return utterance;
  }
}
