// Extract YouTube video ID from URL
export function extractYoutubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Resilient parser to recover data cleanly if JSON formatting isn't returned exactly
export function parseGeminiResponse(text: string, defaultTitle: string): { title: string; transcript: string } {
  const cleaned = text.trim();
  
  // 1. Try clean JSON parsing
  try {
    const jsonMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i) || [null, cleaned];
    const candidateStr = (jsonMatch[1] || cleaned).trim();
    if (candidateStr.startsWith("{") && candidateStr.endsWith("}")) {
      const parsed = JSON.parse(candidateStr);
      if (parsed.title || parsed.transcript) {
        return {
          title: parsed.title || defaultTitle,
          transcript: parsed.transcript || candidateStr
        };
      }
    }
  } catch (err) {
    console.warn("parseGeminiResponse JSON parse failed, falling back to regex & markdown parser:", err);
  }

  // 2. Try to regex out JSON fields if they are embedded in non-ideal ways
  try {
    const titleMatch = cleaned.match(/"title"\s*:\s*"([\s\S]*?)"\s*,?/i);
    const transcriptMatch = cleaned.match(/"transcript"\s*:\s*"([\s\S]*?)"\s*(?:\}|,|$)/i);
    if (titleMatch && transcriptMatch) {
      return {
        title: titleMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' '),
        transcript: transcriptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      };
    }
  } catch (e) {}

  // 3. Fallback to parsing as Markdown headers or plaintext
  let title = defaultTitle;
  let remainingText = cleaned;

  // Look for TITLE: or # Title lines
  const mdTitleMatch = cleaned.match(/^(?:#+\s*Title|Title|Topic|Name)[:\-]?\s*(.*)$/mi);
  if (mdTitleMatch && mdTitleMatch[1]) {
    title = mdTitleMatch[1].replace(/[*_"`]/g, '').trim();
    remainingText = cleaned.replace(mdTitleMatch[0], "").trim();
  } else {
    // Check if the very first line starts with a Markdown heading
    const firstLineMatch = cleaned.match(/^#+\s*(.*)$/m);
    if (firstLineMatch && firstLineMatch[1]) {
      title = firstLineMatch[1].replace(/[*_"`]/g, '').trim();
      remainingText = cleaned.replace(firstLineMatch[0], "").trim();
    }
  }

  // Clean trailing curly brackets and quotes from raw json leftovers
  if (remainingText.startsWith(`"transcript":`)) {
    remainingText = remainingText.replace(/^"transcript":\s*/, "").trim();
  }
  if (remainingText.endsWith("}") && !remainingText.includes("{")) {
    remainingText = remainingText.slice(0, -1).trim();
  }
  if (remainingText.startsWith('"') && remainingText.endsWith('"')) {
    remainingText = remainingText.slice(1, -1).trim();
  }

  // Unescape standard JSON string escapes if present
  remainingText = remainingText.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\t/g, "\t");

  return {
    title: title || defaultTitle,
    transcript: remainingText || cleaned
  };
}

export function parseSocialUrlDetails(url: string): { platform: string; username: string; videoId: string; keywords: string; cleanQuery: string } {
  const normalized = url.toLowerCase();
  let platform = "Web Resource";
  let username = "";
  let videoId = "";
  const keywordsArr: string[] = [];

  if (normalized.includes("tiktok.com")) {
    platform = "TikTok";
    const usernameMatch = url.match(/@([a-zA-Z0-9_\-\.]+)/);
    if (usernameMatch) username = "@" + usernameMatch[1];
    const videoIdMatch = url.match(/video\/(\d+)/);
    if (videoIdMatch) videoId = videoIdMatch[1];
  } else if (normalized.includes("instagram.com")) {
    platform = "Instagram";
    const reelMatch = url.match(/(?:p|reel|tv)\/([a-zA-Z0-9_\-]+)/);
    if (reelMatch) videoId = reelMatch[1];
  } else if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    platform = "YouTube";
    videoId = extractYoutubeVideoId(url) || "";
  }

  // Parse path slug descriptive words (e.g. viral_clip_hindi) and split them
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    for (const segment of segments) {
      if (segment.startsWith("@") || /^\d+$/.test(segment)) continue;
      // split by dashes, underscores, and dots
      const bits = segment.split(/[\-_\.\+%\s\/]+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
      keywordsArr.push(...bits);
    }
    // Also include text query parameter keys
    parsedUrl.searchParams.forEach((val, key) => {
      if (["q", "text", "caption", "title", "query", "share_app_id"].includes(key)) {
        const bits = val.split(/[\-_\.\+%\s\/]+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
        keywordsArr.push(...bits);
      }
    });
  } catch (e) {
    console.warn("Failed parsing URL in keyword extractor helper:", e);
  }

  // Deduplicate discovered descriptive tags
  const uniqueTags = Array.from(new Set(keywordsArr.map(k => k.trim()).filter(Boolean)));
  
  let keywords = "";
  if (platform !== "Web Resource") {
    keywords = `${platform} video ${username} ${videoId} ${uniqueTags.join(" ")}`.trim();
  } else {
    keywords = url.replace(/https?:\/\/(www\.)?/, "").replace(/\/.*/, "") + " " + uniqueTags.join(" ");
  }

  const cleanQuery = `${platform} ${username || "Creator"} video ${uniqueTags.join(" ")}`.trim();

  return { platform, username, videoId, keywords, cleanQuery };
}
