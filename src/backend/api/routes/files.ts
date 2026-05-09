import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const filesRouter = new OpenAPIHono<{ Bindings: Env }>();

filesRouter.openapi(
  createRoute({
    method: "get",
    path: "/:key{.+}",
    operationId: "getFile",
    request: {
      params: z.object({ key: z.string() }),
    },
    responses: {
      200: { description: "File content" },
      404: { description: "Not found" },
    },
  }),
  (async (c: any) => {
    const key = c.req.param("key");
    const object = await c.env.R2_FILES_BUCKET.get(key);

    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  }) as any,
);
