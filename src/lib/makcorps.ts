export type MakCorpsHotelOption = {
  name: string;
  area: string;
  hotelId: string;
  vendor: string;
  price: string;
  nightlyRate: number | null;
  tax: number | null;
  source: "live";
};

type MakCorpsPricingBlock = Record<string, string | number | null | undefined>;
type MakCorpsHotelEntry = [
  {
    hotelName?: string;
    hotelId?: string;
  },
  MakCorpsPricingBlock[],
];

type ParsedOffer = {
  vendor: string;
  nightlyRate: number;
  tax: number | null;
};

const AUTH_ENDPOINT = "https://api.makcorps.com/auth";
const FREE_ENDPOINT = "https://api.makcorps.com/free";

let cachedJwtToken: string | null = null;

function extractCity(location: string) {
  return location.split(",")[0]?.trim() || location.trim();
}

function parseNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatLivePrice(rate: number, tax: number | null) {
  if (tax && tax > 0) {
    return `$${rate.toFixed(0)} + $${tax.toFixed(0)} tax`;
  }

  return `$${rate.toFixed(0)} per night`;
}

function collectOffers(blocks: MakCorpsPricingBlock[]) {
  const offers: ParsedOffer[] = [];

  for (const block of blocks) {
    for (const [key, value] of Object.entries(block)) {
      const match = key.match(/^price(\d+)$/);
      if (!match) continue;

      const index = match[1];
      const nightlyRate = parseNumericValue(value);
      if (nightlyRate === null) continue;

      const vendorValue = block[`vendor${index}`];
      const vendor = typeof vendorValue === "string" ? vendorValue.trim() : "";
      const tax = parseNumericValue(block[`tax${index}`]);

      offers.push({
        vendor: vendor || "Market rate",
        nightlyRate,
        tax,
      });
    }
  }

  return offers.sort((left, right) => {
    const leftTotal = left.nightlyRate + (left.tax ?? 0);
    const rightTotal = right.nightlyRate + (right.tax ?? 0);
    return leftTotal - rightTotal;
  });
}

function normalizeHotelEntry(entry: MakCorpsHotelEntry, area: string): MakCorpsHotelOption | null {
  const [hotelMeta, pricingBlocks] = entry;
  const name = hotelMeta.hotelName?.trim();

  if (!name || !Array.isArray(pricingBlocks) || !pricingBlocks.length) {
    return null;
  }

  const cheapestOffer = collectOffers(pricingBlocks)[0];
  if (!cheapestOffer) return null;

  return {
    name,
    area,
    hotelId: hotelMeta.hotelId?.trim() || name,
    vendor: cheapestOffer.vendor,
    price: formatLivePrice(cheapestOffer.nightlyRate, cheapestOffer.tax),
    nightlyRate: cheapestOffer.nightlyRate,
    tax: cheapestOffer.tax,
    source: "live",
  };
}

async function getJwtToken() {
  if (cachedJwtToken) return cachedJwtToken;

  const username = process.env.MAKCORPS_USERNAME?.trim();
  const password = process.env.MAKCORPS_PASSWORD?.trim();

  if (!username || !password) {
    return null;
  }

  const response = await fetch(AUTH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: username,
      secret: password,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { token?: string };
  const token = payload.token?.trim();

  if (!token) {
    return null;
  }

  cachedJwtToken = token;
  return cachedJwtToken;
}

export async function lookupMakCorpsHotels(location: string) {
  try {
    const token = await getJwtToken();
    if (!token) return [];

    const city = extractCity(location);
    if (!city) return [];

    const response = await fetch(`${FREE_ENDPOINT}/${encodeURIComponent(city.toLowerCase())}`, {
      headers: {
        Authorization: `JWT ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((entry) => normalizeHotelEntry(entry as MakCorpsHotelEntry, city))
      .filter((entry): entry is MakCorpsHotelOption => Boolean(entry))
      .slice(0, 8);
  } catch {
    return [];
  }
}
