import { NextRequest } from "next/server";
import { generateSpeech } from "@/lib/elevenlabs";

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text");
  if (!text) {
    return new Response("Missing text param", { status: 400 });
  }

  const audioBuffer = await generateSpeech(text);

  return new Response(audioBuffer, {
    headers: {
      "Content-Type": "audio/basic",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
