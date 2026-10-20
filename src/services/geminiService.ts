import { Message } from "../types";

export async function chatWithClips(
  messages: Message[],
  clipsContent: string,
  containerType: 'author' | 'topic' = 'topic'
): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      clipsContent,
      containerType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to communicate with VideoExplainer assistant.");
  }

  const data = await response.json();
  return data.response;
}

export async function chatWithClipsStream(
  messages: Message[],
  clipsContent: string,
  containerType: 'author' | 'topic' = 'topic',
  onChunk: (chunk: string) => void
): Promise<string> {
  const response = await fetch("/api/chat-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      clipsContent,
      containerType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to communicate with VideoExplainer assistant." }));
    throw new Error(errorData.error || "Failed to communicate with VideoExplainer assistant.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is empty or not supported.");
  }

  const decoder = new TextDecoder("utf-8");
  let fullText = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    onChunk(chunk);
  }
  
  return fullText;
}

export async function processSocialMediaLink(
  url: string
): Promise<{ title: string; transcript: string }> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to analyze link. Please insert transcript manually or verify standard captions.");
  }

  return response.json();
}

export async function transcribeMediaFile(
  fileName: string,
  base64Data: string,
  mimeType: string,
  question?: string
): Promise<{ title: string; transcript: string; instantAnswer?: string }> {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName,
      base64Data,
      mimeType,
      question,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Media file transcription failed.");
  }

  return response.json();
}
