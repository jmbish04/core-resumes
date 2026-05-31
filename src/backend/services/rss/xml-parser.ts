/**
 * @fileoverview Lightweight V8-native XML parser for RSS 2.0 and Atom feeds.
 *
 * No npm dependencies — uses only regex and string operations available in
 * the Cloudflare Workers V8 runtime. Handles CDATA blocks, HTML stripping,
 * and both RSS `<item>` and Atom `<entry>` elements.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  guid?: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip CDATA wrappers: `<![CDATA[...]]>` → `...` */
export function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Strip all HTML tags and collapse whitespace. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Extract text content of a single XML tag from a block. */
export function extractTagContent(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(regex);
  if (!match) return "";
  return stripCdata(match[1]).trim();
}

/** Extract href from an Atom `<link>` element. */
export function extractAtomLink(block: string): string {
  // Atom self-links: <link href="..." />  or  <link rel="alternate" href="..." />
  const hrefMatch = block.match(/<link[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch) return hrefMatch[1];

  // Fallback: <link>text</link>
  return extractTagContent(block, "link");
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse an RSS 2.0 or Atom XML string into an array of `RssItem`.
 *
 * Detects feed format automatically:
 * - RSS 2.0: looks for `<item>` blocks
 * - Atom: looks for `<entry>` blocks
 */
export function parseRssXml(xmlString: string): RssItem[] {
  const items: RssItem[] = [];

  // Detect Atom vs RSS
  const isAtom = /<feed[\s>]/i.test(xmlString);

  if (isAtom) {
    const entryBlocks = xmlString.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const block of entryBlocks) {
      items.push({
        title: stripHtml(stripCdata(extractTagContent(block, "title"))),
        link: extractAtomLink(block),
        description: stripHtml(stripCdata(extractTagContent(block, "content") || extractTagContent(block, "summary"))),
        pubDate: extractTagContent(block, "published") || extractTagContent(block, "updated"),
        guid: extractTagContent(block, "id"),
        category: extractTagContent(block, "category"),
      });
    }
  } else {
    // RSS 2.0
    const itemBlocks = xmlString.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const block of itemBlocks) {
      items.push({
        title: stripHtml(stripCdata(extractTagContent(block, "title"))),
        link: extractTagContent(block, "link") || extractAtomLink(block),
        description: stripHtml(stripCdata(extractTagContent(block, "description"))),
        pubDate: extractTagContent(block, "pubDate"),
        guid: extractTagContent(block, "guid"),
        category: extractTagContent(block, "category"),
      });
    }
  }

  return items;
}
