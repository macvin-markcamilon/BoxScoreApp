import { NextRequest, NextResponse } from "next/server";
import {
  EncodedFrameInput,
  getRtmpSessionMap,
  RtmpPublisherSession,
  StreamMetaConfig,
} from "@/lib/rtmp-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RtmpStreamRequestBody {
  action: "start" | "push" | "stop" | "status";
  sessionId?: string;
  rtmpUrl?: string;
  streamKey?: string;
  avcConfigBase64?: string;
  metaConfig?: StreamMetaConfig;
  frames?: EncodedFrameInput[];
}

export async function POST(req: NextRequest) {
  const reqStartMs = Date.now();
  try {
    const body = (await req.json()) as RtmpStreamRequestBody;
    const {
      action,
      sessionId = "default-studio-session",
      rtmpUrl = "rtmps://live-api-s.facebook.com:443/rtmp/",
      streamKey = "",
      avcConfigBase64,
      metaConfig,
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
        serverLatencyMs: Date.now() - reqStartMs,
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
      // Close any existing session with same ID or same streamKey to prevent duplicate RTMP collisions
      for (const [id, sess] of sessions.entries()) {
        if (id === sessionId || sess.streamKey === streamKey.trim()) {
          sess.close();
          sessions.delete(id);
        }
      }

      const session = new RtmpPublisherSession(sessionId, rtmpUrl, streamKey);
      await session.connectAndPublish(avcConfigBase64, metaConfig);
      sessions.set(sessionId, session);

      let initialPush = {
        bytesSent: 0,
        framesSent: 0,
        keyframesSent: 0,
        skippedDeltaFrames: 0,
        needsKeyframe: true,
      };
      if (frames.length > 0) {
        initialPush = await session.pushFrames(frames, avcConfigBase64, metaConfig);
      }

      return NextResponse.json({
        ok: true,
        sessionId,
        status: "publishing",
        bytesSent: initialPush.bytesSent,
        framesSent: initialPush.framesSent,
        keyframesSent: initialPush.keyframesSent,
        needsKeyframe: initialPush.needsKeyframe,
        stats: session.getStats(),
        serverLatencyMs: Date.now() - reqStartMs,
      });
    }

    if (action === "push") {
      let session = sessions.get(sessionId);
      let reconnected = false;
      if (!session || !session.isReady()) {
        session = new RtmpPublisherSession(sessionId, rtmpUrl, streamKey);
        await session.connectAndPublish(avcConfigBase64, metaConfig);
        sessions.set(sessionId, session);
        reconnected = true;
      }

      const result = await session.pushFrames(frames, avcConfigBase64, metaConfig);
      return NextResponse.json({
        ok: true,
        sessionId,
        reconnected,
        bytesSent: result.bytesSent,
        framesSent: result.framesSent,
        keyframesSent: result.keyframesSent,
        skippedDeltaFrames: result.skippedDeltaFrames,
        needsKeyframe: result.needsKeyframe,
        stats: session.getStats(),
        serverLatencyMs: Date.now() - reqStartMs,
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
