// WebRTC Configuration & ICE Candidate Helper for Direct P2P Wireless Camera Streaming

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // Multiple redundant public STUN servers
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:global.stun.twilio.com:3478" },

    // Free OpenRelay TURN servers for NAT / cellular firewall traversal (when STUN alone cannot connect)
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },

    // Optional custom TURN credentials from environment
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [
          {
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
          },
        ]
      : []),
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
};

/**
 * Safely adds an ICE candidate to an RTCPeerConnection or buffers it if remote description isn't set yet.
 */
export async function addIceCandidateSafely(
  pc: RTCPeerConnection | null | undefined,
  candidate: RTCIceCandidateInit | null | undefined,
  buffer: RTCIceCandidateInit[]
): Promise<void> {
  if (!pc || !candidate) return;
  if (!pc.remoteDescription || !pc.remoteDescription.type) {
    buffer.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.warn("[WebRTC] addIceCandidate failed, buffering candidate:", err);
    buffer.push(candidate);
  }
}

/**
 * Flushes buffered ICE candidates once remote description is set.
 */
export async function flushBufferedIceCandidates(
  pc: RTCPeerConnection | null | undefined,
  buffer: RTCIceCandidateInit[]
): Promise<void> {
  if (!pc || !pc.remoteDescription || buffer.length === 0) return;
  const queued = [...buffer];
  buffer.length = 0;
  for (const cand of queued) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(cand));
    } catch (err) {
      console.warn("[WebRTC] flush candidate error:", err);
    }
  }
}
