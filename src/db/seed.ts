// Development seed data. Everything created here is marked sourceType:
// "seed" so the UI can honestly label it and it's never confused with a
// live third-party feed or real community/provider content.
//
// Run with: npm run db:seed
import "dotenv/config";
import { db, pool } from "./index";
import { placeCategories, places, providers, providerServices, users } from "./schema";
import { hashPassword } from "@/lib/auth/password";

const CATEGORIES: Array<{ slug: string; labelKey: string; icon: string; sortOrder: number }> = [
  { slug: "attraction", labelKey: "categories.attraction", icon: "landmark", sortOrder: 0 },
  { slug: "beach", labelKey: "categories.beach", icon: "waves", sortOrder: 1 },
  { slug: "restaurant", labelKey: "categories.restaurant", icon: "utensils", sortOrder: 2 },
  { slug: "cafe", labelKey: "categories.cafe", icon: "coffee", sortOrder: 3 },
  { slug: "hotel", labelKey: "categories.hotel", icon: "bed", sortOrder: 4 },
  { slug: "activity", labelKey: "categories.activity", icon: "compass", sortOrder: 5 },
  { slug: "tour", labelKey: "categories.tour", icon: "map", sortOrder: 6 },
  { slug: "transport", labelKey: "categories.transport", icon: "car", sortOrder: 7 },
];

const DEMO_PLACES: Array<{
  name: string;
  category: string;
  city: string;
  country: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel: number;
  description: string;
  rating: number;
  ratingCount: number;
}> = [
  {
    name: "Jemaa el-Fnaa",
    category: "attraction",
    city: "Marrakech",
    country: "Morocco",
    address: "Jemaa el-Fnaa, Marrakech",
    lat: 31.6258,
    lng: -7.9891,
    priceLevel: 0,
    description: "Marrakech's iconic main square — storytellers, food stalls and the gateway to the souks.",
    rating: 4.6,
    ratingCount: 128,
  },
  {
    name: "Majorelle Garden",
    category: "attraction",
    city: "Marrakech",
    country: "Morocco",
    address: "Rue Yves Saint Laurent, Marrakech",
    lat: 31.6416,
    lng: -8.0031,
    priceLevel: 2,
    description: "A cobalt-blue botanical garden once owned by Yves Saint Laurent.",
    rating: 4.7,
    ratingCount: 94,
  },
  {
    name: "Nomad Rooftop",
    category: "restaurant",
    city: "Marrakech",
    country: "Morocco",
    address: "Souk Semmarine, Marrakech",
    lat: 31.6295,
    lng: -7.9871,
    priceLevel: 2,
    description: "Modern Moroccan rooftop dining overlooking the medina.",
    rating: 4.5,
    ratingCount: 61,
  },
  {
    name: "Café des Épices",
    category: "cafe",
    city: "Marrakech",
    country: "Morocco",
    address: "Place Rahba Lakdima, Marrakech",
    lat: 31.6288,
    lng: -7.9863,
    priceLevel: 1,
    description: "Relaxed spice-square café loved by locals and travellers alike.",
    rating: 4.3,
    ratingCount: 40,
  },
  {
    name: "Riad Yasmine",
    category: "hotel",
    city: "Marrakech",
    country: "Morocco",
    address: "Derb Zaouia, Marrakech",
    lat: 31.6308,
    lng: -7.9845,
    priceLevel: 2,
    description: "A restored riad with a plunge pool and rooftop breakfast.",
    rating: 4.8,
    ratingCount: 76,
  },
  {
    name: "Essaouira Beach",
    category: "beach",
    city: "Essaouira",
    country: "Morocco",
    address: "Plage d'Essaouira",
    lat: 31.5085,
    lng: -9.7595,
    priceLevel: 0,
    description: "Windswept Atlantic beach, popular for kitesurfing and sunset walks.",
    rating: 4.6,
    ratingCount: 52,
  },
  {
    name: "Skala de la Ville",
    category: "attraction",
    city: "Essaouira",
    country: "Morocco",
    address: "Skala de la Ville, Essaouira",
    lat: 31.5142,
    lng: -9.7716,
    priceLevel: 0,
    description: "Historic seafront ramparts with cannons and ocean views.",
    rating: 4.5,
    ratingCount: 33,
  },
  {
    name: "Chef Chaouen Blue Alleys",
    category: "attraction",
    city: "Chefchaouen",
    country: "Morocco",
    address: "Medina, Chefchaouen",
    lat: 35.1688,
    lng: -5.2636,
    priceLevel: 0,
    description: "The famous blue-washed streets of the Rif mountains.",
    rating: 4.8,
    ratingCount: 88,
  },
  {
    name: "Restaurant Beldi Bab Ssour",
    category: "restaurant",
    city: "Chefchaouen",
    country: "Morocco",
    address: "Bab Ssour, Chefchaouen",
    lat: 35.1701,
    lng: -5.2622,
    priceLevel: 1,
    description: "Home-style tagines with a terrace over the old town.",
    rating: 4.4,
    ratingCount: 29,
  },
  {
    name: "Hassan II Mosque",
    category: "attraction",
    city: "Casablanca",
    country: "Morocco",
    address: "Boulevard Sidi Mohammed Ben Abdallah, Casablanca",
    lat: 33.6084,
    lng: -7.6325,
    priceLevel: 1,
    description: "One of the largest mosques in the world, right on the Atlantic.",
    rating: 4.7,
    ratingCount: 150,
  },
  {
    name: "Rick's Café",
    category: "restaurant",
    city: "Casablanca",
    country: "Morocco",
    address: "Boulevard Sour Jdid, Casablanca",
    lat: 33.6027,
    lng: -7.6187,
    priceLevel: 3,
    description: "Casablanca-film-inspired supper club in a restored mansion.",
    rating: 4.4,
    ratingCount: 67,
  },
  {
    name: "Kasbah of the Udayas",
    category: "attraction",
    city: "Rabat",
    country: "Morocco",
    address: "Kasbah des Oudayas, Rabat",
    lat: 34.0347,
    lng: -6.8355,
    priceLevel: 0,
    description: "A whitewashed and blue kasbah overlooking the river mouth.",
    rating: 4.6,
    ratingCount: 58,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo My Sindbad data in production.");
  }
  console.log("Seeding demo data (sourceType='seed') …");

  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const [row] = await db
      .insert(placeCategories)
      .values(category)
      .onConflictDoNothing({ target: placeCategories.slug })
      .returning();
    if (row) categoryIds.set(category.slug, row.id);
  }
  // Ensure ids are known even if rows already existed (conflict path returns nothing).
  if (categoryIds.size < CATEGORIES.length) {
    const existing = await db.select().from(placeCategories);
    for (const row of existing) categoryIds.set(row.slug, row.id);
  }

  for (const place of DEMO_PLACES) {
    await db
      .insert(places)
      .values({
        name: place.name,
        description: place.description,
        categoryId: categoryIds.get(place.category) ?? null,
        city: place.city,
        country: place.country,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        priceLevel: place.priceLevel,
        ratingAverage: place.rating,
        ratingCount: place.ratingCount,
        sourceType: "seed",
        status: "approved",
      })
      .onConflictDoNothing();
  }

  const demoProviderEmail = "demo.provider@mysindbad.dev";
  const existingUsers = await db.select().from(users);
  let demoProviderUser = existingUsers.find((u) => u.email === demoProviderEmail);

  if (!demoProviderUser) {
    [demoProviderUser] = await db
      .insert(users)
      .values({
        email: demoProviderEmail,
        name: "Atlas Tours (Demo)",
        passwordHash: hashPassword("Sindbad#Demo123"),
        role: "provider",
      })
      .returning();
  }

  const existingProviders = await db.select().from(providers);
  let demoProvider = existingProviders.find((p) => p.name === "Atlas Desert Tours (Demo)");
  if (!demoProvider) {
    [demoProvider] = await db
      .insert(providers)
      .values({
        ownerUserId: demoProviderUser.id,
        name: "Atlas Desert Tours (Demo)",
        categoryId: categoryIds.get("tour") ?? null,
        description: "Sample marketplace listing seeded for local development. Not a real business.",
        city: "Marrakech",
        country: "Morocco",
        address: "Avenue Mohammed V, Marrakech",
        lat: 31.6295,
        lng: -7.9811,
        phone: "+212 600-000000",
        email: demoProviderEmail,
        verificationStatus: "verified",
      })
      .returning();
  }

  const existingServices = await db.select().from(providerServices);
  if (!existingServices.some((s) => s.providerId === demoProvider!.id)) {
    await db.insert(providerServices).values([
      {
        providerId: demoProvider!.id,
        category: "tour",
        name: "Full-day Atlas Mountains & Berber Villages (DEMO)",
        description: "Sample bookable service for local development and QA only.",
        priceAmount: "65.00",
        priceCurrency: "USD",
        durationMinutes: 480,
        capacity: 12,
      },
      {
        providerId: demoProvider!.id,
        category: "activity",
        name: "Sunset Camel Ride (DEMO)",
        description: "Sample bookable service for local development and QA only.",
        priceAmount: "35.00",
        priceCurrency: "USD",
        durationMinutes: 120,
        capacity: 20,
      },
    ]);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
