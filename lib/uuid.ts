/**
 * Safe UUID v4 generator that works in all environments, including
 * iPadOS / iOS Safari & Chrome over non-HTTPS LAN IP addresses (e.g. http://192.168.x.x:3000)
 * where `window.isSecureContext` is false and `crypto.randomUUID` is undefined.
 */
export function generateUUID(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // Fallback below
    }
  }

  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    // Per RFC 4122 section 4.4, set bits for version 4 and `clock_seq_hi_and_reserved`
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Install polyfill on globalThis.crypto.randomUUID for non-secure LAN contexts on iOS/iPadOS
if (
  typeof globalThis !== "undefined" &&
  typeof globalThis.crypto !== "undefined" &&
  typeof globalThis.crypto.randomUUID !== "function"
) {
  try {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: generateUUID,
      configurable: true,
      writable: true,
    });
  } catch {
    // Ignore if crypto object is frozen
  }
}
