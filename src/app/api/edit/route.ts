import { NextResponse } from "next/server";

import { editTripFromPrompt } from "@/lib/gemini";
import { chatEditRequestSchema } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = chatEditRequestSchema.parse(body);
    const result = await editTripFromPrompt(input.trip, input.instruction, input.history);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to edit itinerary.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
