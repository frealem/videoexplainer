import { YoutubeTranscript } from "youtube-transcript";
import { extractYoutubeVideoId } from "./utils";

// Helper to scrape/request subtitles from YouTube
export async function getYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL. Could not extract video ID.");
  }
  
  console.log(`Attempting native subtitle scrape for YouTube ID: ${videoId}`);
  const transcriptDocs = await YoutubeTranscript.fetchTranscript(videoId);
  if (!transcriptDocs || transcriptDocs.length === 0) {
    throw new Error("No caption tracks could be retrieved for this YouTube video.");
  }

  return transcriptDocs.map(entry => entry.text).join(" ");
}

// Helper to fetch YouTube oEmbed details (super fast, no key needed)
export async function fetchYoutubeOembed(url: string): Promise<{ title: string; author: string } | null> {
  try {
    const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const data = await response.json() as any;
      if (data && data.title) {
        return {
          title: data.title,
          author: data.author_name || "Unknown Creator"
        };
      }
    }
  } catch (err) {
    console.warn("Failed to fetch oEmbed info for YouTube URL:", err);
  }
  return null;
}

// Extra helper to turn raw HTML into clean, readable text paragraphs for LLM synthesis
export function cleanHtmlToText(html: string): string {
  try {
    // 1. Remove scripts, styles, noscript, headers, footers, navigation, sidebars and iframe components
    let text = html.replace(/<(script|style|noscript|iframe|header|footer|nav|aside|head)[^>]*>([\s\S]*?)<\/\1>/gi, " ");
    
    // 2. Remove all HTML tags completely
    text = text.replace(/<[^>]*>/g, " ");
    
    // 3. Decode standard HTML entities and typographic characters
    text = text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&mdash;/gi, "—")
      .replace(/&ndash;/gi, "–")
      .replace(/&ldquo;/gi, '"')
      .replace(/&rdquo;/gi, '"')
      .replace(/&lsquo;/gi, "'")
      .replace(/&rsquo;/gi, "'");
      
    // 4. Split into lines, clean whitespace, and filter out short lines or typical UI selectors
    const lines = text.split(/\r?\n/);
    const cleanedLines = lines
      .map(line => line.trim())
      .filter(line => {
        // Return lines that represent authentic paragraphs, lists, descriptions, or quotes
        return line.length > 25 && !line.startsWith("{") && !line.startsWith("[") && !line.startsWith("(") && !line.includes("var ") && !line.includes("function(");
      });
      
    // Keep first 120 lines of solid data to comfortably fit model prompts
    return cleanedLines.slice(0, 120).join("\n\n");
  } catch (err) {
    console.error("cleanHtmlToText helper error:", err);
    return "";
  }
}

// Extract canonical title, description, and readable body from website metadata tags and page elements
export function extractMetadata(html: string): { title: string; description: string; textSnippet: string } {
  // Title extraction with fallbacks
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : "";
  
  title = title
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Description extraction with open-graph and twitter card fallback
  let description = "";
  const descRegexes = [
    /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i,
    /<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']/i,
    /<meta\s+name=["']twitter:description["']\s+content=["']([\s\S]*?)["']/i,
    /<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i,
    /<meta\s+content=["']([\s\S]*?)["']\s+property=["']og:description["']/i,
  ];

  for (const regex of descRegexes) {
    const match = html.match(regex);
    if (match && match[1]) {
      description = match[1].trim();
      break;
    }
  }

  description = description
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Extract cleanest text payload
  const textSnippet = cleanHtmlToText(html);

  return { title, description, textSnippet };
}

// Helper to crawl a webpage's actual HTML elements natively (quick, robust, zero-cost fallback)
export async function fetchWebpageMetadata(url: string): Promise<{ title: string; description: string; textSnippet: string; finalUrl: string }> {
  try {
    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = "https://" + formattedUrl;
    }

    console.log(`Crawling web page natively: ${formattedUrl}`);
    const response = await fetch(formattedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000) // Don't block background workers
    });

    const finalUrl = response.url || formattedUrl;
    if (!response.ok) {
      console.warn(`Webpage fetch returned status ${response.status} for ${formattedUrl}`);
    }

    const html = await response.text();
    const meta = extractMetadata(html);
    return { ...meta, finalUrl };
  } catch (err: any) {
    console.warn("Natively crawled metadata exception:", err.message || err);
    return { title: "", description: "", textSnippet: "", finalUrl: url };
  }
}
