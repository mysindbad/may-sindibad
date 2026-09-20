import "server-only";
import { ilike, eq, and, or } from "drizzle-orm";
import { db } from "@/db";
import { places } from "@/db/schema";
import type { AiToolDefinition } from "./provider";
import { escapeLikePattern, normalizeAiToolText } from "./tool-input";

// Tool-calling scaffold: Sindbad AI can query real internal data instead of
// hallucinating it. Only read-only, side-effect-free lookups are exposed for
// now; booking/mutation tools should go through the normal authenticated API
// so ownership and payment rules stay enforced in one place.
export const AI_TOOLS: AiToolDefinition[] = [
  {
    name: "search_places",
    description: "Search My Sindbad's verified places database by city, optional country, and optional keyword.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City to search in, e.g. Marrakech" },
        country: { type: "string", description: "Optional country to disambiguate cities with the same name" },
        keyword: { type: "string", description: "Optional keyword, e.g. beach, museum, seafood" },
      },
      required: ["city"],
    },
  },
];

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "search_places") {
    const cityInput = normalizeAiToolText(args.city, 120, true);
    const countryInput = normalizeAiToolText(args.country, 120);
    const keywordInput = normalizeAiToolText(args.keyword, 200);
    if (!cityInput.ok) return { error: cityInput.reason === "required" ? "city is required" : "city is invalid" };
    if (!countryInput.ok) return { error: "country is invalid" };
    if (!keywordInput.ok) return { error: "keyword is invalid" };

    const city = escapeLikePattern(cityInput.value!);
    const country = countryInput.value ? escapeLikePattern(countryInput.value) : undefined;
    const keyword = keywordInput.value ? escapeLikePattern(keywordInput.value) : undefined;

    const conditions = [ilike(places.city, city), eq(places.status, "approved")];
    if (country) conditions.push(ilike(places.country, country));
    if (keyword) {
      conditions.push(or(ilike(places.name, `%${keyword}%`), ilike(places.description, `%${keyword}%`))!);
    }

    const rows = await db
      .select({ id: places.id, name: places.name, description: places.description, rating: places.ratingAverage })
      .from(places)
      .where(and(...conditions))
      .limit(5);

    return { results: rows };
  }
  return { error: `Unknown tool: ${name}` };
}
