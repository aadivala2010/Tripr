import { z } from "zod";

export const activitySchema = z.object({
  time: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  visited: z.boolean(),
});

export const hotelSourceSchema = z.enum(["live", "fallback"]);

export const hotelSchema = z.object({
  name: z.string().min(1),
  area: z.string().default(""),
  priceLevel: z.string().default(""),
  price: z.string().default(""),
  vendor: z.string().default(""),
  source: hotelSourceSchema.default("fallback"),
  description: z.string().min(1),
});

export const daySchema = z.object({
  day: z.number().int().positive(),
  theme: z.string().min(1),
  summary: z.string().min(1),
  activities: z.array(activitySchema).min(1),
});

export const tripSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  location: z.string().min(1),
  arrivalDate: z.string().default(""),
  departureDate: z.string().default(""),
  duration: z.string().min(1),
  budget: z.string().min(1),
  interests: z.array(z.string().min(1)).default([]),
  hotelRecommendations: z.array(hotelSchema).default([]),
  days: z.array(daySchema).min(1),
});

export const tripEnvelopeSchema = z.object({
  trip: tripSchema,
});

export const tripRequestSchema = z.object({
  location: z.string().min(2),
  arrivalDate: z.string().min(1),
  departureDate: z.string().min(1),
  days: z.coerce.number().int().positive(),
  nights: z.coerce.number().int().min(0),
  budget: z.string().min(1),
  interests: z.string().min(2),
});

export const chatEditRequestSchema = z.object({
  instruction: z.string().min(2),
  trip: tripSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().min(1),
      }),
    )
    .default([]),
});

export const chatResponseSchema = z.object({
  message: z.string().min(1),
  tripUpdated: z.boolean(),
  trip: tripSchema,
});

export type Activity = z.infer<typeof activitySchema>;
export type HotelSource = z.infer<typeof hotelSourceSchema>;
export type HotelRecommendation = z.infer<typeof hotelSchema>;
export type DayPlan = z.infer<typeof daySchema>;
export type Trip = z.infer<typeof tripSchema>;
export type TripEnvelope = z.infer<typeof tripEnvelopeSchema>;
export type TripRequest = z.infer<typeof tripRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
