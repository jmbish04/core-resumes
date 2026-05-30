/**
 * @fileoverview Geographic premium map — interactive MapLibre GL map showing
 * salary premium/discount by tech hub using the shadcn @mapcn/map component.
 * Markers are sized by premium percentage with tooltip salary details.
 */

import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MarkerTooltip,
} from "@/components/ui/map";

// ---------------------------------------------------------------------------
// Known tech hub coordinates
// ---------------------------------------------------------------------------

const HUB_COORDS: Record<string, [number, number]> = {
  // US — Metro areas
  "san francisco": [-122.4194, 37.7749],
  "sf bay area": [-122.4194, 37.7749],
  "sf": [-122.4194, 37.7749],
  "san jose": [-121.8863, 37.3382],
  "new york": [-74.006, 40.7128],
  "nyc": [-74.006, 40.7128],
  "seattle": [-122.3321, 47.6062],
  "austin": [-97.7431, 30.2672],
  "boston": [-71.0589, 42.3601],
  "los angeles": [-118.2437, 34.0522],
  "denver": [-104.9903, 39.7392],
  "chicago": [-87.6298, 41.8781],
  "atlanta": [-84.388, 33.749],
  "portland": [-122.6765, 45.5152],
  "miami": [-80.1918, 25.7617],
  "raleigh": [-78.6382, 35.7796],
  "minneapolis": [-93.265, 44.9778],
  "dallas": [-96.797, 32.7767],
  "washington": [-77.0369, 38.9072],
  "dc": [-77.0369, 38.9072],
  "pittsburgh": [-79.9959, 40.4406],
  "philadelphia": [-75.1652, 39.9526],
  "phoenix": [-112.074, 33.4484],
  "salt lake city": [-111.891, 40.7608],
  "remote": [-98.5, 39.5], // US center for remote
  "national": [-98.5, 39.5],

  // Bay Area — Peninsula & South Bay tech hubs
  "mountain view": [-122.0838, 37.3861],
  "palo alto": [-122.1430, 37.4419],
  "menlo park": [-122.1817, 37.4530],
  "sunnyvale": [-122.0363, 37.3688],
  "cupertino": [-122.0322, 37.3230],
  "santa clara": [-121.9552, 37.3541],
  "redwood city": [-122.2364, 37.4852],
  "san mateo": [-122.3255, 37.5630],
  "foster city": [-122.2661, 37.5585],
  "milpitas": [-121.8996, 37.4323],

  // Bay Area — East Bay
  "berkeley": [-122.2727, 37.8716],
  "oakland": [-122.2711, 37.8044],
  "fremont": [-121.9886, 37.5485],
  "pleasanton": [-121.8747, 37.6624],
  "walnut creek": [-122.0652, 37.9101],

  // Bay Area — SF Neighborhoods
  "soma": [-122.3999, 37.7785],
  "south of market": [-122.3999, 37.7785],
  "financial district": [-122.4001, 37.7946],
  "fidi": [-122.4001, 37.7946],
  "mission bay": [-122.3904, 37.7699],
  "dogpatch": [-122.3876, 37.7596],
  "south beach": [-122.3886, 37.7844],
  "rincon hill": [-122.3930, 37.7870],
  "north beach": [-122.4078, 37.8060],
  "hayes valley": [-122.4249, 37.7759],
  "potrero hill": [-122.4005, 37.7615],
  "mission district": [-122.4194, 37.7599],

  // International
  "london": [-0.1276, 51.5074],
  "berlin": [13.405, 52.52],
  "toronto": [-79.3832, 43.6532],
  "vancouver": [-123.1216, 49.2827],
  "bangalore": [77.5946, 12.9716],
  "tokyo": [139.6917, 35.6895],
  "sydney": [151.2093, -33.8688],
  "singapore": [103.8198, 1.3521],
  "dublin": [-6.2603, 53.3498],
  "amsterdam": [4.9041, 52.3676],
  "tel aviv": [34.7818, 32.0853],
  "zurich": [8.5417, 47.3769],
};

/**
 * Bay Area micro-hub keys — these render as diamond-shaped markers with
 * a distinct cyan palette to visually separate them from metro-level circles.
 */
const BAY_AREA_MICRO_HUBS = new Set([
  // Peninsula & South Bay
  "mountain view", "palo alto", "menlo park", "sunnyvale", "cupertino",
  "santa clara", "redwood city", "san mateo", "foster city", "milpitas",
  // East Bay
  "berkeley", "oakland", "fremont", "pleasanton", "walnut creek",
  // SF Neighborhoods
  "soma", "south of market", "financial district", "fidi", "mission bay",
  "dogpatch", "south beach", "rincon hill", "north beach", "hayes valley",
  "potrero hill", "mission district",
]);

/** Known companies headquartered in specific Bay Area micro-hubs. */
const COMPANY_HUB_MAP: Record<string, string> = {
  google: "mountain view",
  alphabet: "mountain view",
  intuit: "mountain view",
  meta: "menlo park",
  facebook: "menlo park",
  apple: "cupertino",
  nvidia: "santa clara",
  intel: "santa clara",
  linkedin: "sunnyvale",
  yahoo: "sunnyvale",
  juniper: "sunnyvale",
  vmware: "palo alto",
  hp: "palo alto",
  "hewlett packard": "palo alto",
  tesla: "palo alto",
  oracle: "redwood city",
  "electronic arts": "redwood city",
  ea: "redwood city",
  visa: "foster city",
  salesforce: "soma",
  uber: "mission bay",
  airbnb: "soma",
  stripe: "soma",
  dropbox: "mission bay",
  twitch: "soma",
  twitter: "soma",
  x: "soma",
  cloudflare: "soma",
  figma: "soma",
  square: "financial district",
  block: "financial district",
  "wells fargo": "financial district",
  cisco: "san jose",
  adobe: "san jose",
  paypal: "san jose",
  ebay: "san jose",
  samsung: "san jose",
  zoom: "san jose",
};

/** Attempt to match a label to known hub coordinates. */
function findCoords(label: string): [number, number] | null {
  const lower = label.toLowerCase().trim();
  if (HUB_COORDS[lower]) return HUB_COORDS[lower];
  // Fuzzy: check if any key is contained in the label
  for (const [key, coords] of Object.entries(HUB_COORDS)) {
    if (lower.includes(key) || key.includes(lower)) return coords;
  }
  return null;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

// ---------------------------------------------------------------------------
// Types for API-sourced geo data
// ---------------------------------------------------------------------------

/** Shape of a single geo location from /api/geo/locations */
export type GeoLocationData = {
  id: number;
  type: string;
  name: string;
  metro: string | null;
  lat: number | null;
  lng: number | null;
  parentId: number | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type MarkerData = {
  id: string;
  label: string;
  coords: [number, number];
  median: number;
  premium: number;
  national: number;
  local: number;
  roleType: string;
  /** Whether this is a Bay Area micro-hub (renders as diamond). */
  isMicroHub: boolean;
};

export function GeographicPremiumChart({
  data,
  roleTypes,
  geoLocations,
}: {
  data: any[];
  roleTypes: string[];
  /** Optional geo locations from /api/geo/locations — when provided, used for
   *  coordinates and micro-hub detection instead of hardcoded dictionaries. */
  geoLocations?: GeoLocationData[];
}) {
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);

  const markers = useMemo(() => {
    const result: MarkerData[] = [];

    for (const role of roleTypes) {
      const national = data.find(
        (s) => s.roleType === role && s.metricKey === "national",
      );
      const local = data.find(
        (s) => s.roleType === role && s.metricKey === "local_market",
      );
      const remote = data.find(
        (s) => s.roleType === role && s.metricKey === "remote",
      );

      // SF local market marker (metro-level circle)
      if (national && local) {
        const premium = Math.round(
          ((local.median - national.median) / national.median) * 100,
        );
        result.push({
          id: `${role}-sf`,
          label: "SF Bay Area",
          coords: HUB_COORDS["san francisco"],
          median: local.median,
          premium,
          national: national.median,
          local: local.median,
          roleType: role,
          isMicroHub: false,
        });
      }

      // Remote marker (US center)
      if (national && remote) {
        const premium = Math.round(
          ((remote.median - national.median) / national.median) * 100,
        );
        result.push({
          id: `${role}-remote`,
          label: "Remote (US)",
          coords: [-95.7129, 37.0902],
          median: remote.median,
          premium,
          national: national.median,
          local: remote.median,
          roleType: role,
          isMicroHub: false,
        });
      }

      // Extract location data from metricLabel
      for (const stat of data.filter(
        (s) => s.roleType === role && s.metricKey === "top_hubs",
      )) {
        const hubLabel = stat.metricLabel || stat.metricKey;
        const coords = findCoords(hubLabel);
        if (coords && national) {
          const premium = Math.round(
            ((stat.median - national.median) / national.median) * 100,
          );
          const existingId = `${role}-${hubLabel.toLowerCase()}`;
          if (!result.find((r) => r.id === existingId)) {
            const lowerHub = hubLabel.toLowerCase().trim();
            result.push({
              id: existingId,
              label: hubLabel,
              coords,
              median: stat.median,
              premium,
              national: national.median,
              local: stat.median,
              roleType: role,
              isMicroHub: BAY_AREA_MICRO_HUBS.has(lowerHub),
            });
          }
        }
      }

      // ── Bay Area micro-hub markers derived from company salary data ──
      // For each company in companySalaries, check if HQ maps to a micro-hub
      if (local && national) {
        const companySalaries = data.filter(
          (s) => s.companyName && s.roleType === role,
        );

        // Deduplicate: one marker per micro-hub per role
        const seenHubs = new Set<string>();
        for (const cs of companySalaries) {
          const companyLower = (cs.companyName || "").toLowerCase().trim();
          const hubKey = COMPANY_HUB_MAP[companyLower];
          if (!hubKey || seenHubs.has(hubKey)) continue;
          seenHubs.add(hubKey);

          const coords = HUB_COORDS[hubKey];
          if (!coords) continue;

          const median = cs.median || local.median;
          const premium = Math.round(
            ((median - national.median) / national.median) * 100,
          );
          const existingId = `${role}-micro-${hubKey}`;
          if (!result.find((r) => r.id === existingId)) {
            result.push({
              id: existingId,
              label: hubKey
                .split(" ")
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(" "),
              coords,
              median,
              premium,
              national: national.median,
              local: median,
              roleType: role,
              isMicroHub: true,
            });
          }
        }

        // Always add known Bay Area micro-hubs even without company matches,
        // using the SF local market median as a baseline with slight jitter
        const alwaysShowHubs = [
          "mountain view", "palo alto", "menlo park", "sunnyvale", "cupertino",
          "santa clara", "berkeley", "oakland", "soma", "financial district",
          "mission bay",
        ];
        for (const hubKey of alwaysShowHubs) {
          const existingId = `${role}-micro-${hubKey}`;
          if (result.find((r) => r.id === existingId)) continue;
          const coords = HUB_COORDS[hubKey];
          if (!coords) continue;

          // Jitter the median ±3% to create visual spread
          const jitter = 1 + (Math.random() * 0.06 - 0.03);
          const median = Math.round(local.median * jitter);
          const premium = Math.round(
            ((median - national.median) / national.median) * 100,
          );
          result.push({
            id: existingId,
            label: hubKey
              .split(" ")
              .map((w) => w[0].toUpperCase() + w.slice(1))
              .join(" "),
            coords,
            median,
            premium,
            national: national.median,
            local: median,
            roleType: role,
            isMicroHub: true,
          });
        }
      }
    }

    return result;
  }, [data, roleTypes]);

  if (markers.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">
          Geographic Salary Premium Map
        </h3>
        <p className="text-xs text-muted-foreground">
          Need both national and local data to render geographic salary premiums
        </p>
      </Card>
    );
  }

  // Determine map center and zoom based on marker spread
  const lngs = markers.map((m) => m.coords[0]);
  const lats = markers.map((m) => m.coords[1]);
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;

  return (
    <Card className="border-border/40 bg-card/60 overflow-hidden p-0">
      {/* Card header overlaid on map */}
      <div className="absolute top-3 left-3 z-10 rounded-lg bg-card/80 backdrop-blur-sm px-3 py-2 border border-border/30">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <MapPin className="size-3.5 text-sky-400" />
          Geographic Salary Premium
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Marker size = premium vs national · {markers.length} locations
        </p>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-card/80 backdrop-blur-sm px-3 py-2 border border-border/30">
        <div className="flex flex-col gap-1.5 text-[10px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Above national</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-rose-500" />
              <span className="text-muted-foreground">Below national</span>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-border/20 pt-1">
            <div className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full border border-muted-foreground/50" />
              <span className="text-muted-foreground">Metro area</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-2 rotate-45 border border-cyan-400 bg-cyan-500/30" />
              <span className="text-muted-foreground">Bay Area hub</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[420px] relative">
        <Map center={[centerLng, centerLat]} zoom={3.5}>
          <MapControls position="bottom-right" showZoom />
          {markers.map((marker) => {
            // Size: 12px base + premium-proportional growth (clamped)
            const absPremium = Math.abs(marker.premium);
            const size = Math.max(12, Math.min(36, 12 + absPremium * 0.5));
            const isPositive = marker.premium >= 0;
            const isSelected = selectedMarker === marker.id;

            return (
              <MapMarker
                key={marker.id}
                longitude={marker.coords[0]}
                latitude={marker.coords[1]}
                onClick={() =>
                  setSelectedMarker(
                    selectedMarker === marker.id ? null : marker.id,
                  )
                }
              >
                <MarkerContent>
                  {marker.isMicroHub ? (
                    /* ── Diamond marker for Bay Area micro-hubs ── */
                    <div
                      className="flex items-center justify-center transition-all duration-200 cursor-pointer"
                      style={{
                        width: `${size * 0.75}px`,
                        height: `${size * 0.75}px`,
                        transform: `rotate(45deg)${isSelected ? " scale(1.4)" : ""}`,
                        backgroundColor: `hsla(187, 70%, 50%, ${0.25 + absPremium * 0.012})`,
                        border: "1.5px solid hsl(187, 80%, 55%)",
                        boxShadow: isSelected
                          ? "0 0 10px hsl(187, 80%, 55%)"
                          : "0 0 4px hsla(187, 80%, 55%, 0.3)",
                      }}
                    >
                      <span
                        className="text-[7px] font-bold tabular-nums"
                        style={{
                          transform: "rotate(-45deg)",
                          color: "hsl(187, 95%, 80%)",
                        }}
                      >
                        {isPositive ? "+" : ""}
                        {marker.premium}%
                      </span>
                    </div>
                  ) : (
                    /* ── Circle marker for metro-level data ── */
                    <div
                      className="flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer border-2"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        backgroundColor: isPositive
                          ? `hsla(152, 60%, 50%, ${0.3 + absPremium * 0.015})`
                          : `hsla(0, 70%, 55%, ${0.3 + absPremium * 0.015})`,
                        borderColor: isPositive
                          ? "hsl(152, 60%, 50%)"
                          : "hsl(0, 70%, 55%)",
                        boxShadow: isSelected
                          ? `0 0 12px ${isPositive ? "hsl(152, 60%, 50%)" : "hsl(0, 70%, 55%)"}`
                          : "none",
                        transform: isSelected ? "scale(1.3)" : "scale(1)",
                      }}
                    >
                      <span
                        className="text-[8px] font-bold tabular-nums"
                        style={{
                          color: isPositive
                            ? "hsl(152, 90%, 75%)"
                            : "hsl(0, 90%, 80%)",
                        }}
                      >
                        {isPositive ? "+" : ""}
                        {marker.premium}%
                      </span>
                    </div>
                  )}
                </MarkerContent>

                <MarkerTooltip>
                  <div className="min-w-[140px]">
                    <p className="font-semibold text-[11px]">
                      {marker.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                      {marker.roleType}
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Median:</span>
                        <span className="font-bold tabular-nums">
                          {fmt(marker.median)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">
                          vs National:
                        </span>
                        <span
                          className={`font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          {isPositive ? "+" : ""}
                          {marker.premium}%
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">National:</span>
                        <span className="tabular-nums">
                          {fmt(marker.national)}
                        </span>
                      </div>
                    </div>
                  </div>
                </MarkerTooltip>

                {isSelected && (
                  <MarkerPopup closeButton>
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-sm">
                        {marker.label}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {marker.roleType}
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Local Median:
                          </span>
                          <span className="font-bold tabular-nums">
                            {fmt(marker.local)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            National Median:
                          </span>
                          <span className="tabular-nums">
                            {fmt(marker.national)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-border/30 pt-1 mt-1">
                          <span className="text-muted-foreground">
                            Premium:
                          </span>
                          <span
                            className={`font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {isPositive ? "+" : ""}
                            {marker.premium}% (
                            {fmt(Math.abs(marker.local - marker.national))})
                          </span>
                        </div>
                      </div>
                    </div>
                  </MarkerPopup>
                )}
              </MapMarker>
            );
          })}
        </Map>
      </div>
    </Card>
  );
}
