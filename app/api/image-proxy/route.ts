import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  const forceSquare =
    searchParams.get("square") === "1" ||
    searchParams.get("square") === "true" ||
    (targetUrl && (targetUrl.includes("headshots") || targetUrl.includes("nba.com")));

  if (!targetUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Only allow valid http and https URLs
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new NextResponse("Invalid protocol", { status: 400 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.status}`, {
        status: response.status,
      });
    }

    let contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    let imageBuffer = Buffer.from(arrayBuffer);

    // If requested or if it's an NBA/player headshot, standardize to 500x500 px (1:1 square aspect ratio)
    if (forceSquare) {
      try {
        imageBuffer = await sharp(imageBuffer)
          .resize(500, 500, {
            fit: "cover",
            position: "top",
          })
          .png({ quality: 90 })
          .toBuffer();
        contentType = "image/png";
      } catch (sharpErr) {
        console.warn("Failed to standardize image with sharp:", sharpErr);
      }
    }

    return new NextResponse(imageBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(`Error proxying image: ${msg}`, { status: 500 });
  }
}

