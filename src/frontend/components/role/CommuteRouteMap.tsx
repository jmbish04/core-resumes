"use client";

import { Loader2, Car, Clock, MapPin, Route, ShieldAlert, Cpu } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Map, MapMarker, MarkerContent, MapRoute, MarkerLabel } from "@/components/ui/map";

interface CommuteRouteData {
  start: { name: string; lng: number; lat: number };
  end: { name: string; lng: number; lat: number };
  distanceMiles: number;
  durationMinutes: number;
  source: string;
}

interface CommuteRouteMapProps {
  roleId: string;
}

export function CommuteRouteMap({ roleId }: CommuteRouteMapProps) {
  const [commuteData, setCommuteData] = useState<CommuteRouteData | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/roles/${roleId}/commute-route`);
        if (!res.ok) {
          throw new Error("Failed to load commute data");
        }
        const data = (await res.json()) as CommuteRouteData;
        setCommuteData(data);

        // Now fetch route geometry from OSRM
        const osrmRes = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${data.start.lng},${data.start.lat};${data.end.lng},${data.end.lat}?overview=full&geometries=geojson`,
        );

        if (osrmRes.ok) {
          const osrmData = (await osrmRes.json()) as any;
          if (osrmData.routes?.length > 0) {
            setRouteCoordinates(osrmData.routes[0].geometry.coordinates);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [roleId]);

  if (isLoading) {
    return (
      <div className="h-[400px] w-full flex items-center justify-center bg-muted/20 rounded-xl border border-border">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !commuteData) {
    return (
      <div className="h-[400px] w-full flex flex-col items-center justify-center bg-muted/20 rounded-xl border border-border text-muted-foreground p-6 text-center">
        <ShieldAlert className="size-8 mb-2 text-destructive opacity-80" />
        <p className="font-medium text-foreground">Route Visualization Unavailable</p>
        <p className="text-sm max-w-sm mt-1">{error || "Could not resolve commute coordinates."}</p>
      </div>
    );
  }

  // Calculate center between start and end
  const centerLng = (commuteData.start.lng + commuteData.end.lng) / 2;
  const centerLat = (commuteData.start.lat + commuteData.end.lat) / 2;

  // Very rough auto-zoom calculation based on distance
  // ~20 miles distance usually needs zoom ~9.5, ~40 miles needs ~8.5
  const zoom = Math.max(7, Math.min(12, 11 - commuteData.distanceMiles / 15));

  return (
    <div className="w-full space-y-3">
      <div className="relative h-[450px] w-full rounded-xl overflow-hidden border border-border shadow-sm">
        <Map
          center={[centerLng, centerLat]}
          zoom={zoom}
          theme="dark" // Always dark for core-resumes aesthetic
        >
          {routeCoordinates.length > 0 && (
            <MapRoute coordinates={routeCoordinates} color="#3b82f6" width={5} opacity={0.8} />
          )}

          <MapMarker longitude={commuteData.start.lng} latitude={commuteData.start.lat}>
            <MarkerContent>
              <div className="size-4 rounded-full bg-emerald-500 border-2 border-background shadow-lg shadow-emerald-500/20" />
              <MarkerLabel position="bottom">
                <div className="bg-background/90 backdrop-blur-sm border px-2 py-1 rounded shadow-sm flex items-center gap-1.5 mt-1">
                  <MapPin className="size-3 text-emerald-500" />
                  <span>Home</span>
                </div>
              </MarkerLabel>
            </MarkerContent>
          </MapMarker>

          <MapMarker longitude={commuteData.end.lng} latitude={commuteData.end.lat}>
            <MarkerContent>
              <div className="size-4 rounded-full bg-blue-500 border-2 border-background shadow-lg shadow-blue-500/20" />
              <MarkerLabel position="top">
                <div className="bg-background/90 backdrop-blur-sm border px-2 py-1 rounded shadow-sm flex items-center gap-1.5 mb-1">
                  <Car className="size-3 text-blue-500" />
                  <span className="truncate max-w-[120px]">{commuteData.end.name}</span>
                </div>
              </MarkerLabel>
            </MarkerContent>
          </MapMarker>
        </Map>

        {/* Floating Metrics Overlay */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <Card className="bg-background/80 backdrop-blur-md border-border/50 shadow-xl p-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-blue-500/10 p-2 rounded-md">
                <Route className="size-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Distance</p>
                <p className="font-semibold text-sm">{commuteData.distanceMiles.toFixed(1)} mi</p>
              </div>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <div className="flex items-center gap-2">
              <div className="bg-emerald-500/10 p-2 rounded-md">
                <Clock className="size-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Est. Drive</p>
                <p className="font-semibold text-sm">{commuteData.durationMinutes} min</p>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Badge
              variant="outline"
              className="bg-background/70 backdrop-blur-md border-border/50 text-[10px] gap-1 shadow-sm px-2"
            >
              <Cpu className="size-3" />
              <span>
                Metrics via{" "}
                {commuteData.source === "openroute" ? "HeiGIT/OpenRoute" : "Google Maps API"}
              </span>
            </Badge>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 justify-center px-4">
        <span>
          <strong className="text-foreground/70">Map Data:</strong> OpenStreetMap
        </span>
        <span>&middot;</span>
        <span>
          <strong className="text-foreground/70">Tiles:</strong> Carto Dark Matter
        </span>
        <span>&middot;</span>
        <span>
          <strong className="text-foreground/70">Routing:</strong> OSRM
        </span>
        <span>&middot;</span>
        <span>
          <strong className="text-foreground/70">Metrics:</strong> OpenRouteService
        </span>
        <span>&middot;</span>
        <span>
          <strong className="text-foreground/70">Components:</strong> mapcn / MapLibre GL
        </span>
        <span>&middot;</span>
        <span>
          <strong className="text-foreground/70">Contributors:</strong> Antigravity AI
          (Implementation)
        </span>
      </div>
    </div>
  );
}
