import { ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID } from "./config";

export async function generateSpeech(text: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/basic", // 8-bit mu-law 8kHz — native Twilio format
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        output_format: "ulaw_8000",
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${err}`);
  }
  return res.arrayBuffer();
}
