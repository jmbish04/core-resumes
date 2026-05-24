import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";

import type { AppBindings } from "..";

import { roles } from "../../db/schemas/applications/roles";
import { OpenRouteService } from "../../services/openroute";

export const commuteRouteRouter = new Hono<AppBindings>();

commuteRouteRouter.get("/:roleId/commute-route", async (c) => {
  const { roleId } = c.req.param();
  const db = drizzle(c.env.DB);
  const role = await db.select().from(roles).where(eq(roles.id, roleId)).get();

  if (!role) {
    return c.json({ error: "Role not found" }, 404);
  }

  const meta = (role.metadata ?? {}) as Record<string, unknown>;
  const rawLocation = (meta.location ?? meta.city ?? "San Francisco, CA") as string;
  const caLocations = (meta.californiaLocations ?? []) as string[];
  const commuteTarget = caLocations.length > 0 ? caLocations[0] : rawLocation;
  const startAddress = "126 Colby St, San Francisco, CA 94134";

  const openRoute = new OpenRouteService(c.env);

  try {
    const startCoords = await openRoute.geocode(startAddress);
    const endCoords = await openRoute.geocode(commuteTarget);

    if (!startCoords || !endCoords) {
      return c.json({ error: "Failed to geocode one or both addresses" }, 500);
    }

    const summary = await openRoute.getCommuteSummary(startAddress, commuteTarget);

    if (!summary.success) {
      return c.json({ error: summary.error }, 500);
    }

    return c.json({
      start: { name: "126 Colby St", lng: startCoords[0], lat: startCoords[1] },
      end: { name: commuteTarget, lng: endCoords[0], lat: endCoords[1] },
      distanceMiles: summary.distanceMiles,
      durationMinutes: summary.durationMinutes,
      source: summary.source,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Geocode/Routing failed" },
      500,
    );
  }
});
