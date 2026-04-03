/** Returns TwiML speech fragment — always uses ElevenLabs */
export function speech(baseUrl: string, text: string): string {
  return `<Play>${baseUrl}/api/tts?text=${encodeURIComponent(text)}</Play>`;
}
