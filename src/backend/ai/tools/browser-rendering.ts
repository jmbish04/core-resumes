import { getCloudflareImagesToken, getSecret } from "../../utils/secrets";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScrapedPage = {
  html: string;
  text: string;
  markdown?: string;
  links: Array<{ href: string; text?: string }>;
  /** Cloudflare Images delivery URL (replaces old R2 key). */
  screenshotUrl?: string;
  /** R2-served URL for the captured PDF of the job posting. */
  pdfUrl?: string;
};

export type JsonExtractionOptions = {
  /** Natural-language instruction for the AI extractor. */
  prompt?: string;
  /** JSON Schema describing the desired output shape. */
  responseFormat?: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema?: Record<string, unknown>;
      properties?: Record<string, unknown>;
    };
  };
  /** Optional override for custom AI models */
  customAi?: Array<{
    model: string;
    authorization: string;
  }>;
};

export type ScrapeSelector = { selector: string };
export type ScrapeResultItem = {
  text: string;
  html: string;
  attributes: Array<{ name: string; value: string }>;
  height: number;
  width: number;
  top: number;
  left: number;
};
export type ScrapeResult = Array<{
  selector: string;
  results: ScrapeResultItem[];
}>;

export type CaptureLinksOptions = {
  visibleLinksOnly?: boolean;
  excludeExternalLinks?: boolean;
};

// ---------------------------------------------------------------------------
// Internal helpers (Pure Functions)
// ---------------------------------------------------------------------------

function normalizeLinks(
  links: Array<string | { href?: string; text?: string }> | undefined,
): ScrapedPage["links"] {
  if (!links) {
    return [];
  }

  return links
    .map((link) =>
      typeof link === "string" ? { href: link } : { href: link.href ?? "", text: link.text },
    )
    .filter((link) => link.href.length > 0);
}

/** Minimal HTML → plaintext strip for the `text` field. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Browser Rendering Class
// ---------------------------------------------------------------------------

export class BrowserRendering {
  constructor(private env: Env) {}

  private async getBaseUrl(): Promise<string> {
    const accountId = await this.env.CLOUDFLARE_ACCOUNT_ID.get();
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering`;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.env.CF_BROWSER_RENDER_TOKEN.get();
    return {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
  }

  /**
   * Uploads a base64-encoded screenshot to Cloudflare Images.
   * Returns the public delivery URL (the `/public` variant).
   */
  private async uploadScreenshotToImages(
    base64Data: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const accountId = await this.env.CLOUDFLARE_ACCOUNT_ID.get();
    const imagesToken = await getCloudflareImagesToken(this.env);

    // Decode base64 → binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const formData = new FormData();
    formData.append("file", new File([bytes], "screenshot.png", { type: "image/png" }));
    if (metadata) {
      formData.append("metadata", JSON.stringify(metadata));
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${imagesToken}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare Images upload failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      success: boolean;
      result: { id: string; variants: string[] };
    };

    // Return the /public variant URL
    return payload.result.variants.find((v) => v.endsWith("/public")) ?? payload.result.variants[0];
  }

  /**
   * Fetches an image from a URL and uploads it to Cloudflare Images.
   * Returns the public delivery URL.
   */
  public async uploadImageFromUrl(
    imageUrl: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const accountId = await this.env.CLOUDFLARE_ACCOUNT_ID.get();
    const imagesToken = await getCloudflareImagesToken(this.env);

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
    }
    const blob = await imageRes.blob();

    const formData = new FormData();
    formData.append("file", new File([blob], "image.png", { type: blob.type || "image/png" }));
    if (metadata) {
      formData.append("metadata", JSON.stringify(metadata));
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${imagesToken}` },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare Images upload failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      success: boolean;
      result: { id: string; variants: string[] };
    };

    return payload.result.variants.find((v) => v.endsWith("/public")) ?? payload.result.variants[0];
  }

  // ---------------------------------------------------------------------------
  // /snapshot — HTML + screenshot in one request
  // ---------------------------------------------------------------------------

  /**
   * Scrapes a URL using the Browser Rendering `/snapshot` endpoint.
   * This captures rendered HTML and a base64 screenshot simultaneously.
   * The screenshot is uploaded to Cloudflare Images for persistent storage.
   */
  public async scrapeUrl(url: string): Promise<ScrapedPage> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const response = await fetch(`${base}/snapshot`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Rendering snapshot failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      success: boolean;
      result: {
        html?: string;
        screenshot?: string; // base64-encoded PNG
        links?: Array<string | { href?: string; text?: string }>;
      };
    };

    const result = payload.result ?? payload;
    let screenshotUrl: string | undefined;

    // Upload screenshot to Cloudflare Images if present
    if (result.screenshot) {
      try {
        screenshotUrl = await this.uploadScreenshotToImages(result.screenshot, {
          source: "browser-rendering",
          url,
          capturedAt: new Date().toISOString(),
        });
      } catch {
        // Non-fatal — log and continue without screenshot
        console.error("Failed to upload screenshot to Cloudflare Images");
      }
    }

    return {
      html: result.html ?? "",
      text: stripHtml(result.html ?? ""),
      links: normalizeLinks(result.links),
      screenshotUrl,
    };
  }

  // ---------------------------------------------------------------------------
  // /pdf — Capture page as PDF
  // ---------------------------------------------------------------------------

  /**
   * Captures a URL as a PDF using the Browser Rendering `/pdf` endpoint.
   * Returns raw `ArrayBuffer` suitable for R2 upload.
   *
   * Uses `networkidle0` to ensure JS-heavy pages (like Greenhouse) finish
   * rendering before capture.
   */
  public async capturePdf(url: string): Promise<ArrayBuffer> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const response = await fetch(`${base}/pdf`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        // Use "load" instead of "networkidle0" — Greenhouse/Lever pages have
        // persistent analytics connections (tracking pixels, websockets) that
        // prevent networkidle0 from ever resolving within the 30s default.
        goToOptions: { waitUntil: "load", timeout: 45000 },
        // Block non-essential resources that delay page load without affecting
        // the visible job posting content rendered in the PDF.
        rejectResourceTypes: ["image", "media", "font"],
      }),
    });

    if (!response.ok) {
      throw new Error(`Browser Rendering /pdf failed: ${response.status} ${await response.text()}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Uploads a PDF buffer to R2 and returns the Worker-served URL.
   *
   * Key format: `job-postings/{roleId}.pdf`
   */
  public async uploadPdfToR2(
    key: string,
    pdfBuffer: ArrayBuffer,
    metadata?: Record<string, string>,
  ): Promise<string> {
    await this.env.R2_FILES_BUCKET.put(key, pdfBuffer, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: metadata,
    });

    // Return a Worker-served URL — the /api/files route will read from R2
    return `/api/files/${key}`;
  }

  // ---------------------------------------------------------------------------
  // /json — AI-powered structured extraction
  // ---------------------------------------------------------------------------

  /**
   * Extracts structured JSON data from a URL using Browser Rendering's `/json`
   * endpoint. This sends the page through Workers AI which extracts data
   * according to the provided `prompt` and/or `responseFormat` JSON schema.
   */
  public async extractJson<T = unknown>(url: string, options: JsonExtractionOptions): Promise<T> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const body: Record<string, unknown> = { url };

    if (options.prompt) {
      body.prompt = options.prompt;
    }
    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    // At least one of prompt or response_format is required
    if (!options.prompt && !options.responseFormat) {
      throw new Error("extractJson requires at least a `prompt` or `responseFormat`");
    }

    const browserRenderToken = await getSecret(this.env, "CLOUDFLARE_BROWSER_RENDER_TOKEN");
    const defaultAuth = `Bearer ${browserRenderToken}`;

    body.custom_ai = options.customAi ?? [
      {
        model: "workers-ai/@cf/moonshotai/kimi-k2.6",
        authorization: defaultAuth,
      },
      {
        model: "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        authorization: defaultAuth,
      },
      {
        model: "workers-ai/@cf/openai/gpt-oss-120b",
        authorization: defaultAuth,
      },
    ];

    const response = await fetch(`${base}/json`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Rendering /json failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as { success: boolean; result: T };
    return payload.result;
  }

  /** Alias for extractJson to match requested naming convention */
  public async captureJSON<T = unknown>(url: string, options: JsonExtractionOptions): Promise<T> {
    return this.extractJson<T>(url, options);
  }

  // ---------------------------------------------------------------------------
  // /markdown — Clean markdown extraction
  // ---------------------------------------------------------------------------

  /**
   * Extracts a page's content as clean Markdown using the Browser Rendering
   * `/markdown` endpoint. Useful for downstream LLM processing, embeddings,
   * or human-readable archival.
   */
  public async extractMarkdown(url: string): Promise<string> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const response = await fetch(`${base}/markdown`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Rendering /markdown failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as { success: boolean; result: string };
    return payload.result;
  }

  // ---------------------------------------------------------------------------
  // /content — Fetch fully rendered HTML
  // ---------------------------------------------------------------------------

  /**
   * Instructs the browser to navigate to a website and capture the fully rendered
   * HTML of a page after JavaScript execution.
   */
  public async captureContent(url: string): Promise<string> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const response = await fetch(`${base}/content`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Rendering /content failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as { success: boolean; result: string };
    return payload.result;
  }

  // ---------------------------------------------------------------------------
  // /scrape — Extract HTML elements
  // ---------------------------------------------------------------------------

  /**
   * Extracts structured data from specific elements on a webpage using CSS selectors.
   */
  public async scrapeElements(url: string, elements: ScrapeSelector[]): Promise<ScrapeResult> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const response = await fetch(`${base}/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url, elements }),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Rendering /scrape failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as { success: boolean; result: ScrapeResult };
    return payload.result;
  }

  // ---------------------------------------------------------------------------
  // /links — Retrieve all links
  // ---------------------------------------------------------------------------

  /**
   * Retrieves all links from a webpage.
   */
  public async captureLinks(url: string, options?: CaptureLinksOptions): Promise<string[]> {
    const base = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const body: Record<string, unknown> = { url };
    if (options?.visibleLinksOnly !== undefined) body.visibleLinksOnly = options.visibleLinksOnly;
    if (options?.excludeExternalLinks !== undefined)
      body.excludeExternalLinks = options.excludeExternalLinks;

    const response = await fetch(`${base}/links`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Rendering /links failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as { success: boolean; result: string[] };
    return payload.result;
  }
}
