import { NextResponse } from "next/server";

import { generateTripFromPrompt } from "@/lib/gemini";
import { lookupMakCorpsHotels } from "@/lib/makcorps";
import { tripRequestSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = tripRequestSchema.parse(body);
    const liveHotels = await lookupMakCorpsHotels(input.location);
    const result = await generateTripFromPrompt(input, liveHotels);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate itinerary.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
