import { Container } from "../types";

export interface DBStatus {
  connected: boolean;
  hasUri: boolean;
  usingAtlas: boolean;
  error?: string | null;
}

export async function fetchContainers(): Promise<Container[]> {
  try {
    const response = await fetch("/api/containers");
    if (!response.ok) {
      throw new Error(`DB Server returned code: ${response.status}`);
    }
    return await response.json();
  } catch (err: any) {
    console.warn("[DB Link] Fallback loading local fallback containers, error details:", err.message || err);
    throw err;
  }
}

export async function syncContainers(containers: Container[]): Promise<{ status: string; cloud: boolean }> {
  try {
    const response = await fetch("/api/containers/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ containers }),
    });
    
    if (!response.ok) {
      throw new Error(`DB Sync returned status: ${response.status}`);
    }
    
    return await response.json();
  } catch (err: any) {
    console.warn("[DB Link] Synchronizing status notice:", err.message || err);
    return { status: "offline_failed", cloud: false };
  }
}

export async function getDBStatus(): Promise<DBStatus> {
  try {
    const response = await fetch("/api/db-status");
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("[DB Link] Fail to fetch DB state:", err);
  }
  return { connected: false, hasUri: false, usingAtlas: false };
}
