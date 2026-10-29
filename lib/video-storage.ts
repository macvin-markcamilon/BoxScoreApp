/**
 * IndexedDB Video Storage for BoxScore Broadcast Studio
 * Stores recorded game clips, replays, and metadata reliably in the browser.
 */

const DB_NAME = "BoxScoreVideoDB";
const STORE_NAME = "recorded_videos";
const DB_VERSION = 1;

export interface TimelineFrame {
  timeSec: number;
  dataUrl: string;
}

export interface StoredGameVideo {
  id: string;
  matchId: string;
  gameNumber: number;
  title: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
  createdAt: string;
  thumbnailDataUrl?: string;
  timelineFrames?: TimelineFrame[];
  homeScore?: number;
  awayScore?: number;
  homeTeamName?: string;
  awayTeamName?: string;
}

let videoDbPromise: Promise<IDBDatabase> | null = null;

function getVideoDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  if (!videoDbPromise) {
    videoDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("matchId", "matchId", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return videoDbPromise;
}

export async function saveVideoToIndexedDB(video: StoredGameVideo): Promise<void> {
  const db = await getVideoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(video);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllStoredVideos(): Promise<StoredGameVideo[]> {
  try {
    const db = await getVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as StoredGameVideo[];
        list.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getStoredVideosForMatch(matchId: string): Promise<StoredGameVideo[]> {
  try {
    const all = await getAllStoredVideos();
    return all.filter((v) => v.matchId === matchId);
  } catch {
    return [];
  }
}

export async function deleteStoredVideo(id: string): Promise<void> {
  const db = await getVideoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
