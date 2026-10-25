import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leagueId, ownerId } = body;

    if (!leagueId) {
      return NextResponse.json({ error: "leagueId is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    // Call Supabase REST API directly with clean headers (avoids client-side 600KB auth cookie / Bearer token 400s)
    let deleteUrl = `${supabaseUrl}/rest/v1/leagues?id=eq.${encodeURIComponent(leagueId)}`;
    if (ownerId) {
      deleteUrl += `&owner_id=eq.${encodeURIComponent(ownerId)}`;
    }

    const res = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Database delete failed: ${errText || res.statusText}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
