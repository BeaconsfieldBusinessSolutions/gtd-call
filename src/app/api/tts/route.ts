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
    console.error("TTS error, will fall back to Twilio Say:", err);
    // Return a minimal valid audio response (silence) so Twilio doesn't error
    // The caller should handle this by checking content-type
    return new Response(
      JSON.stringify({ error: "tts_failed", fallback: true }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
