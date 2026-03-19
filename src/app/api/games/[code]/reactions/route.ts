import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Reactions snapshot endpoint has been retired. Use the SSE game stream instead." },
    { status: 410 },
  );
}
