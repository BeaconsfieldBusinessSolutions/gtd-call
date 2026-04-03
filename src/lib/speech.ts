import { ELEVENLABS_VOICE_ID } from "./config";

let _available: boolean | null = null;

/** Quick check if ElevenLabs API key works (cached per cold start) */
async function checkElevenLabs(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${ELEVENLABS_VOICE_ID}`, {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    });
    _available = res.ok;
  } catch {
    _available = false;
  }
  console.log(`[TTS] ElevenLabs available: ${_available}`);
  return _available;
}

/** Returns TwiML speech fragment — ElevenLabs <Play> or Polly <Say> */
export async function speech(baseUrl: string, text: string): Promise<string> {
  const ok = await checkElevenLabs();
  if (ok) {
    return `<Play>${baseUrl}/api/tts?text=${encodeURIComponent(text)}</Play>`;
  }
  return `<Say voice="Polly.Amy" language="en-GB">${escapeXml(text)}</Say>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
