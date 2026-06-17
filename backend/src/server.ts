import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const frontendPublicDir = path.resolve(projectRoot, "frontend", "public");
const frontendDistDir = path.resolve(projectRoot, "frontend", "dist");
const frontendIndexPath = path.join(frontendDistDir, "index.html");
const hfImageDir = path.resolve(frontendPublicDir, "images", "hellofresh");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";

app.use(cors());
app.use(express.json({ limit: "3mb" }));

type Tier =
  | "Himmel auf Erden"
  | "Henkersmahlzeit"
  | "Mamas Klassiker"
  | "Mc Donalds"
  | string;

type RecipeStep = {
  title?: string;
  text: string;
  imageUrl?: string;
};

type Recipe = {
  id: string;
  name: string;
  tier: Tier;
  kcal: number;
  protein: number;
  durationMinutes: number;
  imageUrl: string;
  sourceUrl?: string;
  tags: string[];
  ingredients: string[];
  instructions?: RecipeStep[];
  estimatedCost?: number;
  priceNote?: string;
  importedAt?: string | null;
  lastUsed?: string | null;
};

type DayKey = "Mo" | "Di" | "Mi" | "Do" | "Fr" | "Sa" | "So";

type Settings = {
  targetKcal: number;
  targetProtein: number;
  mealsPerDay: number;
  dailyMealCounts: Record<DayKey, number>;
  shakeProteinWater: number;
  shakeProteinMilk: number;
  shakeKcalWater: number;
  shakeKcalMilk: number;
  girlfriendPortionFactor: number;
  avoidRepeatDays: number;
};

type MealSlot = { day: string; mealIndex: 1 | 2; recipe: Recipe };
type ShoppingRange = "all" | "mon-thu" | "fri-sun";

type DayPlan = {
  day: string;
  meals: MealSlot[];
  mealKcal: number;
  mealProtein: number;
  shakes: string[];
  totalKcalWithShakes: number;
  totalProteinWithShakes: number;
};

type WeekPlan = {
  id: string;
  createdAt: string;
  days: DayPlan[];
  settingsSnapshot: Settings;
  remixMemory?: Record<string, string[]>;
};

type HistoryEntry = {
  id: string;
  createdAt: string;
  recipeIds: string[];
  plan?: WeekPlan;
};

type ShoppingState = {
  checked: Record<string, boolean>;
};

type PantryState = {
  items: Record<string, boolean>;
  names?: Record<string, string>;
  categories?: Record<string, string>;
};

const days: DayKey[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const defaultDailyMealCounts = Object.fromEntries(
  days.map((day) => [day, 2]),
) as Settings["dailyMealCounts"];

async function readJson<T>(file: string, fallback: T): Promise<T> {
  return readStore<T>(file, fallback);
}

async function writeJson(file: string, data: unknown) {
  await writeStore(file, data);
}

function shoppingKeyForName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function shoppingStateKey(planId: string, range: ShoppingRange, itemKey: string) {
  return `${planId}:${range}:${itemKey}`;
}

function singleShoppingStateKey(recipeId: string, itemKey: string) {
  return `single:${recipeId}:${itemKey}`;
}

async function readShoppingState() {
  return readJson<ShoppingState>("shoppingState.json", { checked: {} });
}

async function writeShoppingState(data: ShoppingState) {
  await writeJson("shoppingState.json", data);
}

async function readPantryState() {
  const pantry = await readJson<PantryState>("pantry.json", {
    items: {},
    names: {},
    categories: {},
  });
  pantry.names = pantry.names || {};
  pantry.categories = pantry.categories || {};
  return pantry;
}

async function writePantryState(data: PantryState) {
  await writeJson("pantry.json", data);
}

function settingsFallback(): Settings {
  return {
    targetKcal: 2300,
    targetProtein: 180,
    mealsPerDay: 2,
    dailyMealCounts: { ...defaultDailyMealCounts },
    shakeProteinWater: 24,
    shakeProteinMilk: 41,
    shakeKcalWater: 120,
    shakeKcalMilk: 440,
    girlfriendPortionFactor: 0.6,
    avoidRepeatDays: 21,
  };
}

function sanitizeMealCount(value: unknown, fallback = 2) {
  const numeric = Number(value);
  if (numeric === 0 || numeric === 1 || numeric === 2) return numeric;
  return fallback === 0 || fallback === 1 || fallback === 2 ? fallback : 2;
}

function normalizeDailyMealCounts(
  value: unknown,
  mealsPerDayFallback = 2,
): Settings["dailyMealCounts"] {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const fallback = sanitizeMealCount(mealsPerDayFallback, 2);
  return Object.fromEntries(
    days.map((day) => [
      day,
      sanitizeMealCount(source[day], fallback),
    ]),
  ) as Settings["dailyMealCounts"];
}

function normalizeSettings(value: Partial<Settings> | null | undefined): Settings {
  const fallback = settingsFallback();
  const next = { ...fallback, ...(value || {}) };
  next.mealsPerDay = sanitizeMealCount(next.mealsPerDay, fallback.mealsPerDay);
  next.dailyMealCounts = normalizeDailyMealCounts(
    (value as Partial<Settings> | undefined)?.dailyMealCounts,
    next.mealsPerDay,
  );
  return next;
}

async function readSettings() {
  return normalizeSettings(
    await readJson<Partial<Settings>>("settings.json", settingsFallback()),
  );
}

function estimateRecipeCost(recipe: Recipe): {
  estimatedCost: number;
  priceNote: string;
} {
  const tags = (recipe.tags || []).map((t) => t.toLowerCase());
  const ingredients = (recipe.ingredients || []).join(" ").toLowerCase();
  let cost = 1.15; // Basis für Öl, Gewürze, kleine Saucen, Vorrat

  // Fleisch aus der Metzgerei der Eltern wird mit 0 € angesetzt.
  const freeMeatTags = [
    "hähnchen",
    "chicken",
    "rind",
    "steak",
    "hackfleisch",
    "bacon",
    "schwein",
  ];
  const hasFreeMeat =
    tags.some((t) => freeMeatTags.includes(t)) ||
    /(hähnchen|chicken|rind|steak|hack|bacon|schwein|schnitzel)/.test(
      ingredients,
    );

  if (tags.includes("reis") || ingredients.includes("reis")) cost += 0.45;
  if (tags.includes("kartoffeln") || ingredients.includes("kartoffel"))
    cost += 0.75;
  if (tags.includes("burger") || ingredients.includes("brötchen")) cost += 0.85;
  if (tags.includes("spätzle") || ingredients.includes("spätzle")) cost += 1.15;
  if (tags.includes("gnocchi") || ingredients.includes("gnocchi")) cost += 1.25;
  if (
    tags.includes("pasta") ||
    ingredients.includes("pasta") ||
    ingredients.includes("nudel")
  )
    cost += 0.75;
  if (
    tags.includes("salat") ||
    /(salat|gurke|tomate|avocado|kohlrabi|paprika|brokkoli|pak choi|gemüse)/.test(
      ingredients,
    )
  )
    cost += 1.95;
  if (
    tags.includes("käse") ||
    /(käse|mozzarella|parmesan|joghurt|sahne|ricotta)/.test(ingredients)
  )
    cost += 1.35;
  if (
    tags.includes("asiatisch") ||
    /(hoisin|gochujang|soja|teriyaki|sesam|curry)/.test(ingredients)
  )
    cost += 0.9;
  if (tags.includes("garnelen") || ingredients.includes("garnelen"))
    cost += 3.2;
  if (
    tags.includes("fisch") ||
    ingredients.includes("fisch") ||
    ingredients.includes("seelachs")
  )
    cost += 2.6;
  if (
    !hasFreeMeat &&
    /(tofu|hirtenkäse|grillkäse|blumenkohl)/.test(ingredients)
  )
    cost += 1.4;

  const rounded = Math.max(0.5, Math.round(cost * 10) / 10);
  return {
    estimatedCost: rounded,
    priceNote: hasFreeMeat
      ? "Schätzung pro Portion, Fleisch mit 0 € gerechnet."
      : "Schätzung pro Portion nach groben REWE-Standardpreisen.",
  };
}

function enrichRecipe(recipe: Recipe): Recipe {
  const price = estimateRecipeCost(recipe);
  return { ...recipe, ...price };
}

function enrichPlan(plan: WeekPlan): WeekPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: day.meals.map((slot) => ({
        ...slot,
        recipe: enrichRecipe(slot.recipe),
      })),
    })),
  };
}

function rangeLabel(range: ShoppingRange) {
  if (range === "mon-thu") return "Montag bis Donnerstag";
  if (range === "fri-sun") return "Freitag bis Sonntag";
  return "Gesamte Woche";
}

function daysForRange(range: ShoppingRange) {
  if (range === "mon-thu") return new Set(["Mo", "Di", "Mi", "Do"]);
  if (range === "fri-sun") return new Set(["Fr", "Sa", "So"]);
  return new Set(days);
}

function tierScore(tier: string): number {
  const t = tier.toLowerCase();
  if (t.includes("himmel")) return 120;
  if (t.includes("henker")) return 95;
  if (t.includes("mamas")) return 65;
  if (t.includes("mcdonald") || t.includes("mc donald")) return 35;
  return 15;
}

function daysSince(dateStr?: string | null) {
  if (!dateStr) return 9999;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function commonCount(a: string[], b: string[]) {
  const s = new Set(a.map((x) => x.toLowerCase()));
  return b.filter((x) => s.has(x.toLowerCase())).length;
}

function scoreRecipe(
  recipe: Recipe,
  context: {
    selected: Recipe[];
    recentIds: Set<string>;
    settings: Settings;
    currentDayMeals: Recipe[];
    targetMealKcal: number;
    targetMealProtein: number;
    avoidSameIds?: Set<string>;
    remixOldRecipe?: Recipe;
  },
) {
  let score = tierScore(recipe.tier);
  const kcalDiff = Math.abs(recipe.kcal - context.targetMealKcal);
  const proteinDiff = Math.abs(recipe.protein - context.targetMealProtein);
  score -= kcalDiff * 0.05;
  score -= proteinDiff * 0.9;

  if (context.recentIds.has(recipe.id)) score -= 90;
  if (context.avoidSameIds?.has(recipe.id)) score -= 9999;
  if (context.selected.some((r) => r.id === recipe.id)) score -= 9999;

  const selectedTags = context.selected.flatMap((r) => r.tags || []);
  const selectedIngredients = context.selected.flatMap(
    (r) => r.ingredients || [],
  );
  score += Math.min(commonCount(recipe.tags || [], selectedTags) * 4, 20);
  score += Math.min(
    commonCount(recipe.ingredients || [], selectedIngredients) * 3,
    18,
  );

  const dayTags = context.currentDayMeals.flatMap((r) => r.tags || []);
  if (commonCount(recipe.tags || [], dayTags) > 1) score -= 20;

  const allTags = context.selected.flatMap((r) => r.tags || []);
  for (const tag of recipe.tags || []) {
    const count = allTags.filter(
      (t) => t.toLowerCase() === tag.toLowerCase(),
    ).length;
    if (count >= 3) score -= 22;
  }

  if (context.remixOldRecipe) {
    score +=
      commonCount(recipe.tags || [], context.remixOldRecipe.tags || []) * 16;
    score +=
      commonCount(
        recipe.ingredients || [],
        context.remixOldRecipe.ingredients || [],
      ) * 8;
    score -= Math.abs(recipe.kcal - context.remixOldRecipe.kcal) * 0.04;
    score -= Math.abs(recipe.protein - context.remixOldRecipe.protein) * 0.5;
  }

  score += Math.random() * 18;
  return score;
}


function scoreRecipeStable(
  recipe: Recipe,
  context: Parameters<typeof scoreRecipe>[1],
  salt = 0,
) {
  // Wie scoreRecipe, aber mit kleinerem Zufallsanteil. Für Remix wird danach bewusst aus den Top-Kandidaten gewichtet gewählt.
  return scoreRecipe(recipe, context) + Math.random() * (8 + salt);
}

function weightedPick<T>(items: T[], weight: (item: T, index: number) => number): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((item, index) => Math.max(1, weight(item, index)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}

function findPlanSlot(plan: WeekPlan, day: string, mealIndex: 1 | 2) {
  const dayPlanIndex = plan.days.findIndex((d) => d.day === day);
  if (dayPlanIndex < 0) return null;
  const slotIndex = plan.days[dayPlanIndex].meals.findIndex(
    (m) => m.mealIndex === mealIndex,
  );
  if (slotIndex < 0) return null;
  return { dayPlanIndex, slotIndex };
}

function saveReplacementToPlan(
  plan: WeekPlan,
  history: HistoryEntry[],
  historyIndex: number,
  dayPlanIndex: number,
  slotIndex: number,
  replacement: Recipe,
  settings: Settings,
) {
  plan.days[dayPlanIndex].meals[slotIndex].recipe = replacement;
  plan.days[dayPlanIndex] = updateDayTotals(plan.days[dayPlanIndex], settings);
  history[historyIndex].plan = plan;
  history[historyIndex].recipeIds = plan.days.flatMap((d) =>
    d.meals.map((m) => m.recipe.id),
  );
}

function getRecentIds(history: HistoryEntry[], settings: Settings) {
  const recent = new Set<string>();
  for (const entry of history) {
    const age = daysSince(entry.createdAt);
    if (age <= settings.avoidRepeatDays) {
      for (const id of entry.recipeIds || []) recent.add(id);
    }
  }
  return recent;
}

function chooseShakes(
  mealKcal: number,
  mealProtein: number,
  settings: Settings,
) {
  const options = [
    [] as string[],
    ["Wasser"],
    ["Milch"],
    ["Wasser", "Wasser"],
    ["Milch", "Wasser"],
    ["Milch", "Milch"],
    ["Milch", "Wasser", "Wasser"],
  ];
  let best = options[0];
  let bestScore = Infinity;
  for (const option of options) {
    const kcal =
      mealKcal +
      option.reduce(
        (sum, s) =>
          sum +
          (s === "Milch" ? settings.shakeKcalMilk : settings.shakeKcalWater),
        0,
      );
    const protein =
      mealProtein +
      option.reduce(
        (sum, s) =>
          sum +
          (s === "Milch"
            ? settings.shakeProteinMilk
            : settings.shakeProteinWater),
        0,
      );
    const kcalDiff = Math.abs(settings.targetKcal - kcal);
    const proteinDiff =
      Math.max(0, settings.targetProtein - protein) * 12 +
      Math.max(0, protein - settings.targetProtein) * 2;
    const tooMany = option.length > 2 ? 80 : 0;
    const score = kcalDiff + proteinDiff + tooMany;
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}

function buildWeekPlan(
  recipes: Recipe[],
  history: HistoryEntry[],
  settings: Settings,
): WeekPlan {
  const dailyMealCounts = normalizeDailyMealCounts(
    settings.dailyMealCounts,
    settings.mealsPerDay,
  );
  const plannedMealCount = days.reduce(
    (sum, day) => sum + dailyMealCounts[day],
    0,
  );
  if (plannedMealCount < 1) {
    throw new Error("Bitte mindestens ein Gericht pro Woche einplanen.");
  }
  if (recipes.length < plannedMealCount) {
    throw new Error(
      `Zu wenige Rezepte vorhanden. Für diese Einstellungen werden mindestens ${plannedMealCount} Rezepte benötigt.`,
    );
  }

  const selected: Recipe[] = [];
  const recentIds = getRecentIds(history, settings);
  const dayPlans: DayPlan[] = [];
  const targetMealKcal = Math.round(
    (settings.targetKcal - settings.shakeKcalMilk - settings.shakeKcalWater) /
      2,
  );
  const targetMealProtein = Math.round(
    (settings.targetProtein -
      settings.shakeProteinMilk -
      settings.shakeProteinWater) /
      2,
  );

  for (const day of days) {
    const currentDayMeals: Recipe[] = [];
    const mealCount = dailyMealCounts[day];
    const mealIndexes = Array.from(
      { length: mealCount },
      (_, index) => (index + 1) as 1 | 2,
    );
    for (const mealIndex of mealIndexes) {
      const ranked = [...recipes].sort(
        (a, b) =>
          scoreRecipe(b, {
            selected,
            recentIds,
            settings,
            currentDayMeals,
            targetMealKcal,
            targetMealProtein,
          }) -
          scoreRecipe(a, {
            selected,
            recentIds,
            settings,
            currentDayMeals,
            targetMealKcal,
            targetMealProtein,
          }),
      );
      const picked = ranked[0];
      selected.push(picked);
      currentDayMeals.push(picked);
    }
    const mealKcal = currentDayMeals.reduce((sum, r) => sum + r.kcal, 0);
    const mealProtein = currentDayMeals.reduce((sum, r) => sum + r.protein, 0);
    const shakes =
      currentDayMeals.length > 0
        ? chooseShakes(mealKcal, mealProtein, settings)
        : [];
    const totalKcalWithShakes =
      mealKcal +
      shakes.reduce(
        (sum, s) =>
          sum +
          (s === "Milch" ? settings.shakeKcalMilk : settings.shakeKcalWater),
        0,
      );
    const totalProteinWithShakes =
      mealProtein +
      shakes.reduce(
        (sum, s) =>
          sum +
          (s === "Milch"
            ? settings.shakeProteinMilk
            : settings.shakeProteinWater),
        0,
      );

    dayPlans.push({
      day,
      meals: currentDayMeals.map((recipe, idx) => ({
        day,
        mealIndex: (idx + 1) as 1 | 2,
        recipe,
      })),
      mealKcal,
      mealProtein,
      shakes,
      totalKcalWithShakes,
      totalProteinWithShakes,
    });
  }

  return {
    id: nanoid(10),
    createdAt: new Date().toISOString(),
    days: dayPlans,
    settingsSnapshot: settings,
  };
}

function updateDayTotals(day: DayPlan, settings: Settings): DayPlan {
  const mealKcal = day.meals.reduce((sum, m) => sum + m.recipe.kcal, 0);
  const mealProtein = day.meals.reduce((sum, m) => sum + m.recipe.protein, 0);
  const shakes = chooseShakes(mealKcal, mealProtein, settings);
  return {
    ...day,
    mealKcal,
    mealProtein,
    shakes,
    totalKcalWithShakes:
      mealKcal +
      shakes.reduce(
        (sum, s) =>
          sum +
          (s === "Milch" ? settings.shakeKcalMilk : settings.shakeKcalWater),
        0,
      ),
    totalProteinWithShakes:
      mealProtein +
      shakes.reduce(
        (sum, s) =>
          sum +
          (s === "Milch"
            ? settings.shakeProteinMilk
            : settings.shakeProteinWater),
        0,
      ),
  };
}


type ShoppingSource = "hellofresh" | "fallback" | "shake";

type NormalizedShoppingItem = {
  name: string;
  amount: number;
  unit: string;
  category: string;
  recipeName: string;
  source: ShoppingSource;
};

type ShoppingListSlot = {
  recipe: Recipe;
  recipeName?: string;
};

type ShoppingListMode = "exact" | "package" | "mealprep";

type ShoppingListOptions = {
  packageAdjusted?: boolean;
  recipeMultiplier?: number;
};

type AggregatedShoppingItem = {
  name: string;
  amount: number;
  unit: string;
  recipes: Set<string>;
  category: string;
  sources: Set<ShoppingSource>;
};

type PurchaseAmount = {
  purchaseQuantity: number;
  purchaseUnit: string;
  purchaseLabel?: string;
  remainderQuantity?: number;
  remainderUnit?: string;
  packageAdjusted: boolean;
  packageNote?: string;
};

const FLEISCH_REGEX =
  /(hähnchen|chicken|rind|steak|hack|hackfleisch|bacon|schwein|schnitzel|bratwurst|köfte|koefte|pulled chicken)/i;

function categoryForItem(name: string) {
  const n = name.toLowerCase();
  if (FLEISCH_REGEX.test(n) || /(garnelen|fisch|seelachs|lachs)/.test(n))
    return "Protein";
  if (/(reis|kartoffel|brötchen|brot|spätzle|spaetzle|gnocchi|pasta|nudel|rigatoni|conchiglie|tortellini|wrap|tortilla|bulgur|couscous)/.test(n))
    return "Kohlenhydrate";
  if (/(salat|gurke|tomate|avocado|kohlrabi|paprika|brokkoli|pak choi|gemüse|mais|kidneybohnen|bohnen|karotte|porree|zwiebel|frühlingszwiebel|knoblauch|birne|zitrone|limette|blumenkohl|wirsing|kraut|sultaninen|kräuter|petersilie|schnittlauch|basilikum)/.test(n))
    return "Gemüse & Obst";
  if (/(milch|käse|mozzarella|parmesan|joghurt|sahne|ricotta|hirtenkäse|grillkäse|butter)/.test(n))
    return "Milchprodukte";
  if (/(sauce|soße|sosse|saucen|curry|gewürz|senf|soja|hoisin|gochujang|teriyaki|sesam|honig|brühe|bruehe|öl|essig|salz|pfeffer|paprikapulver|paniermehl|semmelbrösel|ingwerpaste|tomatenmark)/.test(n))
    return "Saucen, Gewürze & Vorrat";
  if (/(esn|proteinpulver|shake)/.test(n)) return "Shakes";
  return "Sonstiges";
}

function cleanIngredientName(raw: string) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bBio\b/gi, "")
    .replace(/\bmulticolor\b/gi, "")
    .replace(/\bglatt\/Schnittlauch\b/gi, "Petersilie/Schnittlauch")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIngredientAmount(line: string):
  | { amount: number; unit: string; name: string; source: ShoppingSource }
  | null {
  const original = stripTags(String(line || "")).replace(/\s+/g, " ").trim();
  if (!original) return null;
  if (/kann spuren|allergene|nicht in deiner lieferung|utensilien/i.test(original))
    return null;

  const pantryMatch = original.match(/^(nach Geschmack|etwas|ein wenig)\s+(.+)$/i);
  if (pantryMatch) {
    return {
      amount: 1,
      unit: "prüfen",
      name: cleanIngredientName(pantryMatch[2]),
      source: "hellofresh",
    };
  }

  const match = original.match(/^(\d+(?:[,.]\d+)?|½|¼|¾|⅓|⅔)\s*(g|kg|ml|l|stück|stk\.?|el|esslöffel|tl|teelöffel|becher|dose|dosen|packung|packungen|bund|zehe|zehen|scheibe|scheiben)?\s+(.+)$/i);
  if (!match) {
    return { amount: 1, unit: "prüfen", name: cleanIngredientName(original), source: "hellofresh" };
  }

  const pantryNames = /(honig|salz|pfeffer|öl|oel|olivenöl|essig|senf|sojasauce|sojasoße|hoisin|gochujang|teriyaki|gewürz|gewuerz|brühe|bruehe|tomatenmark|sesam|zucker|mehl|paniermehl|semmelbrösel|ingwerpaste|mayonnaise|ketchup)/i;
  const possibleName = cleanIngredientName(match[3] || "");
  if (pantryNames.test(possibleName)) {
    return { amount: 1, unit: "prüfen", name: possibleName, source: "hellofresh" };
  }

  const rawAmount = match[1]
    .replace("½", "0.5")
    .replace("¼", "0.25")
    .replace("¾", "0.75")
    .replace("⅓", "0.333")
    .replace("⅔", "0.667")
    .replace(",", ".");
  let amount = Number(rawAmount);
  let unit = (match[2] || "Stück").toLowerCase();
  let name = cleanIngredientName(match[3]);

  if (Number.isNaN(amount)) amount = 1;
  if (unit === "kg") {
    amount *= 1000;
    unit = "g";
  }
  if (unit === "l") {
    amount *= 1000;
    unit = "ml";
  }
  if (unit === "stk.") unit = "Stück";
  if (unit === "stück") unit = "Stück";
  if (unit === "esslöffel") unit = "EL";
  if (unit === "teelöffel") unit = "TL";
  if (unit === "dose" || unit === "dosen") unit = "Dose";
  if (unit === "packung" || unit === "packungen") unit = "Packung";
  return { amount, unit, name, source: "hellofresh" };
}

function hasDetailedIngredients(recipe: Recipe) {
  return (recipe.ingredients || []).some((ingredient) =>
    /^(\d|½|¼|¾|⅓|⅔|nach Geschmack|etwas)/i.test(String(ingredient).trim()),
  );
}

function fallbackItemsForRecipe(recipe: Recipe): NormalizedShoppingItem[] {
  const text = `${recipe.name} ${(recipe.tags || []).join(" ")} ${(recipe.ingredients || []).join(" ")}`.toLowerCase();
  const items: { name: string; amount: number; unit: string }[] = [];

  const add = (name: string, amount: number, unit: string) => items.push({ name, amount, unit });

  if (/(hähnchen|chicken|pollo|pulled chicken)/.test(text)) add("Hähnchen/Chicken", 220, "g");
  if (/(rind|steak|bulgogi|köfte|koefte)/.test(text)) add("Rind/Steak", 220, "g");
  if (/(hack|hackfleisch|fleischbällchen|hackbällchen|sloppy)/.test(text)) add("Hackfleisch", 220, "g");
  if (/(schwein|schnitzel|schweinefilet)/.test(text)) add("Schwein/Schnitzel", 220, "g");
  if (/bacon/.test(text)) add("Bacon", 60, "g");
  if (/garnelen/.test(text)) add("Garnelen", 180, "g");
  if (/(fisch|seelachs|fish)/.test(text)) add("Fisch/Seelachs", 220, "g");

  if (/reis|bowl|bulgogi|curry|mezze|köfte|koefte/.test(text)) add("Reis", 90, "g trocken");
  if (/kartoffel|chips|schnitzel/.test(text)) add("Kartoffeln", 320, "g");
  if (/burger/.test(text)) add("Burgerbrötchen", 1, "Stück");
  if (/spätzle|spaetzle/.test(text)) add("Spätzle", 220, "g");
  if (/gnocchi/.test(text)) add("Gnocchi", 250, "g");
  if (/pasta|rigatoni|conchiglie|tortellini/.test(text)) add("Pasta/Nudeln", 120, "g");
  if (/wrap|taco|flautas|burrito/.test(text)) add("Tortillas/Wraps", 2, "Stück");

  if (/paprika/.test(text)) add("Paprika", 1, "Stück");
  if (/pak choi/.test(text)) add("Pak Choi", 200, "g");
  if (/kohlrabi/.test(text)) add("Kohlrabi", 1, "Stück");
  if (/brokkoli/.test(text)) add("Brokkoli", 200, "g");
  if (/tomate|tomaten/.test(text)) add("Tomaten", 200, "g");
  if (/salat|caesar|burger/.test(text)) add("Salat", 1, "Kopf/Packung");
  if (/gurke/.test(text)) add("Gurke", 0.5, "Stück");
  if (/avocado/.test(text)) add("Avocado", 1, "Stück");
  if (/mais/.test(text)) add("Mais", 1, "Dose");
  if (/kidneybohnen/.test(text)) add("Kidneybohnen", 1, "Dose");
  if (/zwiebel|burger|hack|mezze|sloppy/.test(text)) add("Zwiebel", 1, "Stück");
  if (/knoblauch|asiatisch|gochujang|hoisin|teriyaki/.test(text)) add("Knoblauch", 1, "Zehe");
  if (/frühlingszwiebel|bulgogi|korean|teriyaki/.test(text)) add("Frühlingszwiebel", 1, "Bund");
  if (/birne/.test(text)) add("Birne", 1, "Stück");
  if (/blumenkohl/.test(text)) add("Blumenkohl", 1, "Stück");
  if (/wirsing/.test(text)) add("Wirsing", 250, "g");

  if (/käse|kaese|mozzarella|parmigiana|auflauf|taco|burger/.test(text)) add("Käse/Mozzarella/Parmesan", 100, "g");
  if (/joghurt|dip|mezze/.test(text)) add("Joghurt", 100, "g");
  if (/sahne|rahm|alla panna|senfrahm/.test(text)) add("Sahne/ Kochsahne", 100, "ml");
  if (/ricotta/.test(text)) add("Ricotta", 120, "g");
  if (/hirtenkäse|griechisch/.test(text)) add("Hirtenkäse", 150, "g");
  if (/grillkäse/.test(text)) add("Grillkäse", 150, "g");

  if (/gochujang|korean/.test(text)) add("Gochujang", 1, "prüfen");
  if (/hoisin/.test(text)) add("Hoisin-Sauce", 1, "prüfen");
  if (/soja|teriyaki|bulgogi|asiatisch/.test(text)) add("Sojasauce", 1, "prüfen");
  if (/teriyaki/.test(text)) add("Teriyaki-Sauce", 1, "prüfen");
  if (/curry/.test(text)) add("Currygewürz/-paste", 1, "prüfen");
  if (/senf/.test(text)) add("Senf", 1, "prüfen");
  if (/honig/.test(text)) add("Honig", 1, "prüfen");
  if (/sesam|korean|asiatisch/.test(text)) add("Sesam", 1, "prüfen");
  if (/panade|schnitzel|nuggets|brösel|broesel/.test(text)) add("Paniermehl/Semmelbrösel", 80, "g");
  add("Öl, Salz, Pfeffer", 1, "prüfen");

  return items.map((item) => ({
    ...item,
    category: categoryForItem(item.name),
    recipeName: recipe.name,
    source: "fallback",
  }));
}

function getRecipeShoppingItems(
  recipe: Recipe,
  settings: Settings,
  recipeMultiplier = 1,
): NormalizedShoppingItem[] {
  const peopleFactor = 1 + settings.girlfriendPortionFactor;
  const parsed: NormalizedShoppingItem[] = [];

  if (hasDetailedIngredients(recipe)) {
    // HelloFresh-Zutaten sind normalerweise für 2 Portionen angegeben.
    const hfMultiplier = peopleFactor / 2;
    for (const line of recipe.ingredients || []) {
      const parsedLine = parseIngredientAmount(line);
      if (!parsedLine) continue;
      parsed.push({
        name: parsedLine.name,
        amount: parsedLine.amount * hfMultiplier * recipeMultiplier,
        unit: parsedLine.unit,
        category: categoryForItem(parsedLine.name),
        recipeName: recipe.name,
        source: "hellofresh",
      });
    }
    if (parsed.length > 0) return parsed;
  }

  return fallbackItemsForRecipe(recipe).map((item) => ({
    ...item,
    amount:
      item.unit === "prüfen"
        ? item.amount
        : item.amount * peopleFactor * recipeMultiplier,
  }));
}

function normalizeShoppingKey(name: string, unit: string) {
  const n = name.toLowerCase().trim();
  const aliases: [RegExp, string][] = [
    [/^bio\s+/, ""],
    [/honig.*/i, "Honig"],
    [/salz.*/i, "Salz"],
    [/pfeffer.*/i, "Pfeffer"],
    [/öl|oel|olivenöl/i, "Öl"],
    [/butter.*/i, "Butter"],
    [/senf.*/i, "Senf"],
    [/gochujang.*/i, "Gochujang"],
    [/hoisin.*/i, "Hoisin-Sauce"],
    [/teriyaki.*/i, "Teriyaki-Sauce"],
    [/sesam.*/i, "Sesam"],
    [/ingwerpaste.*/i, "Ingwerpaste"],
    [/hähnchenbrustfilet|hähnchenbrust|hähnchengeschnetzeltes|hähnchenschenkel|hähnchenkeule|chicken/i, "Hähnchen/Chicken"],
    [/rinderhackfleisch|bio rinderhack|rinderhack|hackfleisch/i, "Hackfleisch"],
    [/rindersteak|rindfleisch|steak/i, "Rind/Steak"],
    [/seelachs|fisch/i, "Fisch/Seelachs"],
    [/frühlingszwiebel.*/i, "Frühlingszwiebel"],
    [/basmatireis|jasminreis|reis/i, "Reis"],
    [/kokosmilch/i, "Kokosmilch"],
    [/sojasoße|sojasosse|sojasauce/i, "Sojasauce"],
    [/kochsa(h|h)ne|sahne/i, "Sahne/ Kochsahne"],
    [/semmelbrösel|semmelbroesel|paniermehl/i, "Paniermehl/Semmelbrösel"],
    [/paprika.*/i, "Paprika"],
    [/tomaten.*/i, "Tomaten"],
    [/knoblauch.*/i, "Knoblauch"],
  ];

  let normalized = name.trim();
  for (const [re, replacement] of aliases) {
    if (re.test(n)) {
      normalized = replacement || name.replace(re, "").trim();
      break;
    }
  }
  const keyUnit = unit === "prüfen" ? "prüfen" : unit.toLowerCase();
  return `${normalized}__${keyUnit}`;
}

function formatAmount(amount: number, unit: string) {
  if (unit === "prüfen") return "prüfen";
  let rounded: number;
  if (["Stück", "Dose", "Packung", "Bund", "Zehe", "EL", "TL", "Kopf/Packung"].includes(unit)) {
    rounded = amount < 1 ? Math.ceil(amount * 2) / 2 : Math.ceil(amount);
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
    return `${text} ${unit}`;
  }
  if (unit === "ml" && amount >= 1000) {
    const liters = Math.round((amount / 1000) * 10) / 10;
    return `${String(liters).replace(".", ",")} l`;
  }
  if ((unit === "g" || unit.includes("trocken")) && amount >= 1000) {
    const kg = Math.round((amount / 1000) * 10) / 10;
    const suffix = unit.includes("trocken") ? " kg trocken" : " kg";
    return `${String(kg).replace(".", ",")}${suffix}`;
  }
  rounded = Math.max(1, Math.round(amount));
  return `${rounded} ${unit}`;
}

function roundUpToPackage(amount: number, packageSize: number) {
  if (amount <= 0) return packageSize;
  return Math.ceil(amount / packageSize) * packageSize;
}

function packageLabel(quantity: number, unit: string, noun?: string) {
  const amount = formatAmount(quantity, unit);
  return noun ? `${amount} ${noun}` : amount;
}

function isPantryStaple(name: string) {
  return /(öl|oel|olivenöl|salz|pfeffer|honig|senf|essig|sojasauce|sojasoße|sojasosse|hoisin|gochujang|teriyaki|gewürz|gewuerz|brühe|bruehe|tomatenmark|sesam|zucker|mehl|paniermehl|semmelbrösel|ingwerpaste|mayonnaise|ketchup)/i.test(name);
}

function applyPackageRounding(item: AggregatedShoppingItem): PurchaseAmount {
  const name = item.name.toLowerCase();
  const unit = item.unit;
  const amount = item.amount;
  const exact: PurchaseAmount = {
    purchaseQuantity: amount,
    purchaseUnit: unit,
    packageAdjusted: false,
  };

  if (FLEISCH_REGEX.test(name) || /(garnelen|fisch|seelachs|lachs)/i.test(name)) {
    return exact;
  }

  if (unit === "prüfen" || isPantryStaple(item.name)) {
    return {
      purchaseQuantity: 1,
      purchaseUnit: "prüfen",
      purchaseLabel: "Vorrat prüfen",
      packageAdjusted: true,
      packageNote: "Vorratsprodukt: Bestand prüfen statt exakte Kleinstmenge kaufen.",
    };
  }

  const withPackage = (
    packageSize: number,
    packageUnit = unit,
    labelNoun?: string,
    note?: string,
  ): PurchaseAmount => {
    const purchaseQuantity = roundUpToPackage(amount, packageSize);
    return {
      purchaseQuantity,
      purchaseUnit: packageUnit,
      purchaseLabel: packageLabel(purchaseQuantity, packageUnit, labelNoun),
      remainderQuantity:
        packageUnit === unit ? Math.max(0, purchaseQuantity - amount) : undefined,
      remainderUnit: packageUnit === unit ? packageUnit : undefined,
      packageAdjusted: purchaseQuantity !== amount || Boolean(labelNoun),
      packageNote: note,
    };
  };

  if (/(naturjoghurt|joghurt)/i.test(item.name) && unit === "g") {
    return withPackage(250, "g", "Becher", "Joghurt wird als 250-g-Becher gerechnet.");
  }
  if (/(sahne|kochsahne|cremefine)/i.test(item.name) && (unit === "ml" || unit === "g")) {
    return withPackage(200, unit, unit === "ml" ? "Becher" : "Packung", "Sahne wird als 200er-Packung gerechnet.");
  }
  if (/(schmand|crème fraîche|creme fraiche)/i.test(item.name) && unit === "g") {
    return withPackage(200, "g", "Becher", "Schmand/Crème fraîche wird als 200-g-Becher gerechnet.");
  }
  if (/(frischkäse|frischkaese)/i.test(item.name) && unit === "g") {
    return withPackage(200, "g", "Packung", "Frischkäse wird als 200-g-Packung gerechnet.");
  }
  if (/butter/i.test(item.name) && unit === "g") {
    return withPackage(250, "g", "Packung", "Butter wird als 250-g-Packung gerechnet.");
  }
  if (/(käse|kaese|gerieben|gouda|parmesan|mozzarella|hirtenkäse|grillkäse|ricotta)/i.test(item.name) && unit === "g") {
    return amount <= 100
      ? withPackage(100, "g", "Packung", "Käse wird auf eine realistische Packung gerundet.")
      : withPackage(150, "g", "Packung", "Käse wird auf 150-g-Packungen gerundet.");
  }

  if (/(reis|pasta|nudel|rigatoni|conchiglie|tortellini|gnocchi)/i.test(item.name) && (unit === "g" || unit.includes("trocken"))) {
    return withPackage(500, unit, "Packung", "Kohlenhydrate werden als 500-g-Packung gerechnet.");
  }
  if (/(kartoffel|süßkartoffel|suesskartoffel)/i.test(item.name)) {
    if (unit === "g") return withPackage(1000, "g", "Netz", "Kartoffeln werden mindestens als 1-kg-Einkauf gerechnet.");
    if (/stück/i.test(unit)) {
      const purchaseQuantity = Math.max(1, Math.ceil(amount));
      return {
        purchaseQuantity,
        purchaseUnit: unit,
        packageAdjusted: purchaseQuantity !== amount,
      };
    }
  }
  if (/(burgerbrötchen|burgerbroetchen|brioche|bun|brötchen|broetchen)/i.test(item.name)) {
    const neededPieces = /stück/i.test(unit)
      ? amount
      : unit === "g"
        ? Math.max(1, Math.ceil(amount / 80))
        : amount;
    const purchaseQuantity = roundUpToPackage(neededPieces, 4);
    return {
      purchaseQuantity,
      purchaseUnit: "Stück",
      purchaseLabel: `${purchaseQuantity}er-Pack`,
      remainderQuantity: Math.max(0, purchaseQuantity - neededPieces),
      remainderUnit: "Stück",
      packageAdjusted: true,
      packageNote: "Burger Buns werden als 4er-Pack gerechnet.",
    };
  }

  if (/(kräuter|kraeuter|petersilie|schnittlauch|basilikum)/i.test(item.name)) {
    return {
      purchaseQuantity: 1,
      purchaseUnit: "Bund",
      purchaseLabel: "1 Bund/Packung",
      packageAdjusted: true,
      packageNote: "Frische Kräuter werden als Bund oder Packung gekauft.",
    };
  }

  if (/(stück|stk|zehe|bund|kopf\/packung|packung|dose)/i.test(unit)) {
    const purchaseQuantity = Math.max(1, Math.ceil(amount));
    return {
      purchaseQuantity,
      purchaseUnit: unit,
      packageAdjusted: purchaseQuantity !== amount,
    };
  }

  return exact;
}

function buildShoppingListForSlots(
  slots: ShoppingListSlot[],
  settings: Settings,
  checkedKeyForItem: (itemKey: string) => string,
  pantry: PantryState = { items: {} },
  shoppingState: ShoppingState = { checked: {} },
  extraItems: NormalizedShoppingItem[] = [],
  options: ShoppingListOptions = {},
) {
  const totals = new Map<string, AggregatedShoppingItem>();

  function add(item: NormalizedShoppingItem) {
    if (!item.name || /lieferung enthalten/i.test(item.name)) return;
    const key = normalizeShoppingKey(item.name, item.unit);
    const displayName = key.split("__")[0];
    const existing = totals.get(key) || {
      name: displayName,
      amount: 0,
      unit: item.unit,
      recipes: new Set<string>(),
      category: item.category,
      sources: new Set<ShoppingSource>(),
    };
    if (item.unit === "prüfen") {
      existing.amount = Math.max(existing.amount, 1);
    } else {
      existing.amount += item.amount;
    }
    existing.recipes.add(item.recipeName);
    existing.sources.add(item.source);
    totals.set(key, existing);
  }

  for (const slot of slots) {
    for (const item of getRecipeShoppingItems(
      slot.recipe,
      settings,
      options.recipeMultiplier || 1,
    )) {
      add({
        ...item,
        recipeName: slot.recipeName || item.recipeName,
      });
    }
  }
  for (const item of extraItems) add(item);

  return [...totals.values()]
    .map((v) => {
      const itemKey = shoppingKeyForName(v.name);
      const neededText = formatAmount(v.amount, v.unit);
      const purchase = options.packageAdjusted
        ? applyPackageRounding(v)
        : {
            purchaseQuantity: v.amount,
            purchaseUnit: v.unit,
            packageAdjusted: false,
          };
      const purchaseText = purchase.purchaseLabel || formatAmount(
        purchase.purchaseQuantity,
        purchase.purchaseUnit,
      );
      const remainderText =
        typeof purchase.remainderQuantity === "number" &&
        purchase.remainderQuantity > 0 &&
        purchase.remainderUnit
          ? formatAmount(purchase.remainderQuantity, purchase.remainderUnit)
          : undefined;
      const numericAmount = purchase.purchaseUnit === "prüfen"
        ? 1
        : Math.max(1, Math.round(purchase.purchaseQuantity));
      return {
        key: itemKey,
        name: v.name,
        amount: numericAmount,
        amountText: options.packageAdjusted ? purchaseText : neededText,
        unit: purchase.purchaseUnit,
        neededQuantity: v.unit === "prüfen" ? undefined : v.amount,
        neededUnit: v.unit,
        neededText,
        purchaseQuantity: purchase.purchaseUnit === "prüfen" ? undefined : purchase.purchaseQuantity,
        purchaseUnit: purchase.purchaseUnit,
        purchaseLabel: purchase.purchaseLabel,
        purchaseText,
        remainderQuantity: purchase.remainderQuantity,
        remainderUnit: purchase.remainderUnit,
        remainderText,
        packageAdjusted: purchase.packageAdjusted,
        packageNote: purchase.packageNote,
        recipes: [...v.recipes].slice(0, 12),
        category: v.category,
        checked: Boolean(shoppingState.checked[checkedKeyForItem(itemKey)]),
        inPantry: Boolean(pantry.items[itemKey]),
        estimatedCost: estimateShoppingItemCost(v.name, numericAmount, purchase.purchaseUnit),
        priceNote: priceNoteForShoppingItem(v.name),
        source: v.sources.has("hellofresh") ? "HelloFresh-Zutaten" : v.sources.has("fallback") ? "geschätzt" : "Shake",
      };
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category, "de") ||
        a.name.localeCompare(b.name, "de"),
    );
}

function buildShoppingList(
  plan: WeekPlan,
  settings: Settings,
  range: ShoppingRange = "all",
  pantry: PantryState = { items: {} },
  shoppingState: ShoppingState = { checked: {} },
) {
  const slots: ShoppingListSlot[] = [];
  const extraItems: NormalizedShoppingItem[] = [];
  const allowedDays = daysForRange(range);
  for (const day of plan.days.filter((d) => allowedDays.has(d.day))) {
    for (const meal of day.meals) {
      slots.push({ recipe: meal.recipe });
    }
    for (const shake of day.shakes) {
      extraItems.push({
        name: "ESN Proteinpulver",
        amount: 30,
        unit: "g",
        category: "Shakes",
        recipeName: `${day.day} Shake`,
        source: "shake",
      });
      if (shake === "Milch") {
        extraItems.push({
          name: "Milch 3,5 %",
          amount: 500,
          unit: "ml",
          category: "Milchprodukte",
          recipeName: `${day.day} Shake`,
          source: "shake",
        });
      }
    }
  }

  return buildShoppingListForSlots(
    slots,
    settings,
    (itemKey) => shoppingStateKey(plan.id, range, itemKey),
    pantry,
    shoppingState,
    extraItems,
    { packageAdjusted: true },
  );
}

function totalEstimatedCost(items: { estimatedCost?: number }[]) {
  return (
    Math.round(
      items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0) * 100,
    ) / 100
  );
}

function pantryCatalogFromState(pantry: PantryState) {
  return Object.keys(pantry.items || {}).map((key) => ({
    key,
    name: pantry.names?.[key] || key,
    category: pantry.categories?.[key] || "Zuhause",
    inPantry: Boolean(pantry.items[key]),
  }));
}

function groupShoppingItems(items: ReturnType<typeof buildShoppingListForSlots>) {
  return items.reduce<Record<string, typeof items>>((groups, item) => {
    const category = item.category || "Sonstiges";
    groups[category] = groups[category] || [];
    groups[category].push(item);
    return groups;
  }, {});
}

function estimateShoppingItemCost(name: string, amount: number, unit: string) {
  const n = name.toLowerCase();
  const u = unit.toLowerCase();
  if (FLEISCH_REGEX.test(n)) return 0;
  if (n.includes("milch"))
    return Math.round((amount / 1000) * 1.25 * 100) / 100;
  if (n.includes("esn")) return Math.round((amount / 30) * 0.9 * 100) / 100;
  if (n.includes("reis")) return Math.round((amount / 1000) * 2.99 * 100) / 100;
  if (n.includes("kartoffel") && /stück/.test(u))
    return Math.round(amount * 0.79 * 100) / 100;
  if (n.includes("kartoffel"))
    return Math.round((amount / 1000) * 1.79 * 100) / 100;
  if (/(burgerbrötchen|burgerbroetchen|brioche|bun|brötchen|broetchen)/.test(n)) {
    if (/stück/.test(u)) return Math.round((Math.ceil(amount) / 4) * 1.79 * 100) / 100;
    return Math.round((amount / 320) * 1.79 * 100) / 100;
  }
  if (n.includes("wrap") || n.includes("tortilla"))
    return Math.round((Math.ceil(amount) / 6) * 1.99 * 100) / 100;
  if (n.includes("spätzle"))
    return Math.round((amount / 500) * 1.99 * 100) / 100;
  if (n.includes("gnocchi"))
    return Math.round((amount / 500) * 1.99 * 100) / 100;
  if (/(pasta|nudel|rigatoni|conchiglie|tortellini)/.test(n))
    return Math.round((amount / 500) * 1.49 * 100) / 100;
  if (/(käse|mozzarella|parmesan|hirtenkäse|grillkäse|ricotta)/.test(n))
    return Math.round((amount / 250) * 2.49 * 100) / 100;
  if (/(joghurt|sahne|kokosmilch)/.test(n))
    return Math.round((amount / 500) * 1.49 * 100) / 100;
  if (n.includes("garnelen"))
    return Math.round((amount / 250) * 4.99 * 100) / 100;
  if (/(fisch|seelachs|lachs)/.test(n)) return Math.round((amount / 400) * 4.49 * 100) / 100;
  if (
    /(salat|gemüse|paprika|brokkoli|kohlrabi|tomaten|gurke|avocado|pak choi|karotte|porree|zwiebel|frühlingszwiebel|knoblauch|birne|blumenkohl|wirsing|mais|bohnen|zitrone|limette)/.test(n)
  ) {
    if (/(avocado)/.test(n)) return Math.round(amount * 1.19 * 100) / 100;
    if (/(dose|dosen)/.test(u)) return Math.round(amount * 0.99 * 100) / 100;
    if (/(stück|bund|zehe|kopf)/.test(u)) return Math.round(amount * 0.79 * 100) / 100;
    return Math.round((amount / 1000) * 4.5 * 100) / 100;
  }
  if (u.includes("prüfen")) return 1.5;
  return Math.round((amount / 1000) * 3.0 * 100) / 100;
}

function priceNoteForShoppingItem(name: string) {
  return FLEISCH_REGEX.test(name)
    ? "Fleischkosten auf 0 € gesetzt."
    : "Grobe REWE-Schätzung.";
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .trim();
}

function stripTags(value: string) {
  return htmlDecode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function cleanInstructionStepText(value: string) {
  let text = htmlDecode(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // HelloFresh hängt nach dem letzten Schritt oft weitere Seitenbereiche an.
  // Alles nach diesen Markern gehört nicht mehr zur Kochanleitung.
  const stopMarkers = [
    /Rezeptideen mit ähnlichen Zutaten/i,
    /Ähnliche Rezepte/i,
    /Weitere Rezepte/i,
    /Das könnte dir auch gefallen/i,
    /Bewertungen/i,
    /Nährwertangaben/i,
    /Zutaten/i,
    /Utensilien/i,
  ];

  let cutIndex = -1;
  for (const marker of stopMarkers) {
    const match = text.match(marker);
    if (match?.index !== undefined) {
      cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
    }
  }
  if (cutIndex >= 0) text = text.slice(0, cutIndex).trim();

  const appetitIndex = text.search(/Guten Appetit!?/i);
  if (appetitIndex >= 0) {
    const match = text.slice(appetitIndex).match(/Guten Appetit!?/i);
    if (match) {
      text = text.slice(0, appetitIndex + match[0].length).trim();
    }
  }

  // Manche Steps beginnen wegen der HTML-Struktur nochmal mit der Stepnummer.
  text = text.replace(/^\d+\s+/, "").trim();

  return text;
}

function getMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return htmlDecode(match[1]);
  }
  return undefined;
}



function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(htmlDecode(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const anyValue = value as Record<string, unknown>;
    return firstString(anyValue.url || anyValue.src || anyValue.path);
  }
  return undefined;
}

function imageFromValue(value: unknown): string | undefined {
  const raw = firstString(value);
  if (!raw) return undefined;
  return normalizeImageUrl(raw);
}

function normalizeImageUrl(raw: string) {
  let url = htmlDecode(raw)
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();

  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("/")) return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
  return url;
}

function isUsefulFoodImage(url: string, purpose: "hero" | "step" = "hero") {
  const u = url.toLowerCase();
  if (!/^https?:\/\//.test(u)) return false;
  if (/(logo|favicon|sprite|icon|facebook|twitter|instagram|pinterest|apple-touch|placeholder|transparent|blank)/.test(u))
    return false;
  if (!/(hellofresh|ctfassets|img\.hellofresh|images\.ctfassets|hfweb)/.test(u))
    return false;
  if (purpose === "hero" && /(ingredient|ingredients|allergen|utensil|step-|step_|how-to|instruction|zubereitung)/.test(u))
    return false;
  return true;
}

function findImageUrls(html: string) {
  const urls = new Set<string>();
  const regexes = [
    /https?:\\?\/\\?\/[^"'\\\s)<>]+?(?:\.(?:jpg|jpeg|png|webp)|\/image\/upload)[^"'\\\s)<>]*/gi,
    /https?:\/\/[^"'\s)<>]+?(?:\.(?:jpg|jpeg|png|webp)|\/image\/upload)[^"'\s)<>]*/gi,
    /https?:\/\/images\.ctfassets\.net\/[^"'\s)<>]+/gi,
    /https?:\/\/img\.hellofresh\.com\/[^"'\s)<>]+/gi,
  ];
  for (const re of regexes) {
    for (const m of html.matchAll(re)) {
      const normalized = normalizeImageUrl(m[0]);
      if (normalized && isUsefulFoodImage(normalized, "step")) urls.add(normalized);
    }
  }
  return [...urls];
}

function collectRecipeJsonLd(html: string) {
  const found: any[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  function visit(node: any) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const type = node["@type"];
    const typeText = Array.isArray(type) ? type.join(" ") : String(type || "");
    if (typeText.toLowerCase().includes("recipe")) found.push(node);
    if (node["@graph"]) visit(node["@graph"]);
    if (node.mainEntity) visit(node.mainEntity);
  }

  for (const match of html.matchAll(re)) {
    const json = safeJsonParse(match[1]);
    visit(json);
  }
  return found[0];
}

function extractNextData(html: string): any | null {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  return safeJsonParse(m[1]);
}

function collectStringsDeep(node: unknown, predicate: (value: string, key?: string) => boolean, limit = 120) {
  const found: string[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown, key?: string) {
    if (found.length >= limit || value == null) return;
    if (typeof value === "string") {
      const decoded = htmlDecode(value);
      if (predicate(decoded, key)) found.push(decoded);
      return;
    }
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      visit(v, k);
    }
  }

  visit(node);
  return [...new Set(found)];
}

function extractInstructionsFromNextData(nextData: any): RecipeStep[] {
  if (!nextData) return [];
  const texts = collectStringsDeep(
    nextData,
    (value, key) => {
      const text = stripTags(value).trim();
      return (
        text.length > 55 &&
        text.length < 1200 &&
        !/cookie|datenschutz|newsletter|rabatt|login|thermomix|tm5|tm6|allergene|zutaten|nährwert|kochbox/i.test(text) &&
        (
          /erhitze|schneide|verrühr|brat|koch|gib|lasse|verteile|servier|back|würz|vermisch|wasch|raspel|topf|pfanne/i.test(text) ||
          /instruction|preparation|step|text|description/i.test(String(key || ""))
        )
      );
    },
    18,
  );

  return texts
    .map((text, index) => ({
      title: `Schritt ${index + 1}`,
      text: stripTags(text).replace(/^\d+\.?\s*/, ""),
    }))
    .filter((step, index, arr) => step.text && arr.findIndex((s) => s.text === step.text) === index)
    .slice(0, 8);
}

function extractStepImagesFromJsonLd(jsonLd: any): string[] {
  const urls: string[] = [];
  const instructions = Array.isArray(jsonLd?.recipeInstructions)
    ? jsonLd.recipeInstructions
    : [];
  for (const step of instructions) {
    const img = imageFromValue(step?.image);
    if (img && isUsefulFoodImage(img, "step")) urls.push(img);
  }
  return urls;
}

function srcSetCandidates(srcset: string) {
  // Nicht an Kommas splitten: HelloFresh-URLs enthalten selbst Kommas, z. B. w_750,q_auto,...
  // Stattdessen URLs bis zum Width-Descriptor lesen.
  const urls: string[] = [];
  const re = /(https?:\/\/\S+?)(?=\s+\d+[wx](?:,|$)|\s*$)/gi;
  for (const match of srcset.matchAll(re)) {
    const normalized = normalizeImageUrl(match[1].replace(/,$/, ""));
    if (normalized) urls.push(normalized);
  }
  return urls;
}

function extractBestImgFromBlock(block: string) {
  // Bei HelloFresh ist src meist schon die passende 750px-Step-URL.
  const srcMatch = block.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  const src = srcMatch?.[1] ? normalizeImageUrl(srcMatch[1]) : undefined;
  if (src && isUsefulFoodImage(src, "step") && !looksLikeHeaderLogo(src)) return src;

  const srcSetMatch = block.match(/<img[^>]+(?:srcSet|srcset)=["']([^"']+)["'][^>]*>/i);
  if (srcSetMatch?.[1]) {
    const candidates = srcSetCandidates(srcSetMatch[1]).filter((url) =>
      isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url),
    );
    return candidates[candidates.length - 1] || candidates[0];
  }
  return undefined;
}

function extractInstructionBlocksFromHtml(html: string): RecipeStep[] {
  const steps: RecipeStep[] = [];
  const stepRegex = /<div[^>]+data-test-id=["']instruction-step["'][^>]*>([\s\S]*?)(?=<div[^>]+data-test-id=["']instruction-step["']|<\/section>|<\/main>|$)/gi;
  for (const match of html.matchAll(stepRegex)) {
    const block = match[1];
    const imageUrl = extractBestImgFromBlock(block);

    const textParts = block
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img[^>]*>/gi, " ")
      .split(/<\/p>|<br\s*\/?>|<\/li>/i)
      .map(stripTags)
      .map(cleanInstructionStepText)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !/^\d+$/.test(x))
      .filter((x) => !/gemüse schneiden|reis kochen|guten appetit/i.test(x))
      .filter((x) => !/cookie|datenschutz|newsletter|thermomix|tm5|tm6/i.test(x));

    const text = cleanInstructionStepText(textParts.join("\n\n"));
    if (text.length > 20 || imageUrl) {
      steps.push({
        title: `Schritt ${steps.length + 1}`,
        text: text || `Schritt ${steps.length + 1}`,
        imageUrl,
      });
    }
    if (steps.length >= 10) break;
  }
  return steps.filter((step, index, arr) => {
    const normalized = cleanInstructionStepText(step.text).replace(/\s+/g, " ").trim();
    return normalized.length > 0 && arr.findIndex((s) => cleanInstructionStepText(s.text).replace(/\s+/g, " ").trim() === normalized) === index;
  });
}

function extractImagesFromNextData(nextData: any) {
  if (!nextData) return [];
  return collectStringsDeep(
    nextData,
    (value, key) => {
      const normalized = normalizeImageUrl(value);
      return Boolean(
        normalized &&
          isUsefulFoodImage(normalized, "step") &&
          /(image|img|url|src|path|photo|picture)/i.test(String(key || "")),
      );
    },
    80,
  )
    .map((url) => normalizeImageUrl(url)!)
    .filter(Boolean);
}

async function downloadImage(url: string, basename: string) {
  const cleanUrl = htmlDecode(url);
  if (process.env.USE_LOCAL_IMAGE_DOWNLOAD !== "true") {
    return cleanUrl;
  }

  await fs.mkdir(hfImageDir, { recursive: true });
  const urlWithoutQuery = cleanUrl.split("?")[0];
  let ext = "jpg";
  const extMatch = urlWithoutQuery.match(/\.(jpg|jpeg|png|webp)$/i);
  if (extMatch) ext = extMatch[1].toLowerCase().replace("jpeg", "jpg");
  const filename = `${basename}.${ext}`;
  const filePath = path.join(hfImageDir, filename);
  const response = await fetch(cleanUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MealPilot/1.0",
      "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "referer": "https://www.hellofresh.de/",
    },
  });
  if (!response.ok)
    throw new Error(`Bild konnte nicht geladen werden: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL ist kein Bild (${contentType || "unbekannt"}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
  return `/images/hellofresh/${filename}`;
}

function looksLikeHeaderLogo(url: string) {
  return /(logo|hellofresh-logo|hf-logo|favicon|icon|brand)/i.test(url);
}

async function importHelloFreshData(recipe: Recipe) {
  if (!recipe.sourceUrl) throw new Error("Dieses Rezept hat keine sourceUrl.");
  const response = await fetch(recipe.sourceUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MealPilot/1.0",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "de-DE,de;q=0.9,en;q=0.7",
    },
  });
  if (!response.ok)
    throw new Error(
      `HelloFresh-Seite konnte nicht geladen werden: HTTP ${response.status}`,
    );

  const html = await response.text();
  const jsonLd = collectRecipeJsonLd(html);
  const nextData = extractNextData(html);
  const allImages = [
    ...extractStepImagesFromJsonLd(jsonLd),
    ...extractImagesFromNextData(nextData),
    ...findImageUrls(html),
  ].filter((url, index, arr) => url && arr.indexOf(url) === index);

  const heroCandidates = [
    imageFromValue(jsonLd?.image),
    getMeta(html, "og:image"),
    ...allImages,
  ].filter((url): url is string => Boolean(url && isUsefulFoodImage(url, "hero") && !looksLikeHeaderLogo(url)));

  const next: Recipe = { ...recipe };
  const heroImage = heroCandidates[0];

  if (heroImage) {
    try {
      next.imageUrl = await downloadImage(heroImage, `${recipe.id}-hero`);
    } catch (err) {
      console.warn(`Hero-Bild für ${recipe.name} konnte nicht lokal gespeichert werden:`, err);
      next.imageUrl = heroImage;
    }
  }

  const htmlInstructionSteps = extractInstructionBlocksFromHtml(html);

  if (jsonLd) {
    if (
      Array.isArray(jsonLd.recipeIngredient) &&
      jsonLd.recipeIngredient.length > 0
    ) {
      next.ingredients = jsonLd.recipeIngredient
        .map((x: unknown) => stripTags(String(x)))
        .filter((x: string) => x.length > 0)
        .slice(0, 60);
    }

    const instructions = Array.isArray(jsonLd.recipeInstructions)
      ? jsonLd.recipeInstructions
      : [];
    if (instructions.length > 0) {
      next.instructions = instructions
        .map((step: any, index: number) => ({
          title: step.name ? String(step.name) : `Schritt ${index + 1}`,
          text: cleanInstructionStepText(
            stripTags(String(step.text || step.name || step || "")).replace(
              /^\d+\.?\s*/,
              "",
            ),
          ),
          imageUrl: imageFromValue(step.image),
        }))
        .filter(
          (s: RecipeStep) =>
            s.text.length > 0 && !/thermomix|tm5|tm6/i.test(s.text),
        );
    }
  }

  if (htmlInstructionSteps.length > 0) {
    // HelloFresh rendert die sichtbaren Schrittbilder in data-test-id="instruction-step".
    // Diese Daten sind zuverlässiger als generische Bild-URLs aus dem Seitenkopf.
    next.instructions = htmlInstructionSteps.map((step, index) => ({
      title: step.title || `Schritt ${index + 1}`,
      text: cleanInstructionStepText(step.text),
      imageUrl: step.imageUrl,
    }));
  }

  if (!next.instructions || next.instructions.length === 0) {
    const nextInstructions = extractInstructionsFromNextData(nextData);
    if (nextInstructions.length > 0) next.instructions = nextInstructions;
  }

  if (!next.instructions || next.instructions.length === 0) {
    const prepIndex = html.search(/Zubereitung|Anleitung|recipeInstructions/i);
    const snippet =
      prepIndex >= 0 ? html.slice(prepIndex, prepIndex + 22000) : html;
    const roughSteps: RecipeStep[] = [];
    const parts = snippet
      .split(/(?:<li[^>]*>|<p[^>]*>|<div[^>]*>)/i)
      .map(stripTags);
    for (const part of parts) {
      const text = cleanInstructionStepText(part.replace(/\s+/g, " ").trim());
      if (
        text.length > 70 &&
        text.length < 1000 &&
        !/cookie|datenschutz|newsletter|login|thermomix|tm5|tm6|allergene|kochbox|rabatt/i.test(text) &&
        /erhitze|schneide|brat|koch|gib|lasse|servier|vermisch|pfanne|topf|verteile/i.test(text)
      ) {
        roughSteps.push({ title: `Schritt ${roughSteps.length + 1}`, text });
      }
      if (roughSteps.length >= 8) break;
    }
    if (roughSteps.length > 0) next.instructions = roughSteps;
  }

  if (next.instructions && next.instructions.length > 0) {
    const candidateStepImages = allImages
      .filter((url) => url !== heroImage && isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url))
      .filter((url, index, arr) => arr.indexOf(url) === index);

    for (let i = 0; i < next.instructions.length; i += 1) {
      let url = next.instructions[i].imageUrl;
      if (!url || !isUsefulFoodImage(url, "step") || looksLikeHeaderLogo(url)) {
        url = candidateStepImages[i];
      }
      if (!url) continue;
      try {
        next.instructions[i].imageUrl = await downloadImage(
          url,
          `${recipe.id}-step-${i + 1}`,
        );
      } catch (err) {
        console.warn(`Schrittbild ${i + 1} für ${recipe.name} konnte nicht gespeichert werden:`, err);
        if (isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url)) {
          next.instructions[i].imageUrl = url;
        } else {
          delete next.instructions[i].imageUrl;
        }
      }
    }
  }

  next.importedAt = new Date().toISOString();
  return next;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/check-pin", (req, res) => {
  const expectedPin = process.env.MEALPILOT_ADMIN_PIN?.trim();
  if (!expectedPin) return res.json({ enabled: false, ok: true });

  const pin = String((req.body as { pin?: unknown })?.pin || "");
  if (pin === expectedPin) return res.json({ enabled: true, ok: true });

  return res.status(401).json({ enabled: true, ok: false });
});

app.get("/api/recipes", async (_req, res) => {
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  res.json(recipes.map(enrichRecipe));
});

function parseShoppingListMode(value: unknown): ShoppingListMode {
  const mode = String(value || "package");
  return mode === "exact" || mode === "mealprep" ? mode : "package";
}

function parseMealprepFactor(value: unknown, mode: ShoppingListMode) {
  const fallback = mode === "mealprep" ? 2 : 1;
  const parsed = Number(String(value || fallback).replace(",", "."));
  if ([1, 1.5, 2].includes(parsed)) return parsed;
  return fallback;
}

app.get("/api/recipes/:recipeId/shopping-list", async (req, res) => {
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((r) => r.id === req.params.recipeId);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });

  const mode = parseShoppingListMode(req.query.mode);
  const requestedFactor = parseMealprepFactor(req.query.factor, mode);
  const recipeMultiplier = mode === "mealprep" ? requestedFactor : 1;
  const settings = await readSettings();
  const pantry = await readPantryState();
  const shoppingState = await readShoppingState();
  const items = buildShoppingListForSlots(
    [{ recipe }],
    settings,
    (itemKey) => singleShoppingStateKey(recipe.id, itemKey),
    pantry,
    shoppingState,
    [],
    {
      packageAdjusted: mode !== "exact",
      recipeMultiplier,
    },
  );

  res.json({
    recipe: enrichRecipe(recipe),
    factor: (1 + settings.girlfriendPortionFactor) * recipeMultiplier,
    requestedFactor,
    mode,
    range: "single",
    rangeLabel: recipe.name,
    totalEstimatedCost: totalEstimatedCost(items),
    estimatedTotal: totalEstimatedCost(items),
    pantryItems: pantry.items,
    pantryStatus: pantry.items,
    checkedStatus: Object.fromEntries(
      items.map((item) => [
        item.key,
        Boolean(shoppingState.checked[singleShoppingStateKey(recipe.id, item.key)]),
      ]),
    ),
    pantryCatalog: pantryCatalogFromState(pantry),
    categories: groupShoppingItems(items),
    grouped: groupShoppingItems(items),
    items,
  });
});

app.post("/api/recipes/:recipeId/shopping-check", async (req, res) => {
  const { itemKey, checked } = req.body as {
    itemKey: string;
    checked: boolean;
  };
  if (!itemKey) return res.status(400).json({ error: "itemKey fehlt." });

  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((r) => r.id === req.params.recipeId);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });

  const state = await readShoppingState();
  state.checked[singleShoppingStateKey(req.params.recipeId, itemKey)] =
    Boolean(checked);
  await writeShoppingState(state);
  res.json({ ok: true });
});

app.get("/api/recipes/:id", async (req, res) => {
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((r) => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });
  res.json(enrichRecipe(recipe));
});

app.post("/api/recipes/:id/import-source", async (req, res) => {
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const index = recipes.findIndex((r) => r.id === req.params.id);
  if (index < 0)
    return res.status(404).json({ error: "Rezept nicht gefunden." });
  try {
    const imported = await importHelloFreshData(recipes[index]);
    recipes[index] = imported;
    await writeJson("recipes.json", recipes);
    res.json(enrichRecipe(imported));
  } catch (error) {
    res
      .status(500)
      .json({
        error:
          error instanceof Error ? error.message : "Import fehlgeschlagen.",
      });
  }
});

app.post("/api/recipes/import-all", async (_req, res) => {
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  let imported = 0;
  const errors: { id: string; message: string }[] = [];
  for (let i = 0; i < recipes.length; i += 1) {
    if (!recipes[i].sourceUrl) continue;
    try {
      recipes[i] = await importHelloFreshData(recipes[i]);
      imported += 1;
      await writeJson("recipes.json", recipes);
    } catch (error) {
      errors.push({
        id: recipes[i].id,
        message:
          error instanceof Error ? error.message : "Import fehlgeschlagen.",
      });
    }
  }
  res.json({ imported, errors });
});

app.get("/api/settings", async (_req, res) => {
  res.json(await readSettings());
});

app.patch("/api/settings", async (req, res) => {
  const current = await readSettings();
  const body = req.body as Partial<Settings>;
  const allowed: Partial<Settings> = {};
  const numericFields: (keyof Omit<Settings, "dailyMealCounts">)[] = [
    "targetKcal",
    "targetProtein",
    "mealsPerDay",
    "shakeProteinWater",
    "shakeProteinMilk",
    "shakeKcalWater",
    "shakeKcalMilk",
    "girlfriendPortionFactor",
    "avoidRepeatDays",
  ];

  for (const field of numericFields) {
    if (typeof body[field] === "number" && Number.isFinite(body[field])) {
      (allowed[field] as number) = body[field] as number;
    }
  }

  const next = normalizeSettings({
    ...current,
    ...allowed,
    dailyMealCounts:
      body.dailyMealCounts === undefined
        ? current.dailyMealCounts
        : normalizeDailyMealCounts(
            body.dailyMealCounts,
            allowed.mealsPerDay ?? current.mealsPerDay,
          ),
  });
  await writeJson("settings.json", next);
  res.json(next);
});

app.get("/api/history", async (_req, res) => {
  res.json(await readJson<HistoryEntry[]>("history.json", []));
});

app.post("/api/history/:planId/activate", async (req, res) => {
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const entry = history.find((item) => item.id === req.params.planId);
  if (!entry?.plan) {
    return res.status(404).json({
      error: "Wochenplan im Verlauf nicht gefunden.",
    });
  }

  const now = new Date().toISOString();
  const nextId = nanoid(10);
  const activatedPlan: WeekPlan = {
    ...(JSON.parse(JSON.stringify(entry.plan)) as WeekPlan),
    id: nextId,
    createdAt: now,
  };
  const activatedEntry: HistoryEntry = {
    id: nextId,
    createdAt: now,
    recipeIds: activatedPlan.days.flatMap((day) =>
      day.meals.map((meal) => meal.recipe.id),
    ),
    plan: activatedPlan,
  };

  await writeJson("history.json", [activatedEntry, ...history].slice(0, 30));
  res.json(enrichPlan(activatedPlan));
});

app.post("/api/plans/generate", async (_req, res) => {
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettings();
  let plan: WeekPlan;
  try {
    plan = buildWeekPlan(recipes, history, settings);
  } catch (error) {
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Wochenplan konnte nicht erstellt werden.",
    });
  }
  const entry: HistoryEntry = {
    id: plan.id,
    createdAt: plan.createdAt,
    recipeIds: plan.days.flatMap((d) => d.meals.map((m) => m.recipe.id)),
    plan,
  };
  await writeJson("history.json", [entry, ...history].slice(0, 30));
  res.json(enrichPlan(plan));
});

app.get("/api/plans/latest", async (_req, res) => {
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const latest = history.find((h) => h.plan);
  if (!latest?.plan)
    return res.status(404).json({ error: "Noch kein Wochenplan vorhanden." });
  res.json(enrichPlan(latest.plan));
});

app.post("/api/plans/:planId/remix", async (req, res) => {
  const { day, mealIndex } = req.body as { day: string; mealIndex: 1 | 2 };
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettings();
  const idx = history.findIndex((h) => h.id === req.params.planId && h.plan);
  if (idx < 0 || !history[idx].plan)
    return res.status(404).json({ error: "Plan nicht gefunden." });
  const plan = history[idx].plan!;
  const dayPlanIndex = plan.days.findIndex((d) => d.day === day);
  if (dayPlanIndex < 0)
    return res.status(404).json({ error: "Tag nicht gefunden." });
  const slotIndex = plan.days[dayPlanIndex].meals.findIndex(
    (m) => m.mealIndex === mealIndex,
  );
  if (slotIndex < 0)
    return res.status(404).json({ error: "Mahlzeit nicht gefunden." });

  const oldRecipe = plan.days[dayPlanIndex].meals[slotIndex].recipe;
  const selected = plan.days
    .flatMap((d) => d.meals.map((m) => m.recipe))
    .filter((r) => r.id !== oldRecipe.id);
  const recentIds = getRecentIds(
    history.filter((_, i) => i !== idx),
    settings,
  );
  const currentDayMeals = plan.days[dayPlanIndex].meals
    .map((m) => m.recipe)
    .filter((r) => r.id !== oldRecipe.id);
  const avoidSameIds = new Set(selected.map((r) => r.id));
  avoidSameIds.add(oldRecipe.id);

  const slotKey = `${day}-${mealIndex}`;
  plan.remixMemory = plan.remixMemory || {};
  const alreadyTriedInSlot = new Set(plan.remixMemory[slotKey] || []);
  alreadyTriedInSlot.add(oldRecipe.id);

  function rankCandidates(extraAvoid: Set<string>) {
    const avoid = new Set(avoidSameIds);
    for (const id of extraAvoid) avoid.add(id);
    return [...recipes]
      .filter((recipe) => !avoid.has(recipe.id))
      .map((recipe) => ({
        recipe,
        score: scoreRecipeStable(recipe, {
          selected,
          recentIds,
          settings,
          currentDayMeals,
          targetMealKcal: oldRecipe.kcal,
          targetMealProtein: oldRecipe.protein,
          avoidSameIds: avoid,
          remixOldRecipe: oldRecipe,
        }),
      }))
      .sort((a, b) => b.score - a.score);
  }

  let ranked = rankCandidates(alreadyTriedInSlot);
  if (ranked.length < 1) {
    // Wenn der Slot schon sehr oft remixt wurde, nur aktuelle Wochen-Duplikate und das direkte alte Gericht vermeiden.
    ranked = rankCandidates(new Set([oldRecipe.id]));
  }
  if (ranked.length < 1) {
    return res.status(400).json({ error: "Kein Ersatzgericht gefunden." });
  }

  const top = ranked.slice(0, Math.min(10, ranked.length));
  const picked = weightedPick(top, (_item, index) => Math.max(1, top.length - index));
  const replacement = picked?.recipe || top[0].recipe;

  plan.remixMemory[slotKey] = [
    ...(plan.remixMemory[slotKey] || []),
    replacement.id,
  ].slice(-20);
  saveReplacementToPlan(
    plan,
    history,
    idx,
    dayPlanIndex,
    slotIndex,
    replacement,
    settings,
  );
  await writeJson("history.json", history);
  res.json(enrichPlan(plan));
});


app.post("/api/plans/:planId/replace", async (req, res) => {
  const { day, mealIndex, recipeId } = req.body as {
    day: string;
    mealIndex: 1 | 2;
    recipeId: string;
  };
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettings();

  const idx = history.findIndex((h) => h.id === req.params.planId && h.plan);
  if (idx < 0 || !history[idx].plan)
    return res.status(404).json({ error: "Plan nicht gefunden." });

  const replacement = recipes.find((r) => r.id === recipeId);
  if (!replacement)
    return res.status(404).json({ error: "Ersatzgericht nicht gefunden." });

  const plan = history[idx].plan!;
  const slot = findPlanSlot(plan, day, mealIndex);
  if (!slot)
    return res.status(404).json({ error: "Mahlzeit nicht gefunden." });

  const usedElsewhere = plan.days
    .flatMap((d) => d.meals)
    .some(
      (meal) =>
        meal.recipe.id === recipeId &&
        !(meal.day === day && meal.mealIndex === mealIndex),
    );
  if (usedElsewhere) {
    return res.status(400).json({
      error:
        "Dieses Gericht ist in der aktuellen Woche schon eingeplant. Wähle ein anderes Gericht oder remixe zuerst den anderen Slot.",
    });
  }

  const slotKey = `${day}-${mealIndex}`;
  plan.remixMemory = plan.remixMemory || {};
  plan.remixMemory[slotKey] = [
    ...(plan.remixMemory[slotKey] || []),
    replacement.id,
  ].slice(-20);

  saveReplacementToPlan(
    plan,
    history,
    idx,
    slot.dayPlanIndex,
    slot.slotIndex,
    replacement,
    settings,
  );
  await writeJson("history.json", history);
  res.json(enrichPlan(plan));
});


app.post("/api/plans/:planId/move-meal", async (req, res) => {
  const { fromDay, fromMealIndex, toDay, toMealIndex } = req.body as {
    fromDay: string;
    fromMealIndex: 1 | 2;
    toDay: string;
    toMealIndex: 1 | 2;
  };

  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettings();

  const idx = history.findIndex((h) => h.id === req.params.planId && h.plan);
  if (idx < 0 || !history[idx].plan)
    return res.status(404).json({ error: "Plan nicht gefunden." });

  const plan = history[idx].plan!;
  const fromSlot = findPlanSlot(plan, fromDay, fromMealIndex);
  const toSlot = findPlanSlot(plan, toDay, toMealIndex);

  if (!fromSlot || !toSlot)
    return res.status(404).json({ error: "Start- oder Zielslot nicht gefunden." });

  if (fromDay === toDay && fromMealIndex === toMealIndex) {
    return res.json(enrichPlan(plan));
  }

  const fromMeal = plan.days[fromSlot.dayPlanIndex].meals[fromSlot.slotIndex];
  const toMeal = plan.days[toSlot.dayPlanIndex].meals[toSlot.slotIndex];

  plan.days[fromSlot.dayPlanIndex].meals[fromSlot.slotIndex] = {
    ...fromMeal,
    recipe: toMeal.recipe,
  };
  plan.days[toSlot.dayPlanIndex].meals[toSlot.slotIndex] = {
    ...toMeal,
    recipe: fromMeal.recipe,
  };

  plan.days[fromSlot.dayPlanIndex] = updateDayTotals(
    plan.days[fromSlot.dayPlanIndex],
    settings,
  );
  if (toSlot.dayPlanIndex !== fromSlot.dayPlanIndex) {
    plan.days[toSlot.dayPlanIndex] = updateDayTotals(
      plan.days[toSlot.dayPlanIndex],
      settings,
    );
  }

  history[idx].plan = plan;
  history[idx].recipeIds = plan.days.flatMap((day) =>
    day.meals.map((meal) => meal.recipe.id),
  );

  await writeJson("history.json", history);
  res.json(enrichPlan(plan));
});

app.get("/api/plans/:planId/shopping-list", async (req, res) => {
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettings();
  const pantry = await readPantryState();
  const shoppingState = await readShoppingState();
  const entry = history.find((h) => h.id === req.params.planId && h.plan);
  if (!entry?.plan)
    return res.status(404).json({ error: "Plan nicht gefunden." });
  const requested = String(req.query.range || "all");
  const range: ShoppingRange =
    requested === "mon-thu" || requested === "fri-sun" ? requested : "all";
  const items = buildShoppingList(entry.plan, settings, range, pantry, shoppingState);
  res.json({
    factor: 1 + settings.girlfriendPortionFactor,
    range,
    rangeLabel: rangeLabel(range),
    totalEstimatedCost: totalEstimatedCost(items),
    pantryItems: pantry.items,
    pantryCatalog: pantryCatalogFromState(pantry),
    items,
  });
});

app.post("/api/plans/:planId/shopping-check", async (req, res) => {
  const { range, itemKey, checked } = req.body as {
    range: ShoppingRange;
    itemKey: string;
    checked: boolean;
  };
  if (!itemKey) return res.status(400).json({ error: "itemKey fehlt." });
  const normalizedRange: ShoppingRange =
    range === "mon-thu" || range === "fri-sun" ? range : "all";
  const state = await readShoppingState();
  state.checked[shoppingStateKey(req.params.planId, normalizedRange, itemKey)] =
    Boolean(checked);
  await writeShoppingState(state);
  res.json({ ok: true });
});

app.get("/api/pantry", async (_req, res) => {
  res.json(await readPantryState());
});

app.post("/api/pantry", async (req, res) => {
  const { itemKey, inPantry, name, category } = req.body as {
    itemKey: string;
    inPantry: boolean;
    name?: string;
    category?: string;
  };
  if (!itemKey) return res.status(400).json({ error: "itemKey fehlt." });
  const pantry = await readPantryState();
  pantry.items[itemKey] = Boolean(inPantry);
  pantry.names = pantry.names || {};
  pantry.categories = pantry.categories || {};
  if (name) pantry.names[itemKey] = name;
  if (category) pantry.categories[itemKey] = category;
  await writePantryState(pantry);
  res.json(pantry);
});

app.get("/api/plans/archive", async (_req, res) => {
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const archive = history
    .filter((h) => h.plan)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      hasPlan: Boolean(entry.plan),
      days: entry.plan!.days.map((day) => ({
        day: day.day,
        meals: day.meals.map((meal) => ({
          mealIndex: meal.mealIndex,
          recipeId: meal.recipe.id,
          name: meal.recipe.name,
          kcal: meal.recipe.kcal,
          protein: meal.recipe.protein,
        })),
      })),
      recipeCount: entry.recipeIds.length,
    }));
  res.json(archive);
});

if (isProduction) {
  app.use(express.static(frontendDistDir));

  app.get("*", async (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    try {
      await fs.access(frontendIndexPath);
      return res.sendFile(frontendIndexPath);
    } catch {
      return next();
    }
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MealPilot Backend läuft auf http://localhost:${PORT}`);
});
