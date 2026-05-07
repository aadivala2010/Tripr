import {
  chatResponseSchema,
  tripEnvelopeSchema,
  type Trip,
  type TripRequest,
} from "@/lib/types";
import type { SerpApiHotelOption } from "@/lib/serpapi";

const API_KEY =
  process.env.GEMINI_API_KEY ?? "AIzaSyCRYJh9Kk6Pvsq3P9uV8naLMV2XcgYf2E4";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function parseBudgetValue(budget: string) {
  const normalized = budget.toLowerCase().trim();
  const directNumeric = Number.parseFloat(normalized.replace(/[^0-9.]/g, ""));
  let value = Number.isNaN(directNumeric) ? 0 : directNumeric;

  if (normalized.includes("million")) value *= 1_000_000;
  else if (normalized.includes("billion")) value *= 1_000_000_000;
  else if (normalized.includes("thousand") || /\bk\b/.test(normalized)) value *= 1_000;

  return value || null;
}

function getBudgetGuidance(budget: string) {
  const numericBudget = parseBudgetValue(budget);

  if (!numericBudget) {
    return {
      normalizedBudget: budget,
      tier: "unknown",
      guidance: "Use the stated budget carefully and keep both activities and hotel suggestions cost-aware.",
    };
  }

  if (numericBudget <= 100) {
    return {
      normalizedBudget: `$${numericBudget}`,
      tier: "ultra-low",
      guidance:
        "Ultra-low budget. Only include free sights, cheap eats, public transit, hostels or budget hotels, and no premium experiences.",
    };
  }

  if (numericBudget <= 500) {
    return {
      normalizedBudget: `$${numericBudget}`,
      tier: "low",
      guidance:
        "Low budget. Prioritize free and low-cost attractions, budget-conscious hotels, casual food, and avoid luxury experiences.",
    };
  }

  if (numericBudget <= 1500) {
    return {
      normalizedBudget: `$${numericBudget}`,
      tier: "moderate",
      guidance:
        "Moderate budget. Mix affordable highlights with a few paid experiences and mid-range hotel options.",
    };
  }

  if (numericBudget <= 10000) {
    return {
      normalizedBudget: `$${numericBudget}`,
      tier: "high",
      guidance:
        "High budget. Include premium dining, nicer hotels, and stronger convenience while keeping the plan believable.",
    };
  }

  return {
    normalizedBudget: `$${numericBudget}`,
    tier: "luxury",
    guidance:
      "Luxury budget. Premium hotels, private experiences, and upscale dining are allowed when they fit the destination.",
  };
}

const tripResponseSchema = {
  type: "object",
  properties: {
    trip: {
      type: "object",
      properties: {
        id: { type: "string" },
        createdAt: { type: "string" },
        location: { type: "string" },
        arrivalDate: { type: "string" },
        departureDate: { type: "string" },
        duration: { type: "string" },
        budget: { type: "string" },
        interests: {
          type: "array",
          items: { type: "string" },
        },
        hotelRecommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              area: { type: "string" },
              priceLevel: { type: "string" },
              price: { type: "string" },
              vendor: { type: "string" },
              source: { type: "string", enum: ["live", "fallback"] },
              description: { type: "string" },
            },
            required: ["name", "area", "priceLevel", "price", "vendor", "source", "description"],
          },
        },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "integer" },
              theme: { type: "string" },
              summary: { type: "string" },
              activities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    time: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    visited: { type: "boolean" },
                  },
                  required: ["time", "title", "description", "visited"],
                },
              },
            },
            required: ["day", "theme", "summary", "activities"],
          },
        },
      },
      required: [
        "id",
        "createdAt",
        "location",
        "arrivalDate",
        "departureDate",
        "duration",
        "budget",
        "interests",
        "hotelRecommendations",
        "days",
      ],
    },
  },
  required: ["trip"],
} as const;

const chatResponseJsonSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
    tripUpdated: { type: "boolean" },
    trip: tripResponseSchema.properties.trip,
  },
  required: ["message", "tripUpdated", "trip"],
} as const;

function extractText(payload: unknown) {
  const data = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function generateStructuredJson<T>(
  prompt: string,
  responseJsonSchema: object,
  parser: (value: unknown) => T,
) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema,
        temperature: 0.55,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const text = extractText(payload);

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return parser(JSON.parse(text));
}

function buildHotelContext(hotels: SerpApiHotelOption[]) {
  if (!hotels.length) {
    return `
No live hotel data is available for this exact stay window.
Create 3 fallback hotel suggestions that fit the budget.
For fallback hotels:
- set source to "fallback"
- leave vendor as an empty string
- use price as an estimated nightly range or simple approximate tier text
- do not claim the price is live or exact
`.trim();
  }

  const lines = hotels
    .map(
      (hotel, index) =>
        `${index + 1}. ${hotel.name} | area: ${hotel.area} | vendor: ${hotel.vendor} | stay price: ${hotel.price}`,
    )
    .join("\n");

  return `
Live hotel search data from SerpApi Google Hotels is available below.
Important: These SerpApi results are tied to the selected stay dates and should be treated as live hotel pricing context.
Use these hotels as date-aware live options for the selected destination and stay window.
Prefer these hotels for the 3 hotelRecommendations.
For hotels chosen from this list:
- set source to "live"
- keep vendor populated
- keep price grounded in the provided live price text
- keep the hotel name unchanged

Available live date-based hotels:
${lines}
`.trim();
}

export async function generateTripFromPrompt(
  input: TripRequest,
  liveHotels: SerpApiHotelOption[],
) {
  const budgetInfo = getBudgetGuidance(input.budget);
  const hotelContext = buildHotelContext(liveHotels);

  const prompt = `
Create a realistic trip itinerary and return JSON only.
Trip:
Location: ${input.location}
Arrival date: ${input.arrivalDate}
Departure date: ${input.departureDate}
Days: ${input.days}
Nights: ${input.nights}
Budget entered by user: ${input.budget}
Normalized budget: ${budgetInfo.normalizedBudget}
Budget tier: ${budgetInfo.tier}
Interests: ${input.interests}
Budget guidance: ${budgetInfo.guidance}

Hotel context:
${hotelContext}

Rules:
- Complete multi-day plan.
- Distinct theme and summary per day.
- Short specific descriptions.
- Fit the stated budget and interests.
- Budget must materially change recommendations, activity mix, hotel quality, and overall pacing.
- Include exactly 3 hotelRecommendations.
- If live hotel data is available, choose hotels from that live list whenever possible.
- If no live hotel data is available, create fallback hotel suggestions and set source to "fallback".
- If the budget is ultra-low or low, do not include luxury hotels or premium experiences.
- duration should be "${input.days} days, ${input.nights} nights".
- interests must be an array.
- Set all visited fields to false.
`.trim();

  return generateStructuredJson(prompt, tripResponseSchema, tripEnvelopeSchema.parse);
}

export async function editTripFromPrompt(
  trip: Trip,
  instruction: string,
  history: Array<{ role: "user" | "assistant"; text: string }>,
) {
  const conversationHistory = history
    .slice(-4)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.text}`)
    .join("\n");

  const prompt = `
You are Tripr's travel companion. You can chat and edit the itinerary.
Return JSON only. No markdown. No code fences.
Instruction: ${instruction}
Recent conversation:
${conversationHistory || "None"}
Current itinerary JSON:
${JSON.stringify({ trip })}
Rules:
- For advice, clarification, or recommendations, reply in "message" and keep the itinerary unchanged.
- For itinerary changes, update the itinerary and set tripUpdated to true.
- Otherwise return the original itinerary and set tripUpdated to false.
- Keep the same trip id, createdAt, and visited states unless asked otherwise.
- Preserve hotel recommendation source, vendor, and pricing context unless the user explicitly asks to change where they should stay.
- Return the full itinerary every time.
- Keep the message concise and helpful.
`.trim();

  return generateStructuredJson(prompt, chatResponseJsonSchema, chatResponseSchema.parse);
}


