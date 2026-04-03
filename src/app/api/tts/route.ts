import { NextRequest } from "next/server";
import { generateSpeech } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text");
  if (!text) {
    return new Response("Missing text param", { status: 400 });
  }

  try {
    const audioBuffer = await generateSpeech(text);
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/basic",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "TTS failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
