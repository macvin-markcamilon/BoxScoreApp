import { NextRequest, NextResponse } from "next/server";

interface RoomState {
  roomCode: string;
  camName: string;
  devicePlatform: "iphone" | "android";
  offerSdp?: RTCSessionDescriptionInit | null;
  offerId?: string;
  answerSdp?: RTCSessionDescriptionInit | null;
  answerForOfferId?: string;
  phoneCandidates: RTCIceCandidateInit[];
  studioCandidates: RTCIceCandidateInit[];
  latestFrameDataUrl?: string;
  latestFrameTs?: number;
  studioReadyTs?: number;
  phoneJoinedTs?: number;
  updatedAt: number;
}

const globalForWireless = globalThis as unknown as {
  __boxscoreWirelessRooms?: Map<string, RoomState>;
};

function getRoomsMap(): Map<string, RoomState> {
  if (!globalForWireless.__boxscoreWirelessRooms) {
    globalForWireless.__boxscoreWirelessRooms = new Map<string, RoomState>();
  }
  return globalForWireless.__boxscoreWirelessRooms;
}

function getOrCreateRoom(roomCode: string): RoomState {
  const clean = roomCode.trim().toUpperCase();
  const map = getRoomsMap();
  // Prune stale rooms older than 2 hours
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (now - v.updatedAt > 2 * 60 * 60 * 1000) {
      map.delete(k);
    }
  }
  let room = map.get(clean);
  if (!room) {
    room = {
      roomCode: clean,
      camName: "Mobile Cam",
      devicePlatform: "iphone",
      phoneCandidates: [],
      studioCandidates: [],
      updatedAt: now,
    };
    map.set(clean, room);
  }
  return room;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomCode = (searchParams.get("room") || "").trim().toUpperCase();
  const role = searchParams.get("role") || "studio";
  if (!roomCode) {
    return NextResponse.json({ ok: false, error: "Missing room" }, { status: 400 });
  }

  const room = getOrCreateRoom(roomCode);
  if (role === "studio") {
    room.studioReadyTs = Date.now();
  }

  return NextResponse.json({
    ok: true,
    roomCode: room.roomCode,
    camName: room.camName,
    devicePlatform: room.devicePlatform,
    offerSdp: room.offerSdp || null,
    offerId: room.offerId || null,
    answerSdp: room.answerSdp || null,
    answerForOfferId: room.answerForOfferId || null,
    phoneCandidates: room.phoneCandidates,
    studioCandidates: room.studioCandidates,
    latestFrameDataUrl: role === "studio" ? room.latestFrameDataUrl || null : null,
    latestFrameTs: room.latestFrameTs || 0,
    studioReadyTs: room.studioReadyTs || 0,
    phoneJoinedTs: room.phoneJoinedTs || 0,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action:
        | "phone_join"
        | "studio_ready"
        | "offer"
        | "answer"
        | "phone_ice"
        | "studio_ice"
        | "frame";
      roomCode?: string;
      camName?: string;
      devicePlatform?: "iphone" | "android";
      sdp?: RTCSessionDescriptionInit;
      offerId?: string;
      candidate?: RTCIceCandidateInit;
      frameDataUrl?: string;
    };

    const roomCode = (body.roomCode || "").trim().toUpperCase();
    if (!roomCode) {
      return NextResponse.json({ ok: false, error: "Missing roomCode" }, { status: 400 });
    }

    const room = getOrCreateRoom(roomCode);
    room.updatedAt = Date.now();

    if (body.camName) room.camName = body.camName;
    if (body.devicePlatform === "android" || body.devicePlatform === "iphone") {
      room.devicePlatform = body.devicePlatform;
    }

    switch (body.action) {
      case "phone_join": {
        room.phoneJoinedTs = Date.now();
        break;
      }
      case "studio_ready": {
        room.studioReadyTs = Date.now();
        break;
      }
      case "offer": {
        if (body.sdp) {
          room.offerSdp = body.sdp;
          room.offerId = body.offerId || `${Date.now()}`;
          room.answerSdp = null;
          room.answerForOfferId = undefined;
          room.phoneCandidates = [];
          room.studioCandidates = [];
        }
        break;
      }
      case "answer": {
        if (body.sdp) {
          room.answerSdp = body.sdp;
          room.answerForOfferId = body.offerId || room.offerId;
        }
        break;
      }
      case "phone_ice": {
        if (body.candidate && room.phoneCandidates.length < 60) {
          room.phoneCandidates.push(body.candidate);
        }
        break;
      }
      case "studio_ice": {
        if (body.candidate && room.studioCandidates.length < 60) {
          room.studioCandidates.push(body.candidate);
        }
        break;
      }
      case "frame": {
        if (body.frameDataUrl) {
          room.latestFrameDataUrl = body.frameDataUrl;
          room.latestFrameTs = Date.now();
          room.phoneJoinedTs = Date.now();
        }
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      roomCode: room.roomCode,
      offerId: room.offerId || null,
      answerSdp: room.answerSdp || null,
      answerForOfferId: room.answerForOfferId || null,
      studioCandidates: room.studioCandidates,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 }
    );
  }
}
