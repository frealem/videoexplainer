import path from "path";
import fs from "fs";
import mongoose from "mongoose";

const BACKUP_FILE = path.join(process.cwd(), "data-backup.json");
let isDbConnected = false;
let lastDbError: string | null = null;
let lastAttemptTime = 0;
const RETRY_COOLDOWN_MS = 60 * 1000; // 60s cooldown to prevent repeated DNS/connection timeouts

// Attach error handlers to prevent unhandled mongoose connection error events
mongoose.connection.on("error", (err) => {
  console.warn("[MongoDB Atlas] Connection warning:", err?.message || err);
  isDbConnected = false;
});
mongoose.connection.on("disconnected", () => {
  isDbConnected = false;
});

export function getDbError(): string | null {
  return lastDbError;
}

// Helper to load fallback containers when cloud DB is asleep or unconfigured
export async function loadBackupContainers(): Promise<any[]> {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const data = await fs.promises.readFile(BACKUP_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("[Backup Store] Unable to parse backup local file:", err);
  }
  return [];
}

// Helper to save fallback containers
export async function saveBackupContainers(containers: any[]): Promise<void> {
  try {
    await fs.promises.writeFile(BACKUP_FILE, JSON.stringify(containers, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Backup Store] Unable to save container to local file:", err);
  }
}

// Connection setup to MongoDB Atlas with non-blocking graceful fallback
export async function checkAndConnectDB(force: boolean = false): Promise<boolean> {
  if (isDbConnected && mongoose.connection.readyState === 1) return true;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    lastDbError = null;
    return false;
  }

  const now = Date.now();
  // If recent connection failed, skip waiting on timeout to keep app fast and responsive
  if (!force && lastDbError && now - lastAttemptTime < RETRY_COOLDOWN_MS) {
    return false;
  }
  lastAttemptTime = now;

  try {
    if (mongoose.connection.readyState === 1) {
      isDbConnected = true;
      lastDbError = null;
      return true;
    }
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    isDbConnected = true;
    lastDbError = null;
    console.log("[MongoDB Atlas] Connection established successfully!");
    return true;
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    lastDbError = errorMsg;
    isDbConnected = false;
    // Log as a descriptive warning; local storage buffer smoothly persists all data
    console.warn(`[MongoDB Atlas] Cluster currently unavailable (${errorMsg}). Safe local storage active.`);
    return false;
  }
}

// Database Schemas for Collection
const ClipSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  sourceUrl: { type: String },
  createdAt: { type: Number, default: Date.now }
}, { _id: false });

const ContainerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['author', 'topic'] },
  clips: [ClipSchema],
  createdAt: { type: Number, default: Date.now }
});

export const ContainerModel = mongoose.models.Container || mongoose.model("Container", ContainerSchema);
