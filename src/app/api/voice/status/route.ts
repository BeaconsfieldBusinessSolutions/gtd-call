import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = formData.get("CallSid");
  const callStatus = formData.get("CallStatus");
  const duration = formData.get("CallDuration");

  console.log(`Call ${callSid}: ${callStatus} (duration: ${duration}s)`);

  return NextResponse.json({ received: true });
}
