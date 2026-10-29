import { NextRequest, NextResponse } from "next/server";
import {
  EncodedFrameInput,
  getRtmpSessionMap,
  RtmpPublisherSession,
} from "@/lib/rtmp-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RtmpStreamRequestBody {
  action: "start" | "push" | "stop" | "status";
  sessionId?: string;
  rtmpUrl?: string;
  streamKey?: string;
  avcConfigBase64?: string;
  frames?: EncodedFrameInput[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RtmpStreamRequestBody;
    const {
      action,
      sessionId = "default-studio-session",
      rtmpUrl = "rtmps://live-api-s.facebook.com:443/rtmp/",
      streamKey = "",
      avcConfigBase64,
      frames = [],
    } = body;

    const sessions = getRtmpSessionMap();

    // Clean up stale sessions (>2 minutes idle)
    const now = Date.now();
    for (const [id, sess] of sessions.entries()) {
      if (now - sess.getStats().lastActivityAt > 120_000) {
        sess.close();
        sessions.delete(id);
      }
    }

    if (action === "stop") {
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.close();
        sessions.delete(sessionId);
      }
      return NextResponse.json({ ok: true, status: "stopped" });
    }

    if (action === "status") {
      const existing = sessions.get(sessionId);
      return NextResponse.json({
        ok: true,
        active: Boolean(existing?.isReady()),
        stats: existing?.getStats() || null,
      });
    }

    if (!streamKey.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing Stream Key. Copy your Stream Key from Facebook Live Producer (e.g. FB-177029...) and paste it into the Stream Key field.",
        },
        { status: 400 }
      );
    }

    if (action === "start") {
      const prev = sessions.get(sessionId);
      if (prev) {
        prev.close();
        sessions.delete(sessionId);
      }

      const session = new RtmpPublisherSession(sessionId, rtmpUrl, streamKey);
      await session.connectAndPublish(avcConfigBase64);
      sessions.set(sessionId, session);

      return NextResponse.json({
        ok: true,
        sessionId,
        status: "publishing",
        stats: session.getStats(),
      });
    }

    if (action === "push") {
      let session = sessions.get(sessionId);
      if (!session || !session.isReady()) {
        session = new RtmpPublisherSession(sessionId, rtmpUrl, streamKey);
        await session.connectAndPublish(avcConfigBase64);
        sessions.set(sessionId, session);
      }

      const result = await session.pushFrames(frames, avcConfigBase64);
      return NextResponse.json({
        ok: true,
        sessionId,
        bytesSent: result.bytesSent,
        framesSent: result.framesSent,
        stats: session.getStats(),
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to communicate with RTMP server.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
