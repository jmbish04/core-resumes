/**
 * @fileoverview Service for interacting with the HeiGIT OpenRoute API.
 * Uses the new api.heigit.org base URL as the openrouteservice.org domain is deprecated.
 */

import { getOpenRouteApiKey } from "@/backend/utils/secrets";

import { GoogleMapsService } from "./google-maps";

export interface OpenRouteDirectionsResponse {
  features?: Array<{
    properties?: {
      segments?: Array<{
        distance: number;
        duration: number;
      }>;
      summary?: {
        distance: number;
        duration: number;
      };
    };
  }>;
}

export class OpenRouteService {
  private readonly baseUrl = "https://api.heigit.org";

  constructor(private readonly env: Env) {}

  /**
   * Helper to execute API calls to the OpenRoute/HeiGIT service
   */
  private async fetchOpenRoute(path: string, body?: any, timeoutMs = 5000): Promise<any> {
    const apiKey = await getOpenRouteApiKey(this.env);
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: apiKey,
    };

    const options: RequestInit = {
      headers,
    };

    if (body) {
      options.method = "POST";
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    } else {
      options.method = "GET";
    }

    options.signal = AbortSignal.timeout(timeoutMs);

    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouteService error: ${res.status} ${text}`);
    }
    return await res.json();
  }

  /**
   * Geocode a human-readable address into coordinates using Pelias.
   * Note: The Pelias endpoint requires the api_key in the URL.
   * @param query The location/address query string
   * @returns [longitude, latitude] or null if not found
   */
  async geocode(query: string, timeoutMs = 5000): Promise<[number, number] | null> {
    const apiKey = await getOpenRouteApiKey(this.env);
    const url = `${this.baseUrl}/pelias/v1/search?text=${encodeURIComponent(query)}&api_key=${apiKey}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        throw new Error(`Geocode error: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const features = data.features;
      if (!features || features.length === 0) return null;

      // Pelias returns coordinates as [longitude, latitude]
      return features[0].geometry.coordinates as [number, number];
    } catch (e) {
      throw new Error(`Geocode failed: ${(e as Error).message}`);
    }
  }

  /**
   * Get driving directions (car) between two coordinates.
   * Coordinates must be in [longitude, latitude] format.
   * @returns Distance in meters and duration in seconds
   */
  async getDrivingDirections(
    startCoords: [number, number],
    endCoords: [number, number],
    timeoutMs = 5000,
  ): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    try {
      const data = (await this.fetchOpenRoute(
        "/openrouteservice/v2/directions/driving-car",
        {
          coordinates: [startCoords, endCoords],
        },
        timeoutMs,
      )) as OpenRouteDirectionsResponse;

      const summary = data.features?.[0]?.properties?.summary;
      if (summary) {
        return {
          distanceMeters: summary.distance,
          durationSeconds: summary.duration,
        };
      }
      return null;
    } catch (e) {
      console.warn("Failed to get driving directions:", e);
      throw e;
    }
  }

  /**
   * Helper to get a full commute summary (driving) by geocoding address strings.
   * Handles errors internally to allow for graceful fallbacks.
   *
   * Strategy: Try OpenRoute first with an aggressive 8s overall deadline
   * (3s per API call × 3 calls). If anything fails or times out, fall back
   * to Google Maps Routes API.
   */
  async getCommuteSummary(
    startAddress: string,
    endAddress: string,
  ): Promise<
    | {
        distanceMiles: number;
        durationMinutes: number;
        success: true;
        source: "openroute" | "google_maps";
      }
    | { success: false; error: string }
  > {
    try {
      const PER_CALL_TIMEOUT_MS = 2500; // 3 calls * 2500ms = 7500ms max latency before fallback

      let openRouteFailed = false;
      let distanceMeters: number | undefined;
      let durationSeconds: number | undefined;

      try {
        const startCoords = await this.geocode(startAddress, PER_CALL_TIMEOUT_MS);
        if (!startCoords) throw new Error("Could not geocode start address via OpenRoute");

        const endCoords = await this.geocode(endAddress, PER_CALL_TIMEOUT_MS);
        if (!endCoords) throw new Error("Could not geocode end address via OpenRoute");

        const directions = await this.getDrivingDirections(
          startCoords,
          endCoords,
          PER_CALL_TIMEOUT_MS,
        );
        if (!directions) throw new Error("No route found between locations via OpenRoute");

        distanceMeters = directions.distanceMeters;
        durationSeconds = directions.durationSeconds;
      } catch (e) {
        console.warn("OpenRoute failed or timed out, falling back to Google Maps:", e);
        openRouteFailed = true;
      }

      if (openRouteFailed) {
        // Fallback to Google Maps
        try {
          const gmService = new GoogleMapsService(this.env);
          const gmResult = await gmService.computeCommute(startAddress, endAddress);
          distanceMeters = gmResult.distanceMiles / 0.000621371; // Convert back to meters for consistent checking
          durationSeconds = gmResult.durationMinutes * 60; // Convert back to seconds
        } catch (gmErr) {
          return {
            success: false,
            error: `Both OpenRoute and Google Maps fallback failed: ${(gmErr as Error).message}`,
          };
        }
      }

      if (distanceMeters === undefined || durationSeconds === undefined) {
        return { success: false, error: "Failed to resolve commute duration." };
      }

      return {
        success: true,
        source: openRouteFailed ? ("google_maps" as const) : ("openroute" as const),
        distanceMiles: distanceMeters * 0.000621371, // meters to miles
        durationMinutes: Math.round(durationSeconds / 60), // seconds to minutes
      };
    } catch (e) {
      const err = e as Error;
      return { success: false, error: err.message };
    }
  }
}
