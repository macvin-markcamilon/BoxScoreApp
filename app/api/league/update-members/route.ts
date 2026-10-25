import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leagueId, rulesConfig, members } = body;

    if (!leagueId) {
      return NextResponse.json({ error: "leagueId is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    // Call Supabase REST API directly with clean headers to update league rules_config
    const updateUrl = `${supabaseUrl}/rest/v1/leagues?id=eq.${encodeURIComponent(leagueId)}`;

    const res = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        rules_config: rulesConfig,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Database update failed: ${errText || res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
