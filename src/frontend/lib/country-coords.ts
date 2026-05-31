/**
 * @fileoverview ⚠️ DEPRECATED — DO NOT USE IN NEW CODE.
 *
 * Country coordinates are now served from the centralized `geo_locations` table
 * via `GET /api/geo/locations?type=country`. All consumers have been migrated.
 *
 * This file is preserved temporarily as a reference. It will be deleted in a
 * future migration once all deployments have been verified.
 *
 * @deprecated Use `/api/geo/locations?type=country` instead.
 * @see src/backend/api/routes/geo.ts
 * @see src/backend/db/schemas/geo/geo-locations.ts
 */

export interface CountryCoord {
  lat: number;
  lng: number;
  name: string;
}

/**
 * @deprecated Use `/api/geo/locations?type=country` instead.
 */
export const COUNTRY_COORDS: Record<string, CountryCoord> = {};

/**
 * @deprecated Use `/api/geo/locations?type=country` instead.
 */
export function getCountryCoord(_code: string | null | undefined): CountryCoord | null {
  return null;
}
