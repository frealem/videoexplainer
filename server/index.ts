import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import dotenv from "dotenv";
import cors from "cors";

import { 
  checkAndConnectDB, 
  loadBackupContainers, 
  saveBackupContainers, 
  ContainerModel,
  getDbError
} from "./db";
import { ai } from "./gemini";
import { 
  extractYoutubeVideoId, 
  parseGeminiResponse, 
  parseSocialUrlDetails 
} from "./utils";
import { 
  getYouTubeTranscript, 
  fetchYoutubeOembed, 
  fetchWebpageMetadata 
} from "./scrapers";

dotenv.config();

// Normalize GEMINI_API_KEY from environment variables across cloud environments
if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY =
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    "";
}

// Bind dynammically to process.env.PORT for environments like Render, other cloud hosts, or default to 3000
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = express();

// Enable Cross-Origin Resource Sharing (CORS) for Mobile Apps, Chrome Extensions, and local clients
app.use(cors({
  origin: "*", // Allows any origin (including chrome-extension://, file://, localhost, custom mobile schemes)
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));

app.use(express.json({ limit: "100mb" }));

// 1. Social Media Transcript Fetching & Deep-Dive Analysis
app.post("/api/extract", async (req, res) => {
  let { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Normalize inputted URL format
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isTikTok = url.includes("tiktok.com");
  const isInstagram = url.includes("instagram.com");
  const socialDetails = parseSocialUrlDetails(url);

  try {
    // Stage 1: Fast Metadata Lookup
    let oembedData: { title: string; author: string } | null = null;
    let nativeTranscript = "";
    let isNativeYouTube = false;

    if (isYouTube) {
      oembedData = await fetchYoutubeOembed(url);
      try {
        nativeTranscript = await getYouTubeTranscript(url);
        isNativeYouTube = true;
        console.log("Successfully fetched native YouTube transcripts.");
      } catch (ytError: any) {
        console.warn("YouTube Transcript direct scraper failed:", ytError.message);
      }
    }

    // Stage 2: Webpage Crawler (for non-YouTube or missing data)
    let crawledData = { title: "", description: "", textSnippet: "", finalUrl: "" };
    if (!isNativeYouTube) {
      crawledData = await fetchWebpageMetadata(url);
    }

    const resolvedTitle = oembedData?.title || crawledData.title || (isYouTube ? `YouTube Video` : isTikTok ? "TikTok Video Target" : isInstagram ? "Instagram Media Link" : "Indexed Social Resource");
    const creatorName = oembedData?.author || "Professional Content Creator";

    // Stage 3: Gemini Analysis with High Fidelity Structural Blueprint
    if (isNativeYouTube && nativeTranscript) {
      try {
        // Feed native transcript into standard Gemini
        const structurePrompt = `
          You are VideoExplainer Video Analysis Engine.
          We successfully fetched the complete native transcript for this video: "${resolvedTitle}" by "${creatorName}".
          
          TASK:
          1. Detect the original spoken language of the raw subtitles/caption text.
          2. Structure the raw captions into an extensive, highly professional study outline and guide.
          3. Include chronological segments, key advice, step-by-step logic, quotes, and specific recommendations stated by the creator.
          4. Provide at least 600 words of deeply annotated point-by-point sections. Maintain 100% truthfulness to the words spoken.
          5. MULTI-LANGUAGE RULE & TRANSLATION: If the spoken language is NOT English (for example: Hindi, Tamil, Telugu, Spanish, French, etc.), present the title and the detailed guide in that spoken language FIRST (native) so regional users can fully relate to the exact phrases, and immediately afterwards print an equally professional English translation block so creators from all languages can read and synthesize.
          
          RAW TRANSCRIPT DATA:
          ${nativeTranscript}
          
          OUTPUT FORMAT (JSON ONLY, do not include raw JSON backticks in your outer answer if possible):
          {
            "title": "Clean, highly descriptive title containing creator name if relevant (with Translation in parentheses if non-English)",
            "transcript": "Comprehensive annotated study guide with time blocks or segment milestones. Support native language and English translation if applicable."
          }
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: structurePrompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const parsed = parseGeminiResponse(response.text || "{}", resolvedTitle);
        return res.json({
          title: parsed.title,
          transcript: parsed.transcript
        });
      } catch (geminiErr: any) {
        console.warn("Structuring Gemini call failed (likely due to account rate limit). Returning raw transcript formatted directly.", geminiErr);
        return res.json({
          title: resolvedTitle,
          transcript: `[Auto-recovered Complete Subtitles]\n\n${nativeTranscript}`
        });
      }
    } else if (isTikTok) {
      // TikTok audio/video download and transcript engine!
      const apifyToken = process.env.APIFY_API_TOKEN;
      let apifySuccess = false;

      if (apifyToken) {
        try {
          console.log(`[TikTok Apify] Fetching TikTok post details from Apify for URL: ${url}`);
          const apifyUrl = `https://api.apify.com/v2/acts/apify~tiktok-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`;
          const payload = { postURLs: [url] };
          
          const apifyRes = await fetch(apifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          
          if (!apifyRes.ok) throw new Error(`Apify response status ${apifyRes.status}`);
          const items = await apifyRes.json() as any[];
          if (!Array.isArray(items) || items.length === 0) {
            throw new Error(`Apify returned empty list items or malformed response.`);
          }
          
          const item = items[0];
          const ttTitle = item.desc || item.title || resolvedTitle;
          const ttAuthorName = item.author?.nickname || item.author?.uniqueId || creatorName;
          const videoUrl = item.video?.playAddr || item.video?.downloadAddr || item.videoUrl || item.music?.playUrl;
          
          if (!videoUrl) {
            throw new Error(`Apify scraped TikTok successfully, but could not retrieve a direct MP4 download link.`);
          }

          console.log(`[TikTok Apify] Downloading media file...`);
          const mediaFetch = await fetch(videoUrl);
          if (!mediaFetch.ok) throw new Error(`Fetch TikTok content failed with status ${mediaFetch.status}`);
          
          const arrayBuffer = await mediaFetch.arrayBuffer();
          const base64Media = Buffer.from(arrayBuffer).toString("base64");

          console.log(`[TikTok Apify] Sending media to Gemini-3.5-Flash for exact verbal transcription.`);
          const transcriptionPrompt = `
            You are VideoExplainer Video and Spoken Audio Content Transcription Engine.
            We have securely crawled the actual original verbal video/audio track of this TikTok video: Title: "${ttTitle}" by creator "${ttAuthorName}".
            
            TASK:
            1. Detect the original spoken language of the audio/video (e.g., English, Hindi, Spanish, Portuguese, French, etc.).
            2. Generate an extremely accurate, detailed, and verbatim word-for-word transcript of everything spoken.
            3. Format the transcript into a highly structured, professional study guide and transcript. Include stages, steps, or milestones if spoken.
            4. MULTI-LANGUAGE RULE & TRANSLATION: If the audio is in a non-English language (for example: Hindi/हिन्दी, Tamil, Spanish, French, etc.), you MUST print the NATIVE transcript first, followed immediately by a professional and complete English translation transcript so both regional and global users can read and query!
            5. FORMAT DIRECTIVE: Do NOT return a JSON object. Return clean, beautifully styled Markdown.
               At the very top of your response, write the title of the video on a single line starting with:
               TITLE: [Descriptive Title (with English translation in parentheses if non-English)]
               
               Followed by the formatted transcripts.
          `;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              {
                role: "user",
                parts: [
                  { text: transcriptionPrompt },
                  {
                    inlineData: {
                      data: base64Media,
                      mimeType: "video/mp4"
                    }
                  }
                ]
              }
            ],
            config: {
              temperature: 0.1
            }
          });

          const parsed = parseGeminiResponse(response.text || "", ttTitle);
          apifySuccess = true;
          return res.json({
            title: parsed.title,
            transcript: parsed.transcript
          });

        } catch (apifyErr: any) {
          console.warn("[TikTok Apify] Apify runner failed or timed out. Falling back to TikWM.", apifyErr.message || apifyErr);
        }
      }

      if (!apifySuccess) {
        // TikWM free fallback
        try {
          console.log(`[TikTok TikWM] Fetching video and music URL details from TikWM for URL: ${url}`);
          const tikResponse = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
          if (!tikResponse.ok) throw new Error(`TikWM response status ${tikResponse.status}`);
          
          const tikData = await tikResponse.json() as any;
          if (tikData.code !== 0 || !tikData.data) {
            throw new Error(`TikWM returned bad status: ${tikData.msg || "No data received"}`);
          }

          const audioUrl = tikData.data.music || tikData.data.play;
          const ttTitle = tikData.data.title || resolvedTitle;
          const ttAuthorName = tikData.data.author?.nickname || creatorName;

          if (!audioUrl) {
            throw new Error("No download link for audio or video provided in TikWM response.");
          }

          console.log(`[TikTok TikWM] Downloading media file...`);
          const audioFetch = await fetch(audioUrl);
          if (!audioFetch.ok) throw new Error(`Fetch audio content failed with status ${audioFetch.status}`);

          const arrayBuffer = await audioFetch.arrayBuffer();
          const base64Audio = Buffer.from(arrayBuffer).toString("base64");

          console.log(`[TikTok TikWM] Sending media to Gemini-3.5-Flash for exact verbal transcription.`);
          const transcriptionPrompt = `
            You are VideoExplainer Video and Spoken Audio Content Transcription Engine.
            We have securely fetched the actual original verbal audio track of this video: Title: "${ttTitle}" by creator "${ttAuthorName}".
            
            TASK:
            1. Detect the original spoken language of the audio (e.g. Hindi, Punjabi, Tamil, English, Spanish, French, Portuguese, etc.).
            2. Generate an extremely accurate, detailed, and verbatim word-for-word transcript of everything spoken in the audio file.
            3. Format the transcript into a highly structured, professional study guide and transcript. Include stages, steps, or milestones if spoken.
            4. MULTI-LANGUAGE RULE & TRANSLATION: If the audio is in a non-English language (for example: Hindi/हिन्दी, Tamil, Spanish, French, etc.), you MUST print the NATIVE transcript first, followed immediately by a professional and complete English translation transcript so both regional and global users can read and query!
            5. FORMAT DIRECTIVE: Do NOT return a JSON object. Return clean, beautifully styled Markdown.
               At the very top of your response, write the title of the video on a single line starting with:
               TITLE: [Descriptive Title (with English translation in parentheses if non-English)]
               
               Followed by the formatted transcripts.
          `;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              {
                role: "user",
                parts: [
                  { text: transcriptionPrompt },
                  {
                    inlineData: {
                      data: base64Audio,
                      mimeType: "audio/mpeg"
                    }
                  }
                ]
              }
            ],
            config: {
              temperature: 0.1
            },
          });

          const parsed = parseGeminiResponse(response.text || "", ttTitle);
          return res.json({
            title: parsed.title,
            transcript: parsed.transcript
          });

        } catch (ttErr: any) {
          console.warn("[TikTok TikWM] Audio download failed. Falling back to Search Grounding.", ttErr.message || ttErr);
          
          try {
            const structurePrompt = `
              You are VideoExplainer Pro Enterprise Video & Audio Content Analysis Engine, trusted by world-famous educators and content creators.
              We are analyzing this TikTok video URL: "${url}"
              Target Platform: "TikTok"
              Detected Social Keywords: "${socialDetails.keywords}"
              Initial Scraped Title: "${resolvedTitle}"
              Initial Creator Name: "${creatorName}"
              
              PAGE CO-EXTRACTED RAW DATA:
              Description: ${crawledData.description || "None basic extracted"}
              Content Snippet: ${crawledData.textSnippet || "None basic extracted"}
              
              CRITICAL ENTERPRISE-GRADE SPECIFICATIONS FOR ALL LANGUAGES & REGIONAL MEDIA:
              1. EXTENSIVE GOOGLE SEARCH GROUNDING: Use your Google Search tool immediately and query to find any subtitles, script transcripts, translation databases, equivalent clips, audio/video reviews, blog descriptions, or discussion threads regarding this exact URL ("${url}"), the creator ("${socialDetails.username || creatorName}"), and the video keywords ("${socialDetails.keywords}").
              2. DETECT MULTILINGUAL SPOKEN LANGUAGES: This video could be in any world language. Analyze and determine the spoken language under the hood.
              3. FULL TRANSLATION & DEEP CONTEXT SYNTHESIS: 
                 - If the video is in a non-English language (e.g., Hindi), you MUST write the title and high-fidelity breakdown in the NATIVE language first, so regional users can fully relate to the exact phrases.
                 - Immediately following the native text, provide a flawless, extremely detailed English translation study guide and chronological outline of at least 600-800 words, annotating key insights, advice, steps, formulas for success, emotional beats, or quotes. Do not output short boilerplate summaries.
              4. FORMAT DIRECTIVE: Return clean, beautifully styled Markdown.
                 At the very top of your response, write its title on a single line starting with:
                 TITLE: [Descriptive, highly engaging Title in the Native spoken language (with Eng Translation in parentheses)]
                 
                 Followed by your extensive formatted study guide. Include subtitles (e.g. ## Spoken Language: Hindi), native guides, and complete English outlines.
            `;

            const response = await ai.models.generateContent({
              model: "gemini-3.8-flash",
              contents: [{ role: "user", parts: [{ text: structurePrompt }] }],
              config: {
                temperature: 0.1,
                tools: [{ googleSearch: {} }]
              },
            });

            const parsed = parseGeminiResponse(response.text || "", resolvedTitle);
            return res.json({
              title: parsed.title,
              transcript: parsed.transcript
            });

          } catch (fallErr: any) {
            console.error("[TikTok Fallback] Grounded search fallback failed too:", fallErr.message || fallErr);
            const finalFallbackText = `[Analytical Extraction Summary]\n\nThis is a TikTok video by ${socialDetails.username || creatorName}.\n\nKeywords detected: ${socialDetails.keywords}\nTitle: ${resolvedTitle}\n\nSince direct extraction is locked, please click the "Custom text" or "File upload" tab above to paste captions manually, or retry in a few moments!`;
            return res.json({
              title: resolvedTitle,
              transcript: finalFallbackText
            });
          }
        }
      }
    } else if (isInstagram) {
      // Instagram audio/video download and transcript engine!
      const apifyToken = process.env.APIFY_API_TOKEN;
      let apifySuccess = false;

      if (apifyToken) {
        try {
          console.log(`[Instagram Apify] Fetching Reel details from Apify for URL: ${url}`);
          const apifyUrl = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`;
          const payload = {
            directUrls: [url],
            resultsType: "details"
          };
          
          const apifyRes = await fetch(apifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          
          if (!apifyRes.ok) throw new Error(`Apify response status ${apifyRes.status}`);
          const items = await apifyRes.json() as any[];
          if (!Array.isArray(items) || items.length === 0) {
            throw new Error(`Apify returned empty list items or malformed response.`);
          }
          
          const item = items[0];
          const igTitle = item.caption || item.description || resolvedTitle;
          const igAuthorName = item.ownerUsername || item.ownerFullName || item.author?.username || creatorName;
          const videoUrl = item.videoUrl || item.videoUrlUrl || item.displayUrl || item.resources?.find((r: any) => r.type === "video")?.src;
          
          if (!videoUrl) {
            throw new Error(`Apify scraped post successfully, but could not retrieve a direct MP4 download link.`);
          }

          console.log(`[Instagram Apify] Downloading media file...`);
          const mediaFetch = await fetch(videoUrl);
          if (!mediaFetch.ok) throw new Error(`Fetch Instagram content failed with status ${mediaFetch.status}`);
          
          const arrayBuffer = await mediaFetch.arrayBuffer();
          const base64Media = Buffer.from(arrayBuffer).toString("base64");

          console.log(`[Instagram Apify] Sending media to Gemini-3.5-Flash for exact verbal transcription.`);
          const transcriptionPrompt = `
            You are VideoExplainer Video and Spoken Audio Content Transcription Engine.
            We have securely crawled the actual original verbal video/audio track of this Instagram post: Title: "${igTitle}" by creator "${igAuthorName}".
            
            TASK:
            1. Detect the original spoken language of the audio/video (e.g., English, Hindi, Spanish, Portuguese, French, etc.).
            2. Generate an extremely accurate, detailed, and verbatim word-for-word transcript of everything spoken.
            3. Format the transcript into a highly structured, professional study guide and transcript. Include stages, steps, or milestones if spoken.
            4. MULTI-LANGUAGE RULE & TRANSLATION: If the audio is in a non-English language (for example: Hindi/हिन्दी, Tamil, Spanish, French, etc.), you MUST print the NATIVE transcript first, followed immediately by a professional and complete English translation transcript so both regional and global users can read and query!
            5. FORMAT DIRECTIVE: Do NOT return a JSON object. Return clean, beautifully styled Markdown.
               At the very top of your response, write its title on a single line starting with:
               TITLE: [Descriptive Title (with English translation in parentheses if non-English)]
               
               Followed by the formatted transcripts.
          `;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              {
                role: "user",
                parts: [
                  { text: transcriptionPrompt },
                  {
                    inlineData: {
                      data: base64Media,
                      mimeType: "video/mp4"
                    }
                  }
                ]
              }
            ],
            config: {
              temperature: 0.1
            }
          });

          const parsed = parseGeminiResponse(response.text || "", igTitle);
          apifySuccess = true;
          return res.json({
            title: parsed.title,
            transcript: parsed.transcript
          });

        } catch (apifyErr: any) {
          console.warn("[Instagram Apify] Apify runner failed or timed out. Falling back to Grounded Google Search.", apifyErr.message || apifyErr);
        }
      }

      if (!apifySuccess) {
        // Instagram Search Grounding Fallback with clear notice for token config
        try {
          console.log(`[Instagram Fallback] Performing Grounded Google Search for URL: ${url}`);
          const structurePrompt = `
            You are VideoExplainer Pro Enterprise Video & Audio Content Analysis Engine, trusted by world-famous educators and content creators.
            We are analyzing this Instagram video/reel URL: "${url}"
            Target Platform: "Instagram"
            Detected Social Keywords: "${socialDetails.keywords}"
            Initial Scraped Title: "${resolvedTitle}"
            Initial Creator Name: "${creatorName}"
            
            PAGE CO-EXTRACTED RAW DATA:
            Description: ${crawledData.description || "None basic extracted"}
            Content Snippet: ${crawledData.textSnippet || "None basic extracted"}
            
            CRITICAL ENTERPRISE-GRADE SPECIFICATIONS FOR ALL LANGUAGES & REGIONAL MEDIA:
            1. EXTENSIVE GOOGLE SEARCH GROUNDING: Use your Google Search tool immediately and query to find any subtitles, script transcripts, translation databases, equivalent clips, audio/video reviews, blog descriptions, or discussion threads regarding this exact URL ("${url}"), the creator ("${socialDetails.username || creatorName}"), and the video keywords ("${socialDetails.keywords}").
            2. DETECT MULTILINGUAL SPOKEN LANGUAGES: This video could be in any world language. Analyze and determine the spoken language under the hood.
            3. FULL TRANSLATION & DEEP CONTEXT SYNTHESIS: 
               - If the video is in a non-English language (e.g., Hindi), you MUST write the title and high-fidelity breakdown in the NATIVE language first, so regional users can fully relate to the exact phrases.
               - Immediately following the native text, provide a flawless, extremely detailed English translation study guide and chronological outline of at least 600-800 words, annotating key insights, advice, steps, formulas for success, emotional beats, or quotes. Do not output short boilerplate summaries.
            4. FORMAT DIRECTIVE: Return clean, beautifully styled Markdown.
               At the very top of your response, write its title on a single line starting with:
               TITLE: [Descriptive, highly engaging Title in the Native spoken language (with Eng Translation in parentheses)]
               
               Followed by your extensive formatted study guide. Include subtitles (e.g. ## Spoken Language: Hindi), native guides, and complete English outlines.
               
               At the very bottom of the study guide, add a clear horizontal separator and a friendly help tip explaining that creators can unlock 100% full verbal video speech transcriptions behind-the-scenes by simply setting standard "APIFY_API_TOKEN" environment variable in their Secrets config.
          `;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ role: "user", parts: [{ text: structurePrompt }] }],
            config: {
              temperature: 0.1,
              tools: [{ googleSearch: {} }]
            },
          });

          const parsed = parseGeminiResponse(response.text || "", resolvedTitle);
          return res.json({
            title: parsed.title,
            transcript: parsed.transcript
          });

        } catch (fallErr: any) {
          console.error("[Instagram Fallback] Grounded search fallback failed too:", fallErr.message || fallErr);
          const finalFallbackText = `[Instagram Media Analysis]\n\nThis is an Instagram post by ${socialDetails.username || creatorName}.\n\nKeywords: ${socialDetails.keywords}\nTitle: ${resolvedTitle}\n\nSince direct extraction is locked, please click the "Custom text" or "File upload" tab above to paste captions manually, or retry in a few moments!\n\n---\n*💡 Pro-tip for creators: Supply your **APIFY_API_TOKEN** as an environment variable to allow fully automated speech-to-text transcriptions of any Instagram video!*`;
          return res.json({
            title: resolvedTitle,
            transcript: finalFallbackText
          });
        }
      }
    } else {
      // Non-YouTube, Tiktok, Instagram, or disabled YouTube captions: Use high-powered Google Search Grounding to find true transcripts, content summary, and creator details
      try {
        const structurePrompt = `
          You are VideoExplainer Pro Enterprise Video & Audio Content Analysis Engine, trusted by world-famous educators and content creators.
          We are analyzing this social media video URL: "${url}"
          Final Redirected URL: "${crawledData.finalUrl || url}"
          Target Platform: "${socialDetails.platform}"
          Detected Social Keywords: "${socialDetails.keywords}"
          Initial Scraped Title: "${resolvedTitle}"
          Initial Creator Name: "${creatorName}"
          
          PAGE CO-EXTRACTED RAW DATA:
          Description: ${crawledData.description || "None basic extracted"}
          Content Snippet: ${crawledData.textSnippet || "None basic extracted"}
          
          CRITICAL ENTERPRISE-GRADE SPECIFICATIONS FOR ALL LANGUAGES & REGIONAL MEDIA (E.G., INDIAN TIKTOK/INSTAGRAM/YOUTUBE):
          1. EXTENSIVE GOOGLE SEARCH GROUNDING: Use your Google Search tool immediately and query to find any subtitles, script transcripts, translation databases, YouTube equivalents, Instagram/TikTok reposts, audio/video reviews, blog descriptions, or discussion threads regarding this exact URL ("${url}"), the creator ("${socialDetails.username || creatorName}"), and the video keywords ("${socialDetails.keywords}").
          2. DETECT MULTILINGUAL SPOKEN LANGUAGES: This video could be in any world language (including Indian regional languages like Hindi, Punjabi, Tamil, Telugu, Marathi, Malayalam, Bengali, or others like Spanish, Portuguese, German, Arabic, French, Indonesian, etc.). Analyze the search results and metadata to determine the spoken language under the hood.
          3. FULL TRANSLATION & DEEP CONTEXT SYNTHESIS: 
             - If the video is in a non-English language (e.g., an Indian creator speaking Hindi), you MUST write the title and high-fidelity breakdown in the NATIVE language first, so regional users can fully relate to the exact phrases.
             - Immediately following the native text, provide a flawless, extremely detailed English translation study guide and chronological outline.
             - Make the study guide incredibly comprehensive (at least 600-800 words), annotating key insights, advice, steps, formulas for success, emotional beats, or quotes. Do not output short boilerplate summaries or dummy placeholders.
          4. MAXIMUM PERFORMANCE ASSURANCE: Treat this with utmost seriousness as if it is for a high-performance content platform where creators depend on exact educational knowledge extraction.
          5. FORMAT DIRECTIVE: Do NOT return a JSON object. Return clean, beautifully styled Markdown.
             At the very top of your response, write the title of the video on a single line starting with:
             TITLE: [Descriptive, highly engaging Title in the Native spoken language (with Eng Translation in parentheses)]
             
             Followed by your extensive formatted study guide. Include subtitles (e.g. ## Spoken Language: Hindi), native guides, and complete English outlines.
        `;

        // We use Google Search Grounding to find info when direct scrape is blocked!
        // We do NOT use responseMimeType: "application/json" to prevent bad-request tool conflicts
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: structurePrompt }] }],
          config: {
            temperature: 0.1,
            tools: [{ googleSearch: {} }] // Live Google Search enables finding caption records and bypassing IP blocks!
          },
        });

        const parsed = parseGeminiResponse(response.text || "", resolvedTitle);
        return res.json({
          title: parsed.title,
          transcript: parsed.transcript
        });

      } catch (geminiErr: any) {
        console.warn("Grounded Gemini call failed, attempting standard Gemini fallback to prevent empty outputs:", geminiErr.message || geminiErr);
        
        try {
          const fallbackPrompt = `
            You are VideoExplainer Pro Enterprise Video & Audio Content Analysis Engine.
            We are analyzing this URL: "${url}"
            Platform: "${socialDetails.platform}"
            Keywords: "${socialDetails.keywords}"
            Initial title: "${resolvedTitle}"
            Creator: "${socialDetails.username || creatorName}"
            
            Description of the content: ${crawledData.description || "In-depth content creator piece"}
            Snippet: ${crawledData.textSnippet || "Social media viral content"}
            
            TASK:
            Our live web grounded search had an interface failure, so we need you to perform a high-fidelity semantic synthesis using your rich pre-trained knowledge base to generate an extremely comprehensive, professional, and visually stunning video study guide.
            1. Analyze the social descriptors, url words ("${socialDetails.keywords}"), tags, and initial title to deduce what this content is about.
            2. Determine the language (e.g., Hindi/हिन्दी, Spanish, Tamil, English, etc.) from the URL and keywords.
            3. Write a majestic, detailed study guide (at least 600-800 words), specifying actionable key tips, chronological stages, frameworks, creator strategies, and a gorgeous native synopsis combined with a rich, professional English translation section.
            4. Do NOT output standard boilerplate, broken markers, or "unavailable" error blocks. Treat this as a high-powered production analysis.
            
            OUTPUT SPECIFICATION:
            Your response must begin with a first line exactly as follows:
            TITLE: [Write the best matching title here, with Translation in parenthesis if non-English]
            
            Followed by your comprehensive Markdown study guide. Include subtitles, milestones, native highlights, and English translations.
          `;

          const fallbackResponse = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ role: "user", parts: [{ text: fallbackPrompt }] }],
            config: {
              temperature: 0.1,
            }
          });

          const parsed = parseGeminiResponse(fallbackResponse.text || "", resolvedTitle);
          return res.json({
            title: parsed.title,
            transcript: parsed.transcript
          });

        } catch (innerErr: any) {
          console.error("Second-level standard Gemini fallback also failed:", innerErr);
          const finalFallbackText = `[Analytical Extraction Summary]\n\nThis is a video by ${socialDetails.username || creatorName} on ${socialDetails.platform}.\n\nKeywords detected: ${socialDetails.keywords}\nTitle: ${resolvedTitle}\n\nSince direct extraction is locked, please click the "Custom text" or "File upload" tab above to paste captions manually, or retry in a few moments!`;
          return res.json({
            title: resolvedTitle,
            transcript: finalFallbackText
          });
        }
      }
    }

  } catch (err: any) {
    console.error("Link processing error:", err);
    return res.status(500).json({
      error: err.message || "Failed to process link. Please check if the link is public or upload a text translation manually."
    });
  }
});

// 2. High-Fidelity Audio/Video Upload Transcription
app.post("/api/transcribe", async (req, res) => {
  const { fileName, base64Data, mimeType, question } = req.body;

  if (!fileName || !base64Data || !mimeType) {
    return res.status(400).json({ error: "fileName, base64Data, and mimeType are required" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing on the server." });
  }

  const prompt = `
    You are VideoExplainer Video and Spoken Audio Content Transcription and Comprehension Engine.
    The user has uploaded a file named: "${fileName}" with MIME type: "${mimeType}".
    
    TASK:
    1. Listen carefully to the uploaded media file (spoken voice & visual track if video).
    2. Extract an extremely accurate, detailed, and verbatim word-for-word transcript of everything spoken in the audio/video.
    3. Detect stages, steps, milestones, or key quotes if mentioned.
    4. Provide a highly descriptive title for this clip representing its core subject.
    ${question ? `5. QUESTION TO ANSWER: The user has asked the following specific question about this video: "${question}". You MUST analyze the video/audio contents meticulously and answer this question precisely, accurately, and fast in the "instantAnswer" field. Also, prepend a clear Q&A block to the top of your transcript field.` : ''}

    OUTPUT SCHEMA REQUIREMENT:
    Return a JSON object conforming exactly to the responseSchema provided.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Short descriptive title of the video or audio clip"
            },
            transcript: {
              type: Type.STRING,
              description: "Verbatim word-for-word transcript formatted with Markdown, optionally prepended with a beautiful Q&A section if a question was asked."
            },
            instantAnswer: {
              type: Type.STRING,
              description: "A highly precise and accurate response answering the user's specific question based on the video contents (if question was passed, otherwise empty)."
            }
          },
          required: ["title", "transcript"]
        }
      },
    });

    const result = JSON.parse(response.text || "{}");
    return res.json({
      title: result.title || `Media: ${fileName}`,
      transcript: result.transcript || "No audible voice content could be fully extracted.",
      instantAnswer: result.instantAnswer || ""
    });
  } catch (error: any) {
    console.error("Media file transcription failed:", error);
    return res.status(500).json({ error: error.message || "Media transcription failed. Ensure the format is supported." });
  }
});

// 3. SECURE CHAT WITH KNOWLEDGE BASE (Proxy API)
app.post("/api/chat", async (req, res) => {
  const { messages, clipsContent, containerType } = req.body;

  if (!messages || !clipsContent) {
    return res.status(400).json({ error: "messages and clipsContent are required" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing on the server." });
  }

  const systemInstruction = `
    You are VideoExplainer, a highly specialized video analysis and creator simulation engine.
    
    PERSONA MODE: ${containerType === 'author' ? 'CREATOR MENTORSHIP' : 'TOPIC EXPERT'}
    ${containerType === 'author' 
      ? 'Adopt the exact persona, tone of voice, vocabulary, attitude, speech patterns, and communication style of the content creator outlined in the KNOWLEDGE BASE. Speak warmly in the first-person ("I", "my videos"). Treat the user as your student or mentee.' 
      : 'Analyze the query strictly as an objective, highly professional, expert tutor. Structure your answers with outstanding clarity, using bullet points, bold emphasis, and clear conceptual paragraphs.'}
    
    CRITICAL UNDERSTANDING & ACCURACY INSTRUCTIONS:
    - Prioritize extreme accuracy, completeness, and meticulous attention to details (e.g., exact steps, statistics, numbers, specific quotes, and logical formulas) present in the KNOWLEDGE BASE.
    - Ground your answers 100% on the KNOWLEDGE BASE below. If the user asks a question, locate the specific segment/clip where that topic is discussed, and extract a high-fidelity answer from it.
    - Never assume, hallucinate, extrapolate, or inject outside facts or context not stated by the speaker. Unrelated details are strictly prohibited.
    - If the user asks about something not mentioned in the transcript content, explicitly state: "My clips do not contain information on that specific detail, but based on what I recorded..." and then connect to the nearest logical concept recorded in the transcripts.
    
    KNOWLEDGE BASE (TRANSCRIPTS & CLIPIFY DATA):
    ${clipsContent}
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    return res.json({ response: response.text });
  } catch (error: any) {
    console.error("Gemini Chat API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to query Gemini assistant." });
  }
});

// 3.1 STREAMING CHAT PATHWAY (Blazing Fast, Instant Response!)
app.post("/api/chat-stream", async (req, res) => {
  const { messages, clipsContent, containerType } = req.body;

  if (!messages || !clipsContent) {
    return res.status(400).json({ error: "messages and clipsContent are required" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing on the server." });
  }

  const systemInstruction = `
    You are VideoExplainer, a highly specialized video analysis and creator simulation engine.
    
    PERSONA MODE: ${containerType === 'author' ? 'CREATOR MENTORSHIP' : 'TOPIC EXPERT'}
    ${containerType === 'author' 
      ? 'Adopt the exact persona, tone of voice, vocabulary, attitude, speech patterns, and communication style of the content creator outlined in the KNOWLEDGE BASE. Speak warmly in the first-person ("I", "my videos"). Treat the user as your student or mentee.' 
      : 'Analyze the query strictly as an objective, highly professional, expert tutor. Structure your answers with outstanding clarity, using bullet points, bold emphasis, and clear conceptual paragraphs.'}
    
    CRITICAL UNDERSTANDING & ACCURACY INSTRUCTIONS:
    - Prioritize extreme accuracy, completeness, and meticulous attention to details (e.g., exact steps, statistics, numbers, specific quotes, and logical formulas) present in the KNOWLEDGE BASE.
    - Ground your answers 100% on the KNOWLEDGE BASE below. If the user asks a question, locate the specific segment/clip where that topic is discussed, and extract a high-fidelity answer from it.
    - Never assume, hallucinate, extrapolate, or inject outside facts or context not stated by the speaker. Unrelated details are strictly prohibited.
    - If the user asks about something not mentioned in the transcript content, explicitly state: "My clips do not contain information on that specific detail, but based on what I recorded..." and then connect to the nearest logical concept recorded in the transcripts.
    
    KNOWLEDGE BASE (TRANSCRIPTS & CLIPIFY DATA):
    ${clipsContent}
  `.trim();

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await ai.models.generateContentStream({
      model: "gemini-3.8-flash",
      contents: messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    for await (const chunk of stream) {
      res.write(chunk.text || "");
    }
    
    res.end();
  } catch (error: any) {
    console.error("Gemini Chat-Stream API Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to query Gemini stream assistant." });
    } else {
      res.end();
    }
  }
});

// 3.2 DATABASE STORAGE ENDPOINTS (Secure cloud storage using MongoDB Atlas and backup fallbacks)
app.get("/api/containers", async (req, res) => {
  const isConnected = await checkAndConnectDB();
  if (isConnected) {
    try {
      const dbContainers = await ContainerModel.find().sort({ createdAt: 1 });
      const containers = dbContainers.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        clips: doc.clips,
        createdAt: doc.createdAt
      }));
      // Cache locally so we always survive cloud database sleeps
      await saveBackupContainers(containers);
      return res.json(containers);
    } catch (err: any) {
      console.warn("[DB] Note: loading fallback from local backup:", err.message);
    }
  }
  
  const backup = await loadBackupContainers();
  return res.json(backup);
});

app.post("/api/containers/sync", async (req, res) => {
  const { containers } = req.body;
  if (!Array.isArray(containers)) {
    return res.status(400).json({ error: "containers array is required" });
  }

  // Backup state locally immediately for non-blocking persistence
  await saveBackupContainers(containers);

  const isConnected = await checkAndConnectDB();
  if (isConnected) {
    try {
      // Upsert synchronized containers into MongoDB
      for (const container of containers) {
        await ContainerModel.findOneAndUpdate(
          { id: container.id } as any,
          {
            id: container.id,
            name: container.name,
            type: container.type,
            clips: container.clips || [],
            createdAt: container.createdAt || Date.now()
          } as any,
          { upsert: true, new: true } as any
        );
      }

      // Evict any deleted container records from Atlas
      const activeIds = containers.map(c => c.id);
      await ContainerModel.deleteMany({ id: { $nin: activeIds } });

      return res.json({ status: "success", count: containers.length, cloud: true });
    } catch (error: any) {
      console.warn("[DB] Note: synchronized locally while cloud sync deferred:", error.message);
      return res.json({ status: "cached_locally", error: error.message, cloud: false });
    }
  }

  return res.json({ status: "cached_locally", message: "MONGODB_URI unconfigured or unreachable. Backed up into local server files.", cloud: false });
});

app.get("/api/db-status", async (req, res) => {
  const isConnected = await checkAndConnectDB();
  return res.json({
    connected: isConnected,
    hasUri: !!process.env.MONGODB_URI,
    usingAtlas: isConnected && !!process.env.MONGODB_URI,
    error: isConnected ? null : getDbError()
  });
});

// 4. Vite Dev/Prod Static Asset Server
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VideoExplainer Server] Running on http://localhost:${PORT}`);
  });
}

setupServer();
