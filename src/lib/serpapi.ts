export type SerpApiHotelOption = {
  name: string;
  area: string;
  hotelId: string;
  vendor: string;
  price: string;
  nightlyRate: number | null;
  tax: number | null;
  source: "live";
};

type SerpApiPriceBlock = {
  source?: string;
  rate_per_night?: {
    lowest?: string;
    extracted_lowest?: number;
    before_taxes_fees?: string;
    extracted_before_taxes_fees?: number;
  };
};

type SerpApiProperty = {
  name?: string;
  description?: string;
  nearby_places?: Array<{ name?: string }>;
  rate_per_night?: {
    lowest?: string;
    extracted_lowest?: number;
    before_taxes_fees?: string;
    extracted_before_taxes_fees?: number;
  };
  prices?: SerpApiPriceBlock[];
};

type SerpApiHotelsResponse = {
  properties?: SerpApiProperty[];
};

const SERPAPI_ENDPOINT = "https://serpapi.com/search?engine=google_hotels";

function extractArea(location: string) {
  return location.split(",")[0]?.trim() || location.trim();
}

function formatLivePrice(
  cheapestPrice: string | undefined,
  beforeTaxes: string | undefined,
  nightlyRate: number | null,
  tax: number | null,
) {
  if (cheapestPrice) return cheapestPrice;

  if (nightlyRate !== null && tax !== null && tax > 0) {
    return `$${nightlyRate.toFixed(0)} + $${tax.toFixed(0)} taxes & fees`;
  }

  if (beforeTaxes) return beforeTaxes;

  if (nightlyRate !== null) {
    return `$${nightlyRate.toFixed(0)} per night`;
  }

  return "";
}

function normalizeHotel(property: SerpApiProperty, area: string, index: number): SerpApiHotelOption | null {
  const name = property.name?.trim();
  if (!name) return null;

  const primaryRate = property.rate_per_night;
  const firstVendorOffer = property.prices?.[0];
  const vendor = firstVendorOffer?.source?.trim() || "Google Hotels";
  const nightlyRate =
    primaryRate?.extracted_lowest ?? firstVendorOffer?.rate_per_night?.extracted_lowest ?? null;
  const beforeTaxesValue =
    primaryRate?.extracted_before_taxes_fees ??
    firstVendorOffer?.rate_per_night?.extracted_before_taxes_fees ??
    null;
  const tax =
    nightlyRate !== null && beforeTaxesValue !== null && nightlyRate > beforeTaxesValue
      ? nightlyRate - beforeTaxesValue
      : null;

  const price = formatLivePrice(
    primaryRate?.lowest ?? firstVendorOffer?.rate_per_night?.lowest,
    primaryRate?.before_taxes_fees ?? firstVendorOffer?.rate_per_night?.before_taxes_fees,
    nightlyRate,
    tax,
  );

  return {
    name,
    area,
    hotelId: `${name}-${index}`,
    vendor,
    price,
    nightlyRate,
    tax,
    source: "live",
  };
}

export async function lookupSerpApiHotels(
  location: string,
  arrivalDate: string,
  departureDate: string,
) {
  try {
    const apiKey = process.env.SERPAPI_API_KEY?.trim();
    if (!apiKey) return [];

    const area = extractArea(location);
    if (!area || !arrivalDate || !departureDate) return [];

    const params = new URLSearchParams({
      engine: "google_hotels",
      q: `${location} hotels`,
      check_in_date: arrivalDate,
      check_out_date: departureDate,
      adults: "2",
      currency: "USD",
      hl: "en",
      gl: "us",
      sort_by: "3",
      api_key: apiKey,
    });

    const response = await fetch(`${SERPAPI_ENDPOINT}&${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as SerpApiHotelsResponse;
    if (!Array.isArray(payload.properties)) {
      return [];
    }

    return payload.properties
      .map((property, index) => normalizeHotel(property, area, index))
      .filter((hotel): hotel is SerpApiHotelOption => Boolean(hotel))
      .slice(0, 8);
  } catch {
    return [];
  }
}
