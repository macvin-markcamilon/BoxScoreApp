import { NextRequest, NextResponse } from "next/server";

interface RoomState {
  roomCode: string;
  camName: string;
  devicePlatform: "iphone" | "android";
  zoomLevel: number;
  offerSdp?: RTCSessionDescriptionInit | null;
  offerId?: string;
  offerTimestamp?: number;
  answerSdp?: RTCSessionDescriptionInit | null;
  answerForOfferId?: string;
  phoneCandidates: RTCIceCandidateInit[];
  studioCandidates: RTCIceCandidateInit[];
  latestFrameDataUrl?: string;
  latestFrameTs?: number;
  studioReadyTs?: number;
  phoneJoinedTs?: number;
  isOnAir?: boolean;
  isInPreview?: boolean;
  liveSceneName?: string;
  previewSceneName?: string;
  updatedAt: number;
}

interface GlobalStudioTally {
  onAirRoomCodes: string[];
  previewRoomCodes: string[];
  liveSceneName: string;
  previewSceneName: string;
  updatedAt: number;
}

const globalForWireless = globalThis as unknown as {
  __boxscoreWirelessRooms?: Map<string, RoomState>;
  __boxscoreWirelessTally?: GlobalStudioTally;
};

function getRoomsMap(): Map<string, RoomState> {
  if (!globalForWireless.__boxscoreWirelessRooms) {
    globalForWireless.__boxscoreWirelessRooms = new Map<string, RoomState>();
  }
  return globalForWireless.__boxscoreWirelessRooms;
}

function getTallyState(): GlobalStudioTally {
  if (!globalForWireless.__boxscoreWirelessTally) {
    globalForWireless.__boxscoreWirelessTally = {
      onAirRoomCodes: [],
      previewRoomCodes: [],
      liveSceneName: "Main Court",
      previewSceneName: "Preview",
      updatedAt: 0,
    };
  }
  return globalForWireless.__boxscoreWirelessTally;
}

function getOrCreateRoom(roomCode: string): RoomState {
  const clean = roomCode.trim().toUpperCase();
  const map = getRoomsMap();
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
      zoomLevel: 1,
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
  const tally = getTallyState();
  if (role === "studio") {
    room.studioReadyTs = Date.now();
  }

  const isOnAir =
    Boolean(room.isOnAir) || tally.onAirRoomCodes.includes(room.roomCode);
  const isInPreview =
    Boolean(room.isInPreview) || tally.previewRoomCodes.includes(room.roomCode);

  return NextResponse.json({
    ok: true,
    roomCode: room.roomCode,
    camName: room.camName,
    devicePlatform: room.devicePlatform,
    zoomLevel: room.zoomLevel || 1,
    offerSdp: room.offerSdp || null,
    offerId: room.offerId || null,
    offerTimestamp: room.offerTimestamp || 0,
    answerSdp: room.answerSdp || null,
    answerForOfferId: room.answerForOfferId || null,
    phoneCandidates: room.phoneCandidates,
    phoneIceCandidates: room.phoneCandidates,
    studioCandidates: room.studioCandidates,
    latestFrameDataUrl: role === "studio" ? room.latestFrameDataUrl || null : null,
    latestFrameTs: room.latestFrameTs || 0,
    latestFrameTimestamp: room.latestFrameTs || 0,
    studioReadyTs: room.studioReadyTs || 0,
    phoneJoinedTs: room.phoneJoinedTs || 0,
    isOnAir,
    isInPreview,
    liveSceneName: room.liveSceneName || tally.liveSceneName || "Main Court",
    previewSceneName: room.previewSceneName || tally.previewSceneName || "Preview",
    onAirRoomCodes: tally.onAirRoomCodes,
    previewRoomCodes: tally.previewRoomCodes,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action:
        | "phone_join"
        | "studio_ready"
        | "studio_tally"
        | "offer"
        | "answer"
        | "phone_ice"
        | "studio_ice"
        | "frame"
        | "zoom";
      roomCode?: string;
      camName?: string;
      devicePlatform?: "iphone" | "android";
      zoomLevel?: number;
      sdp?: RTCSessionDescriptionInit;
      offerId?: string;
      candidate?: RTCIceCandidateInit;
      frameDataUrl?: string;
      onAirRoomCodes?: string[];
      previewRoomCodes?: string[];
      liveSceneName?: string;
      previewSceneName?: string;
    };

    const tally = getTallyState();
    if (body.action === "studio_tally") {
      tally.onAirRoomCodes = (body.onAirRoomCodes || []).map((r) =>
        r.trim().toUpperCase()
      );
      tally.previewRoomCodes = (body.previewRoomCodes || []).map((r) =>
        r.trim().toUpperCase()
      );
      if (body.liveSceneName) tally.liveSceneName = body.liveSceneName;
      if (body.previewSceneName) tally.previewSceneName = body.previewSceneName;
      tally.updatedAt = Date.now();

      const map = getRoomsMap();
      for (const rm of map.values()) {
        rm.isOnAir = tally.onAirRoomCodes.includes(rm.roomCode);
        rm.isInPreview = tally.previewRoomCodes.includes(rm.roomCode);
        rm.liveSceneName = tally.liveSceneName;
        rm.previewSceneName = tally.previewSceneName;
      }
      return NextResponse.json({ ok: true, tally });
    }

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
    if (typeof body.zoomLevel === "number" && body.zoomLevel >= 1) {
      room.zoomLevel = Math.min(5, Math.max(1, body.zoomLevel));
    }
    if (Array.isArray(body.onAirRoomCodes)) {
      tally.onAirRoomCodes = body.onAirRoomCodes.map((r) => r.trim().toUpperCase());
      room.isOnAir = tally.onAirRoomCodes.includes(room.roomCode);
    }
    if (Array.isArray(body.previewRoomCodes)) {
      tally.previewRoomCodes = body.previewRoomCodes.map((r) =>
        r.trim().toUpperCase()
      );
      room.isInPreview = tally.previewRoomCodes.includes(room.roomCode);
    }
    if (body.liveSceneName) {
      tally.liveSceneName = body.liveSceneName;
      room.liveSceneName = body.liveSceneName;
    }
    if (body.previewSceneName) {
      tally.previewSceneName = body.previewSceneName;
      room.previewSceneName = body.previewSceneName;
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
          room.offerTimestamp = Date.now();
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
      case "zoom": {
        break;
      }
    }

    const isOnAir =
      Boolean(room.isOnAir) || tally.onAirRoomCodes.includes(room.roomCode);
    const isInPreview =
      Boolean(room.isInPreview) || tally.previewRoomCodes.includes(room.roomCode);

    return NextResponse.json({
      ok: true,
      roomCode: room.roomCode,
      offerId: room.offerId || null,
      answerSdp: room.answerSdp || null,
      answerForOfferId: room.answerForOfferId || null,
      studioCandidates: room.studioCandidates,
      isOnAir,
      isInPreview,
      liveSceneName: room.liveSceneName || tally.liveSceneName || "Main Court",
      previewSceneName: room.previewSceneName || tally.previewSceneName || "Preview",
      onAirRoomCodes: tally.onAirRoomCodes,
      previewRoomCodes: tally.previewRoomCodes,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 }
    );
  }
}
