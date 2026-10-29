import net from "node:net";
import tls from "node:tls";

// ============================================================================
// AMF0 ENCODING HELPERS
// ============================================================================

function amf0String(str: string): Buffer {
  const b = Buffer.from(str, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([Buffer.from([0x02]), len, b]);
}

function amf0Number(num: number): Buffer {
  const b = Buffer.alloc(9);
  b[0] = 0x00;
  b.writeDoubleBE(num, 1);
  return b;
}

function amf0Boolean(val: boolean): Buffer {
  return Buffer.from([0x01, val ? 1 : 0]);
}

function amf0Null(): Buffer {
  return Buffer.from([0x05]);
}

function amf0Object(obj: Record<string, string | number | boolean>): Buffer {
  const parts: Buffer[] = [Buffer.from([0x03])];
  for (const [k, v] of Object.entries(obj)) {
    const kb = Buffer.from(k, "utf8");
    const klen = Buffer.alloc(2);
    klen.writeUInt16BE(kb.length, 0);
    parts.push(klen, kb);
    if (typeof v === "string") parts.push(amf0String(v));
    else if (typeof v === "number") parts.push(amf0Number(v));
    else if (typeof v === "boolean") parts.push(amf0Boolean(v));
  }
  parts.push(Buffer.from([0x00, 0x00, 0x09]));
  return Buffer.concat(parts);
}

function amf0EcmaArray(obj: Record<string, string | number | boolean>): Buffer {
  const entries = Object.entries(obj);
  const header = Buffer.alloc(5);
  header[0] = 0x08;
  header.writeUInt32BE(entries.length, 1);
  const parts: Buffer[] = [header];
  for (const [k, v] of entries) {
    const kb = Buffer.from(k, "utf8");
    const klen = Buffer.alloc(2);
    klen.writeUInt16BE(kb.length, 0);
    parts.push(klen, kb);
    if (typeof v === "string") parts.push(amf0String(v));
    else if (typeof v === "number") parts.push(amf0Number(v));
    else if (typeof v === "boolean") parts.push(amf0Boolean(v));
  }
  parts.push(Buffer.from([0x00, 0x00, 0x09]));
  return Buffer.concat(parts);
}

// ============================================================================
// RTMP CHUNK SERIALIZER
// ============================================================================

const OUT_CHUNK_SIZE = 4096;

function createRtmpChunks(
  csid: number,
  timestampMs: number,
  typeId: number,
  streamId: number,
  payload: Buffer,
  chunkSize = OUT_CHUNK_SIZE
): Buffer {
  const ts = Math.max(0, Math.floor(timestampMs));
  const useExtendedTs = ts >= 0xffffff;
  const headerTs = useExtendedTs ? 0xffffff : ts;

  const out: Buffer[] = [];
  let offset = 0;

  while (offset < payload.length) {
    const slice = payload.subarray(offset, offset + chunkSize);
    if (offset === 0) {
      const h = Buffer.alloc(12);
      h[0] = csid & 0x3f; // fmt 0
      h.writeUIntBE(headerTs, 1, 3);
      h.writeUIntBE(payload.length, 4, 3);
      h[7] = typeId;
      h.writeUInt32LE(streamId, 8);
      out.push(h);
      if (useExtendedTs) {
        const ext = Buffer.alloc(4);
        ext.writeUInt32BE(ts, 0);
        out.push(ext);
      }
    } else {
      out.push(Buffer.from([0xc0 | (csid & 0x3f)])); // fmt 3 continuation
      if (useExtendedTs) {
        const ext = Buffer.alloc(4);
        ext.writeUInt32BE(ts, 0);
        out.push(ext);
      }
    }
    out.push(slice);
    offset += slice.length;
  }

  return Buffer.concat(out);
}

// ============================================================================
// H.264 NALU / AVCC HELPERS
// ============================================================================

function isAnnexB(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  return (
    (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00 && buf[3] === 0x01) ||
    (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01)
  );
}

function splitAnnexBNalus(buf: Buffer): Buffer[] {
  const nalus: Buffer[] = [];
  let i = 0;
  let naluStart = -1;

  while (i < buf.length) {
    let startCodeLen = 0;
    if (
      i + 3 < buf.length &&
      buf[i] === 0x00 &&
      buf[i + 1] === 0x00 &&
      buf[i + 2] === 0x00 &&
      buf[i + 3] === 0x01
    ) {
      startCodeLen = 4;
    } else if (
      i + 2 < buf.length &&
      buf[i] === 0x00 &&
      buf[i + 1] === 0x00 &&
      buf[i + 2] === 0x01
    ) {
      startCodeLen = 3;
    }

    if (startCodeLen > 0) {
      if (naluStart >= 0 && i > naluStart) {
        nalus.push(buf.subarray(naluStart, i));
      }
      naluStart = i + startCodeLen;
      i += startCodeLen;
    } else {
      i++;
    }
  }

  if (naluStart >= 0 && naluStart < buf.length) {
    nalus.push(buf.subarray(naluStart));
  }
  return nalus;
}

function buildAvcCFromSpsPps(sps: Buffer, pps: Buffer): Buffer {
  const profileIdc = sps.length > 1 ? sps[1] : 0x42;
  const profileCompat = sps.length > 2 ? sps[2] : 0x00;
  const levelIdc = sps.length > 3 ? sps[3] : 0x1f;

  const header = Buffer.alloc(8 + sps.length + 3 + pps.length);
  let pos = 0;
  header[pos++] = 0x01; // configurationVersion
  header[pos++] = profileIdc;
  header[pos++] = profileCompat;
  header[pos++] = levelIdc;
  header[pos++] = 0xff; // 4-byte NALU length minus 1
  header[pos++] = 0xe1; // 1 SPS
  header.writeUInt16BE(sps.length, pos);
  pos += 2;
  sps.copy(header, pos);
  pos += sps.length;
  header[pos++] = 0x01; // 1 PPS
  header.writeUInt16BE(pps.length, pos);
  pos += 2;
  pps.copy(header, pos);
  return header;
}

function convertAnnexBToAvcAndExtractConfig(buf: Buffer): {
  avcPayload: Buffer;
  extractedAvcC: Buffer | null;
} {
  const nalus = splitAnnexBNalus(buf);
  let sps: Buffer | null = null;
  let pps: Buffer | null = null;
  const lengthPrefixedParts: Buffer[] = [];

  for (const nalu of nalus) {
    if (nalu.length === 0) continue;
    const nalType = nalu[0] & 0x1f;
    if (nalType === 7) {
      sps = nalu;
      continue;
    }
    if (nalType === 8) {
      pps = nalu;
      continue;
    }
    if (nalType === 9) {
      // Skip Access Unit Delimiter
      continue;
    }
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(nalu.length, 0);
    lengthPrefixedParts.push(lenBuf, nalu);
  }

  const extractedAvcC = sps && pps ? buildAvcCFromSpsPps(sps, pps) : null;
  return {
    avcPayload: Buffer.concat(lengthPrefixedParts),
    extractedAvcC,
  };
}

// ============================================================================
// RTMP PUBLISHER SESSION
// ============================================================================

export interface EncodedFrameInput {
  timestampMs: number;
  isKeyframe: boolean;
  dataBase64: string;
}

export class RtmpPublisherSession {
  public readonly id: string;
  public readonly rtmpUrl: string;
  public readonly streamKey: string;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private isConnected = false;
  private isPublishing = false;
  private sentHeaders = false;
  private avcConfig: Buffer | null = null;
  private lastAudioTsMs = 0;
  private totalBytesSent = 0;
  private totalFramesSent = 0;
  private lastError: string | null = null;
  private lastActivityAt = Date.now();

  constructor(id: string, rtmpUrl: string, streamKey: string) {
    this.id = id;
    this.rtmpUrl = rtmpUrl.trim();
    this.streamKey = this.cleanStreamKey(streamKey);
  }

  private cleanStreamKey(rawKey: string): string {
    let k = rawKey.trim();
    // If the user pasted the full rtmp/rtmps URL into the stream key field, strip the prefix
    const prefixes = [
      "rtmps://live-api-s.facebook.com:443/rtmp/",
      "rtmps://live-api-s.facebook.com/rtmp/",
      "rtmp://a.rtmp.youtube.com/live2/",
      "rtmp://a.rtmp.youtube.com:1935/live2/",
    ];
    for (const p of prefixes) {
      if (k.startsWith(p)) {
        k = k.slice(p.length);
      }
    }
    return k;
  }

  private parseTargetEndpoint(): {
    isTls: boolean;
    host: string;
    port: number;
    app: string;
    tcUrl: string;
  } {
    try {
      const urlStr = this.rtmpUrl || "rtmps://live-api-s.facebook.com:443/rtmp/";
      const parsed = new URL(urlStr.replace(/^rtmps:\/\//i, "https://").replace(/^rtmp:\/\//i, "http://"));
      const isTls = /^rtmps:\/\//i.test(urlStr) || parsed.protocol === "https:";
      const host = parsed.hostname || "live-api-s.facebook.com";
      const port = parsed.port ? Number(parsed.port) : isTls ? 443 : 1935;
      let app = parsed.pathname.replace(/^\/+/, "");
      if (!app) app = "rtmp/";
      if (host.includes("facebook.com") && !app.endsWith("/")) {
        app += "/";
      }
      const tcUrl = `${isTls ? "rtmps" : "rtmp"}://${host}:${port}/${app}`;
      return { isTls, host, port, app, tcUrl };
    } catch {
      return {
        isTls: true,
        host: "live-api-s.facebook.com",
        port: 443,
        app: "rtmp/",
        tcUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
      };
    }
  }

  public isReady(): boolean {
    return Boolean(this.socket && !this.socket.destroyed && this.isConnected && this.isPublishing);
  }

  public getStats() {
    return {
      id: this.id,
      isConnected: this.isConnected,
      isPublishing: this.isPublishing,
      totalBytesSent: this.totalBytesSent,
      totalFramesSent: this.totalFramesSent,
      lastError: this.lastError,
      lastActivityAt: this.lastActivityAt,
    };
  }

  public async connectAndPublish(initialAvcConfigBase64?: string): Promise<void> {
    if (initialAvcConfigBase64) {
      this.avcConfig = Buffer.from(initialAvcConfigBase64, "base64");
    }

    if (this.isReady()) {
      return;
    }

    const { isTls, host, port, app, tcUrl } = this.parseTargetEndpoint();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.close();
        reject(new Error(`Timed out connecting to ${host}:${port}`));
      }, 9000);

      const onConnect = () => {
        // Send RTMP Handshake C0 + C1 (1537 bytes)
        const c0c1 = Buffer.alloc(1537);
        c0c1[0] = 0x03;
        this.socket?.write(c0c1);
      };

      const sock = isTls
        ? tls.connect({ host, port, servername: host, rejectUnauthorized: false }, onConnect)
        : net.connect({ host, port }, onConnect);

      sock.setNoDelay(true);
      this.socket = sock;

      let recvBuf = Buffer.alloc(0);
      let stage: "handshake" | "connect" | "createStream" | "publish" | "live" = "handshake";

      sock.on("data", (chunk: Buffer) => {
        this.lastActivityAt = Date.now();
        recvBuf = Buffer.concat([recvBuf, chunk]);

        if (stage === "handshake") {
          if (recvBuf.length >= 3073) {
            const s1 = recvBuf.subarray(1, 1537);
            recvBuf = recvBuf.subarray(3073);
            stage = "connect";

            // Send C2
            sock.write(s1);

            // Set Outgoing Chunk Size = 4096
            const scs = Buffer.alloc(4);
            scs.writeUInt32BE(OUT_CHUNK_SIZE, 0);
            sock.write(createRtmpChunks(2, 0, 1, 0, scs));

            // Send connect(app)
            const connectCmd = Buffer.concat([
              amf0String("connect"),
              amf0Number(1),
              amf0Object({
                app,
                flashVer: "FMLE/3.0 (compatible; FMSc/1.0)",
                tcUrl,
                type: "nonprivate",
              }),
            ]);
            sock.write(createRtmpChunks(3, 0, 20, 0, connectCmd));
          }
          return;
        }

        const ascii = recvBuf.toString("ascii");

        if (stage === "connect") {
          if (ascii.includes("NetConnection.Connect.Success")) {
            this.isConnected = true;
            stage = "createStream";
            recvBuf = Buffer.alloc(0);

            // Send releaseStream, FCPublish, createStream
            const releaseCmd = Buffer.concat([
              amf0String("releaseStream"),
              amf0Number(2),
              amf0Null(),
              amf0String(this.streamKey),
            ]);
            const fcPubCmd = Buffer.concat([
              amf0String("FCPublish"),
              amf0Number(3),
              amf0Null(),
              amf0String(this.streamKey),
            ]);
            const createStreamCmd = Buffer.concat([
              amf0String("createStream"),
              amf0Number(4),
              amf0Null(),
            ]);

            sock.write(
              Buffer.concat([
                createRtmpChunks(3, 0, 20, 0, releaseCmd),
                createRtmpChunks(3, 0, 20, 0, fcPubCmd),
                createRtmpChunks(3, 0, 20, 0, createStreamCmd),
              ])
            );
          } else if (
            ascii.includes("NetConnection.Connect.Rejected") ||
            ascii.includes("NetConnection.Connect.Failed")
          ) {
            clearTimeout(timeout);
            this.lastError = "RTMP server rejected connection.";
            this.close();
            reject(new Error(this.lastError));
          }
          return;
        }

        if (stage === "createStream") {
          if (ascii.includes("_result")) {
            stage = "publish";
            recvBuf = Buffer.alloc(0);

            // Send publish(streamKey, "live") on CSID 4, Stream ID 1
            const publishCmd = Buffer.concat([
              amf0String("publish"),
              amf0Number(0),
              amf0Null(),
              amf0String(this.streamKey),
              amf0String("live"),
            ]);
            sock.write(createRtmpChunks(4, 0, 20, 1, publishCmd));
          }
          return;
        }

        if (stage === "publish") {
          if (ascii.includes("NetStream.Publish.Start")) {
            stage = "live";
            this.isPublishing = true;
            recvBuf = Buffer.alloc(0);
            clearTimeout(timeout);
            this.sendInitialStreamHeadersIfPossible();
            resolve();
          } else if (
            ascii.includes("NetStream.Publish.BadName") ||
            ascii.includes("NetStream.Publish.Rejected") ||
            ascii.includes("Fail") ||
            ascii.includes("Error")
          ) {
            clearTimeout(timeout);
            this.lastError =
              "Facebook/YouTube rejected the Stream Key. Please check that your Stream Key in Live Producer is exact and active.";
            this.close();
            reject(new Error(this.lastError));
          }
          return;
        }

        if (stage === "live") {
          // Keep buffer bounded
          if (recvBuf.length > 8192) {
            recvBuf = Buffer.alloc(0);
          }
        }
      });

      sock.on("error", (err) => {
        clearTimeout(timeout);
        this.lastError = err.message;
        this.isConnected = false;
        this.isPublishing = false;
        reject(err);
      });

      sock.on("close", () => {
        this.isConnected = false;
        this.isPublishing = false;
      });
    });
  }

  private sendInitialStreamHeadersIfPossible() {
    if (this.sentHeaders || !this.socket || this.socket.destroyed || !this.avcConfig) {
      return;
    }
    this.sentHeaders = true;

    // 1. @setDataFrame("onMetaData")
    const metaPayload = Buffer.concat([
      amf0String("@setDataFrame"),
      amf0String("onMetaData"),
      amf0EcmaArray({
        width: 1280,
        height: 720,
        videodatarate: 2500,
        framerate: 30,
        videocodecid: 7, // H.264 / AVC
        audiodatarate: 128,
        audiosamplerate: 44100,
        audiosamplesize: 16,
        stereo: true,
        audiocodecid: 10, // AAC
      }),
    ]);

    // 2. AAC Sequence Header (44.1kHz Stereo AAC-LC: 0xAF 0x00 0x12 0x10)
    const aacSeqHeader = Buffer.from([0xaf, 0x00, 0x12, 0x10]);

    // 3. AVC (H.264) Sequence Header (0x17 0x00 0x00 0x00 0x00 + avcC)
    const avcSeqHeader = Buffer.concat([
      Buffer.from([0x17, 0x00, 0x00, 0x00, 0x00]),
      this.avcConfig,
    ]);

    const combined = Buffer.concat([
      createRtmpChunks(4, 0, 18, 1, metaPayload),
      createRtmpChunks(5, 0, 8, 1, aacSeqHeader),
      createRtmpChunks(6, 0, 9, 1, avcSeqHeader),
    ]);

    this.socket.write(combined);
    this.totalBytesSent += combined.length;
  }

  public async pushFrames(
    frames: EncodedFrameInput[],
    avcConfigBase64?: string
  ): Promise<{ bytesSent: number; framesSent: number }> {
    if (avcConfigBase64) {
      const cfg = Buffer.from(avcConfigBase64, "base64");
      if (!this.avcConfig && cfg.length > 0) {
        this.avcConfig = cfg;
      }
    }

    if (!this.isReady()) {
      await this.connectAndPublish(avcConfigBase64);
    }

    const outBuffers: Buffer[] = [];
    // Silent AAC-LC stereo raw frame (1024 samples @ 44.1kHz = 23.22ms)
    const silentAacFrame = Buffer.from([0xaf, 0x01, 0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]);
    const aacStepMs = 1024 / 44.1; // ~23.21995ms

    for (const f of frames) {
      const rawBuf = Buffer.from(f.dataBase64, "base64");
      if (rawBuf.length === 0) continue;

      let avcPayload: Buffer = rawBuf;
      if (isAnnexB(rawBuf)) {
        const converted = convertAnnexBToAvcAndExtractConfig(rawBuf);
        avcPayload = converted.avcPayload;
        if (!this.avcConfig && converted.extractedAvcC) {
          this.avcConfig = converted.extractedAvcC;
        }
      }

      if (!this.sentHeaders && this.avcConfig) {
        this.sendInitialStreamHeadersIfPossible();
      }

      if (avcPayload.length === 0) continue;

      const ts = Math.max(0, Math.round(f.timestampMs));

      // Initialize audio clock on first frame
      if (this.lastAudioTsMs === 0 && ts > 0) {
        this.lastAudioTsMs = Math.max(0, ts - 46);
      }

      // Emit matching silent AAC audio packets up to current video timestamp
      while (this.lastAudioTsMs + aacStepMs <= ts) {
        this.lastAudioTsMs += aacStepMs;
        outBuffers.push(
          createRtmpChunks(5, Math.round(this.lastAudioTsMs), 8, 1, silentAacFrame)
        );
      }

      // Emit H.264 Video NALU packet
      const videoTagHeader = Buffer.from([
        f.isKeyframe ? 0x17 : 0x27,
        0x01, // AVC NALU
        0x00,
        0x00,
        0x00, // CompositionTime = 0
      ]);
      const videoPacket = Buffer.concat([videoTagHeader, avcPayload]);
      outBuffers.push(createRtmpChunks(6, ts, 9, 1, videoPacket));
      this.totalFramesSent += 1;
    }

    if (outBuffers.length === 0 || !this.socket || this.socket.destroyed) {
      return { bytesSent: 0, framesSent: 0 };
    }

    const batchBuf = Buffer.concat(outBuffers);
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(batchBuf, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.totalBytesSent += batchBuf.length;
    this.lastActivityAt = Date.now();
    return {
      bytesSent: batchBuf.length,
      framesSent: frames.length,
    };
  }

  public close() {
    try {
      if (this.socket && !this.socket.destroyed && this.isPublishing) {
        const unpub = Buffer.concat([
          amf0String("FCUnpublish"),
          amf0Number(5),
          amf0Null(),
          amf0String(this.streamKey),
        ]);
        this.socket.write(createRtmpChunks(3, 0, 20, 0, unpub));
      }
    } catch {}
    try {
      this.socket?.destroy();
    } catch {}
    this.socket = null;
    this.isConnected = false;
    this.isPublishing = false;
  }
}

// Persist active RTMP sessions in globalThis so warm Node instances reuse open TLS sockets
const globalForRtmp = globalThis as unknown as {
  __boxScoreRtmpSessions?: Map<string, RtmpPublisherSession>;
};

export function getRtmpSessionMap(): Map<string, RtmpPublisherSession> {
  if (!globalForRtmp.__boxScoreRtmpSessions) {
    globalForRtmp.__boxScoreRtmpSessions = new Map<string, RtmpPublisherSession>();
  }
  return globalForRtmp.__boxScoreRtmpSessions;
}
