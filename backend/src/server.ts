import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { readStore, writeStore } from "./store.js";
import {
  findIngredientPrice,
  resolveIngredientPrice,
  type ResolvedPrice,
} from "./ingredientPrices.js";
import {
  applyRecipeClassification,
  type DietaryType,
} from "./recipeClassification.js";
import { enrichRecipeFromSourceUrl } from "./hellofreshImporter.js";
import { defaultCategoryThresholds } from "./categoryThresholds.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const frontendPublicDir = path.resolve(projectRoot, "frontend", "public");
const frontendDistDir = path.resolve(projectRoot, "frontend", "dist");
const frontendIndexPath = path.join(frontendDistDir, "index.html");
const hfImageDir = path.resolve(frontendPublicDir, "images", "hellofresh");
const freshSpaetzleBaconId = "frische-eierspaetzle-mit-bacon";
const freshSpaetzleBaconSourceUrl =
  "https://www.hellofresh.de/recipes/one-pan-frische-eierspatzle-mit-bacon-and-doppelt-bacon-69e8809b4af8f3547a659dd8";

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
  servings?: number;
  nutritionPerServing?: {
    kcal: number;
    protein: number;
  };
  nutritionSource?: "per-serving" | "recipe-total" | "estimated" | "unknown";
  nutritionNeedsReview?: boolean;
  durationMinutes: number;
  imageUrl: string;
  sourceUrl?: string;
  tags: string[];
  categories?: string[];
  dietaryType?: DietaryType;
  classificationReasons?: string[];
  classificationNeedsReview?: boolean;
  ingredients: string[];
  instructions?: RecipeStep[];
  estimatedCost?: number;
  priceNote?: string;
  importedAt?: string | null;
  lastUsed?: string | null;
};

const freshSpaetzleBaconIngredients = [
  "200 g Bacon (Scheiben)",
  "400 g frische Eierspätzle",
  "1 Stück Porree",
  "1 Stück Knoblauchzehe",
  "25 g Tomatenpesto",
  "40 g Hartkäse ital. Art, gerieben",
  "100 g Crème fraîche, Bio",
  "4 g Hühnerbrühe",
  "1 Stück Karotte",
  "1 Stück Zwiebel",
  "nach Geschmack Salz",
  "1 Esslöffel Olivenöl",
  "nach Geschmack Pfeffer",
  "3 Esslöffel Wasser",
];

const freshSpaetzleBaconInstructions: RecipeStep[] = [
  {
    title: "Schritt 1",
    text: "Zwiebel fein würfeln. Knoblauch fein hacken. Porree längs halbieren, gründlich auswaschen und in 0,5 cm Halbmonde schneiden. Karotte nach Belieben schälen, längs halbieren und in dünne Halbmonde schneiden. Bacon in ca. 1 cm Streifen schneiden.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-1.jpg",
  },
  {
    title: "Schritt 2",
    text: "In einer großen Pfanne 1 EL [1,5 EL | 2 EL] Olivenöl* bei mittlerer Hitze erwärmen. Spätzle darin 4 – 6 Min. anbraten und gelegentlich umrühren, bis sie knusprig und leicht gebräunt sind. Spätzle anschließend aus der Pfanne nehmen, in eine große Schüssel umfüllen und beiseitestellen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-2.jpg",
  },
  {
    title: "Schritt 3",
    text: "Dieselbe große Pfanne ohne weitere Fettzugabe erneut bei mittlerer Hitze erwärmen. Baconstreifen darin 4 – 5 Min. anbraten, bis sie schön knusprig sind. Karotten, Porree und Zwiebelwürfel hinzugeben und weitere 5 – 6 Min. braten.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-3.jpg",
  },
  {
    title: "Schritt 4",
    text: "Hitze reduzieren, Knoblauch zum Bacon geben, leicht pfeffern* und ca. 1 Min. weiterköcheln lassen. Crème fraîche, Brühepulver, Tomatenpesto und 3 EL [4,5 EL | 6 EL] Wasser* zugeben und alles gut vermengen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-4.jpg",
  },
  {
    title: "Schritt 5",
    text: "Gebratene Spätzle in die Soße geben und vorsichtig unterheben. Soße 1 Min. weiterköcheln lassen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-5.jpg",
  },
  {
    title: "Schritt 6",
    text: "Spätzle auf Teller verteilen, Hartkäse darüberstreuen und genießen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-6.jpg",
  },
];

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
  fastMaxMinutes: number;
  highProteinMinProteinPerServing: number;
  lowCalMaxKcal: number;
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
  userId?: string;
  recipeIds: string[];
  plan?: WeekPlan;
};

type MealPilotUser = {
  id: string;
  name: string;
  createdAt: string;
  settings: Settings;
};

type AccountConfig = {
  id: string;
  name: string;
  pin: string;
};

type PublicUser = Pick<MealPilotUser, "id" | "name"> & {
  isDemo?: boolean;
};

type AuthRole = "account" | "demo";

type AuthSession = {
  userId: string;
  role: AuthRole;
  expiresAt: number;
};

type SingleRecipeHistoryEntry = {
  id: string;
  userId?: string;
  recipeId: string;
  recipeName: string;
  imageUrl?: string;
  viewedAt: string;
  action: "viewed" | "shopping-list";
};

type ShoppingState = {
  checked: Record<string, boolean>;
};

type PantryState = {
  items: Record<string, boolean>;
  names?: Record<string, string>;
  categories?: Record<string, string>;
};

type PantryStore = PantryState & {
  users?: Record<string, PantryState>;
};

const days: DayKey[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const defaultUserId = "johannes-sophie";
const accountConfigPath = path.resolve(projectRoot, "backend", "data", "users.local.json");
const requestSessions = new WeakMap<express.Request, AuthSession>();
const runtimeSessionSecret = crypto.randomBytes(32).toString("hex");
const defaultDailyMealCounts = Object.fromEntries(
  days.map((day) => [day, 2]),
) as Settings["dailyMealCounts"];

async function readJson<T>(file: string, fallback: T): Promise<T> {
  const value = await readStore<T>(file, fallback);
  if (file === "recipes.json" && Array.isArray(value)) {
    return value.map(normalizeRecipeOverrides) as T;
  }
  return value;
}

async function writeJson(file: string, data: unknown) {
  if (file === "recipes.json" && Array.isArray(data)) {
    await writeStore(
      file,
      data.map((recipe) => applyRecipeClassification(recipe as Recipe)),
    );
    return;
  }
  await writeStore(file, data);
}

function isFreshSpaetzleBaconRecipe(recipe: Recipe) {
  return recipe.id === freshSpaetzleBaconId;
}

function normalizeRecipeOverrides(recipe: Recipe): Recipe {
  if (!isFreshSpaetzleBaconRecipe(recipe)) return recipe;

  const ingredientText = (recipe.ingredients || []).join(" ").toLowerCase();
  const instructionText = (recipe.instructions || [])
    .map((step) => step.text)
    .join(" ")
    .toLowerCase();
  const needsCanonicalData =
    recipe.sourceUrl !== freshSpaetzleBaconSourceUrl ||
    ingredientText.includes("100 g bacon") ||
    ingredientText.includes("tomate") ||
    ingredientText.includes("schalotte") ||
    instructionText.includes("schalotten") ||
    !ingredientText.includes("tomatenpesto") ||
    !ingredientText.includes("karotte") ||
    !ingredientText.includes("200 g bacon");

  return {
    ...recipe,
    sourceUrl: freshSpaetzleBaconSourceUrl,
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-hero.jpg",
    ingredients: needsCanonicalData
      ? [...freshSpaetzleBaconIngredients]
      : recipe.ingredients,
    instructions: needsCanonicalData
      ? freshSpaetzleBaconInstructions.map((step) => ({ ...step }))
      : recipe.instructions,
  };
}

function shoppingKeyForName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function userScopedKey(userId: string, key: string) {
  return userId === defaultUserId ? key : `${userId}:${key}`;
}

function shoppingStateKey(
  userId: string,
  planId: string,
  range: ShoppingRange,
  itemKey: string,
) {
  return userScopedKey(userId, `${planId}:${range}:${itemKey}`);
}

function singleShoppingStateKey(userId: string, recipeId: string, itemKey: string) {
  return userScopedKey(userId, `single:${recipeId}:${itemKey}`);
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

function normalizePantryState(value: Partial<PantryState> | null | undefined): PantryState {
  return {
    items: value?.items || {},
    names: value?.names || {},
    categories: value?.categories || {},
  };
}

async function readPantryStore(): Promise<PantryStore> {
  const store = await readJson<PantryStore>("pantry.json", {
    items: {},
    names: {},
    categories: {},
    users: {},
  });
  return {
    ...normalizePantryState(store),
    users: store.users || {},
  };
}

async function readPantryStateForUser(userId: string) {
  const normalizedId = normalizeUserId(userId);
  if (normalizedId === defaultUserId) return readPantryState();
  const store = await readPantryStore();
  return normalizePantryState(store.users?.[normalizedId]);
}

async function writePantryStateForUser(userId: string, data: PantryState) {
  const normalizedId = normalizeUserId(userId);
  if (normalizedId === defaultUserId) {
    const store = await readPantryStore();
    await writeJson("pantry.json", {
      ...store,
      ...normalizePantryState(data),
    });
    return;
  }
  const store = await readPantryStore();
  await writeJson("pantry.json", {
    ...store,
    users: {
      ...(store.users || {}),
      [normalizedId]: normalizePantryState(data),
    },
  });
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
    fastMaxMinutes: defaultCategoryThresholds.fastMaxMinutes,
    highProteinMinProteinPerServing:
      defaultCategoryThresholds.highProteinMinProteinPerServing,
    lowCalMaxKcal: defaultCategoryThresholds.lowCalMaxKcal,
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

function normalizeUserId(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return defaultUserId;
  if (raw === "default") return defaultUserId;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return normalized || defaultUserId;
}

function currentUserId(req: express.Request) {
  return requestSessions.get(req)?.userId || defaultUserId;
}

function publicUser(user: MealPilotUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    ...(user.id.startsWith("demo-") ? { isDemo: true } : {}),
  };
}

function demoEnabled() {
  return process.env.MEALPILOT_DEMO_ENABLED?.trim().toLowerCase() === "true";
}

function sessionSecret() {
  return process.env.MEALPILOT_SESSION_SECRET?.trim() || runtimeSessionSecret;
}

function encodeSession(session: AuthSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(token: string): AuthSession | null {
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature, "base64url");
  } catch {
    return null;
  }
  if (
    provided.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(provided, expectedSignature)
  ) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    ) as Partial<AuthSession>;
    if (
      typeof value.userId !== "string" ||
      (value.role !== "account" && value.role !== "demo") ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      userId: normalizeUserId(value.userId),
      role: value.role,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}

function requestSession(req: express.Request) {
  const authorization = req.header("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  return decodeSession(authorization.slice("Bearer ".length).trim());
}

function issueSession(userId: string, role: AuthRole) {
  const lifetime =
    role === "demo"
      ? 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return encodeSession({
    userId: normalizeUserId(userId),
    role,
    expiresAt: Date.now() + lifetime,
  });
}

function isDemoRequest(req: express.Request) {
  return requestSessions.get(req)?.role === "demo";
}

function parseAccountConfig(value: unknown): AccountConfig[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((account): account is Record<keyof AccountConfig, string> => {
      if (!account || typeof account !== "object") return false;
      const candidate = account as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.pin === "string" &&
        Boolean(candidate.id.trim()) &&
        Boolean(candidate.name.trim()) &&
        Boolean(candidate.pin.trim())
      );
    })
    .map((account) => ({
      id: normalizeUserId(account.id),
      name: account.name.trim(),
      pin: account.pin.trim(),
    }));
}

async function readAccountConfig(): Promise<AccountConfig[]> {
  const envUsersJson = process.env.MEALPILOT_USERS_JSON?.trim();

  if (envUsersJson) {
    try {
      return parseAccountConfig(JSON.parse(envUsersJson));
    } catch {
      console.warn("MEALPILOT_USERS_JSON konnte nicht gelesen werden.");
      return [];
    }
  }

  try {
    const raw = await fs.readFile(accountConfigPath, "utf-8");
    return parseAccountConfig(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function accountForPin(pin: string): Promise<AccountConfig | null> {
  const accounts = await readAccountConfig();
  return accounts.find((account) => account.pin === pin) || null;
}

async function readUsers(): Promise<MealPilotUser[]> {
  const globalSettings = await readSettings();
  const rawUsers = await readJson<Partial<MealPilotUser>[]>("users.json", []);
  return rawUsers
    .filter((user) => user && typeof user === "object")
    .map((user) => ({
      id: normalizeUserId(user.id),
      name:
        typeof user.name === "string" && user.name.trim()
          ? user.name.trim()
          : "Dein MealPilot Konto",
      createdAt:
        typeof user.createdAt === "string" && user.createdAt
          ? user.createdAt
          : new Date().toISOString(),
      settings: normalizeSettings(user.settings || globalSettings),
    }));
}

async function writeUsers(users: MealPilotUser[]) {
  await writeJson("users.json", users);
}

async function cleanupExpiredDemoData() {
  const users = await readUsers();
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const expiredIds = new Set(
    users
      .filter(
        (user) =>
          user.id.startsWith("demo-") &&
          new Date(user.createdAt).getTime() < cutoff,
      )
      .map((user) => user.id),
  );
  if (expiredIds.size === 0) return;

  await writeUsers(users.filter((user) => !expiredIds.has(user.id)));

  const history = await readJson<HistoryEntry[]>("history.json", []);
  await writeJson(
    "history.json",
    history.filter((entry) => !expiredIds.has(normalizeUserId(entry.userId))),
  );

  const recipeHistory = await readJson<SingleRecipeHistoryEntry[]>(
    "recipeHistory.json",
    [],
  );
  await writeJson(
    "recipeHistory.json",
    recipeHistory.filter(
      (entry) => !expiredIds.has(normalizeUserId(entry.userId)),
    ),
  );

  const pantry = await readPantryStore();
  await writeJson("pantry.json", {
    ...pantry,
    users: Object.fromEntries(
      Object.entries(pantry.users || {}).filter(
        ([userId]) => !expiredIds.has(userId),
      ),
    ),
  });

  const shoppingState = await readShoppingState();
  await writeShoppingState({
    checked: Object.fromEntries(
      Object.entries(shoppingState.checked).filter(
        ([key]) =>
          ![...expiredIds].some((userId) => key.startsWith(`${userId}:`)),
      ),
    ),
  });
}

async function ensureUser(
  userId: string,
  preferredName?: string,
): Promise<MealPilotUser> {
  const normalizedId = normalizeUserId(userId);
  const users = await readUsers();
  const account = (await readAccountConfig()).find(
    (candidate) => candidate.id === normalizedId,
  );
  const existing = users.find((user) => user.id === normalizedId);
  if (existing) {
    const configuredName = preferredName?.trim() || account?.name;
    if (configuredName && existing.name !== configuredName) {
      const updated = { ...existing, name: configuredName };
      await writeUsers(
        users.map((user) => (user.id === normalizedId ? updated : user)),
      );
      return updated;
    }
    return existing;
  }

  const defaultSettings =
    normalizedId === defaultUserId
      ? await readSettings()
      : users.find((user) => user.id === defaultUserId)?.settings || settingsFallback();
  const user: MealPilotUser = {
    id: normalizedId,
    name:
      preferredName?.trim() ||
      account?.name ||
      (normalizedId === defaultUserId ? "Johannes & Sophie" : "MealPilot Profil"),
    createdAt: new Date().toISOString(),
    settings: normalizeSettings(defaultSettings),
  };
  await writeUsers([...users, user]);
  return user;
}

async function readSettingsForUser(userId: string) {
  return (await ensureUser(userId)).settings;
}

async function writeSettingsForUser(userId: string, settings: Settings) {
  const normalizedId = normalizeUserId(userId);
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === normalizedId);
  const nextUser: MealPilotUser =
    index >= 0
      ? { ...users[index], settings: normalizeSettings(settings) }
      : {
          id: normalizedId,
          name: normalizedId === defaultUserId ? "Dein MealPilot Konto" : "MealPilot Profil",
          createdAt: new Date().toISOString(),
          settings: normalizeSettings(settings),
        };
  const nextUsers =
    index >= 0
      ? users.map((user, userIndex) => (userIndex === index ? nextUser : user))
      : [...users, nextUser];
  await writeUsers(nextUsers);
  if (normalizedId === defaultUserId) {
    await writeJson("settings.json", nextUser.settings);
  }
  return nextUser.settings;
}

function historyEntryBelongsToUser(entry: HistoryEntry, userId: string) {
  return normalizeUserId(entry.userId) === normalizeUserId(userId);
}

function historyForUser(history: HistoryEntry[], userId: string) {
  return history.filter((entry) => historyEntryBelongsToUser(entry, userId));
}

function prependHistoryForUser(
  history: HistoryEntry[],
  entry: HistoryEntry,
  userId: string,
) {
  const userEntries = historyForUser(history, userId);
  const otherEntries = history.filter(
    (item) => !historyEntryBelongsToUser(item, userId),
  );
  return [entry, ...userEntries].slice(0, 30).concat(otherEntries);
}

function recipeHistoryEntryBelongsToUser(
  entry: SingleRecipeHistoryEntry,
  userId: string,
) {
  return normalizeUserId(entry.userId) === normalizeUserId(userId);
}

async function recordRecipeHistory(
  userId: string,
  recipe: Recipe,
  action: SingleRecipeHistoryEntry["action"],
  viewedAt = new Date().toISOString(),
) {
  const history = await readJson<SingleRecipeHistoryEntry[]>(
    "recipeHistory.json",
    [],
  );
  const entry: SingleRecipeHistoryEntry = {
    id: nanoid(10),
    userId: normalizeUserId(userId),
    recipeId: recipe.id,
    recipeName: recipe.name,
    imageUrl: recipe.imageUrl,
    viewedAt,
    action,
  };
  const userEntries = history.filter((item) =>
    recipeHistoryEntryBelongsToUser(item, userId),
  );
  const otherEntries = history.filter(
    (item) => !recipeHistoryEntryBelongsToUser(item, userId),
  );
  await writeJson(
    "recipeHistory.json",
    [entry, ...userEntries].slice(0, 100).concat(otherEntries),
  );
  return entry;
}

function estimateRecipeCost(recipe: Recipe): {
  estimatedCost: number;
  priceNote: string;
} {
  const items = hasDetailedIngredients(recipe)
    ? (recipe.ingredients || [])
        .map(parseIngredientAmount)
        .filter((item): item is NonNullable<ReturnType<typeof parseIngredientAmount>> =>
          Boolean(item),
        )
    : fallbackItemsForRecipe(recipe);
  const total = items.reduce((sum, item) => {
    const price = resolveIngredientPrice({
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      category: categoryForItem(item.name),
    });
    return sum + price.estimatedCost;
  }, 0);
  const divisor = hasDetailedIngredients(recipe) ? 2 : 1;
  const rounded = Math.max(0.5, Math.round((total / divisor) * 10) / 10);
  return {
    estimatedCost: rounded,
    priceNote:
      "Schätzung pro Portion nach Zutatenpreisen; Vorrat prüfen zählt nicht in die Summe.",
  };
}

function getRecipeNutritionPerServing(recipe: Recipe) {
  return {
    kcal: recipe.nutritionPerServing?.kcal ?? recipe.kcal,
    protein: recipe.nutritionPerServing?.protein ?? recipe.protein,
  };
}

function enrichRecipe(recipe: Recipe): Recipe {
  const price = estimateRecipeCost(recipe);
  const nutritionPerServing = getRecipeNutritionPerServing(recipe);
  return {
    ...applyRecipeClassification({ ...recipe, nutritionPerServing }),
    nutritionPerServing,
    ...price,
  };
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
  const nutrition = getRecipeNutritionPerServing(recipe);
  const kcalDiff = Math.abs(nutrition.kcal - context.targetMealKcal);
  const proteinDiff = Math.abs(nutrition.protein - context.targetMealProtein);
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
    const remixOldNutrition = getRecipeNutritionPerServing(context.remixOldRecipe);
    score +=
      commonCount(recipe.tags || [], context.remixOldRecipe.tags || []) * 16;
    score +=
      commonCount(
        recipe.ingredients || [],
        context.remixOldRecipe.ingredients || [],
      ) * 8;
    score -= Math.abs(nutrition.kcal - remixOldNutrition.kcal) * 0.04;
    score -= Math.abs(nutrition.protein - remixOldNutrition.protein) * 0.5;
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
    const mealKcal = currentDayMeals.reduce(
      (sum, r) => sum + getRecipeNutritionPerServing(r).kcal,
      0,
    );
    const mealProtein = currentDayMeals.reduce(
      (sum, r) => sum + getRecipeNutritionPerServing(r).protein,
      0,
    );
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
  const mealKcal = day.meals.reduce(
    (sum, m) => sum + getRecipeNutritionPerServing(m.recipe).kcal,
    0,
  );
  const mealProtein = day.meals.reduce(
    (sum, m) => sum + getRecipeNutritionPerServing(m.recipe).protein,
    0,
  );
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
  if (FLEISCH_REGEX.test(n) || /(garnelen|fisch|seelachs|lachs|ribs|spareribs|\bei\b|eier)/.test(n))
    return "Protein";
  if (/(reis|kartoffel|brötchen|broetchen|brot|spätzle|spaetzle|gnocchi|pasta|nudel|rigatoni|conchiglie|tortellini|wrap|tortilla|bulgur|couscous|pommes|fettuccine)/.test(n))
    return "Kohlenhydrate";
  if (/(gewürz|gewuerz|hello |brühe|bruehe|sauce|soße|sosse|saucen|pesto|curry|senf|soja|hoisin|gochujang|teriyaki|sesam|honig|öl|oel|essig|\bsalz\b|pfeffer|tomatenmark|miso|ketchup|mayonnaise|aioli|dressing)/.test(n))
    return "Saucen, Gewürze & Vorrat";
  if (/(salat|gurke|tomate|avocado|kohlrabi|paprika|brokkoli|pak choi|gemüse|mais|kidneybohnen|bohnen|linsen|karotte|porree|zwiebel|frühlingszwiebel|knoblauch|birne|zitrone|limette|blumenkohl|wirsing|kraut|sultaninen|aprikose|erdnuss|sonnenblumenkerne|spinat|rucola|champignon|kräuter|petersilie|schnittlauch|basilikum|dill|minze|thymian|salbei)/.test(n))
    return "Gemüse & Obst";
  if (/(milch|käse|mozzarella|parmesan|joghurt|sahne|crème fraîche|creme fraiche|ricotta|hirtenkäse|grillkäse|butter)/.test(n))
    return "Milchprodukte";
  if (/(paniermehl|semmelbrösel|ingwerpaste|mehl|zucker)/.test(n))
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
    .replace(/\bPetersilie\s+glatt\/Schnittlauch\b/gi, "Petersilie/Schnittlauch")
    .replace(/\bglatt\/Schnittlauch\b/gi, "Schnittlauch")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*$/g, "")
    .trim();
}

function parseIngredientAmount(line: string):
  | { amount: number; unit: string; name: string; source: ShoppingSource }
  | null {
  const original = stripTags(String(line || "")).replace(/\s+/g, " ").trim();
  if (!original) return null;
  if (/kann spuren|allergene|nicht in deiner lieferung|utensilien/i.test(original))
    return null;
  if (/^(?:\d+(?:[,.]\d+)?|½|¼|¾|⅓|⅔)?\s*(?:ml|l|el|esslöffel|tl|teelöffel)?\s*wass?er$/i.test(original))
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

  const possibleName = cleanIngredientName(match[3] || "");
  if (/wasser/i.test(possibleName)) return null;

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
    [/tomatenpesto|pesto/i, "Tomatenpesto"],
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
  if (/pesto/i.test(item.name) && unit === "g") {
    return withPackage(190, "g", "Glas", "Pesto wird als kleines Glas gerechnet.");
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

  const priceEntry = findIngredientPrice(item.name);
  if (
    priceEntry &&
    !priceEntry.pantryDefault &&
    (unit === priceEntry.baseUnit ||
      (priceEntry.baseUnit === "g" && unit.includes("trocken")) ||
      (priceEntry.baseUnit === "Stück" && /(stück|stk|zehe|scheibe|kugel)/i.test(unit)))
  ) {
    return withPackage(
      priceEntry.packageSize,
      priceEntry.baseUnit,
      priceEntry.baseUnit === "Stück" && priceEntry.packageSize > 1
        ? "Packung"
        : undefined,
      "Kaufmenge nach zentraler Zutatenpreis-Datenbank gerundet.",
    );
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
      const inPantry = Boolean(pantry.items[itemKey]);
      const price = resolveIngredientPrice({
        name: v.name,
        amount:
          purchase.purchaseUnit === "prüfen"
            ? 1
            : purchase.purchaseQuantity,
        unit: purchase.purchaseUnit,
        category: v.category,
        inPantry,
      });
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
        inPantry,
        estimatedCost: price.estimatedCost,
        priceNote: priceNoteForShoppingItem(v.name, price),
        priceType: price.priceType,
        priceEstimatedFallback: price.fallback,
        priceEntryKey: price.entryKey,
        pantryDefault: price.pantryDefault,
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
  userId: string,
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
    (itemKey) => shoppingStateKey(userId, plan.id, range, itemKey),
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

function priceNoteForShoppingItem(name: string, price: ResolvedPrice) {
  if (price.note) return price.note;
  if (price.fallback) return "Geschätzt über Kategorie-Fallback.";
  if (price.pantryDefault) return "Vorratszutat mit realistischem Verbrauchspreis.";
  return `Preis über Zutatenpreis-Datenbank${price.entryKey ? ` (${price.entryKey})` : ""}.`;
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
  const baseRecipe = normalizeRecipeOverrides(recipe);
  if (!baseRecipe.sourceUrl) throw new Error("Dieses Rezept hat keine sourceUrl.");
  const response = await fetch(baseRecipe.sourceUrl, {
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

  const next: Recipe = { ...baseRecipe };
  const heroImage = heroCandidates[0];

  if (heroImage) {
    try {
      next.imageUrl = await downloadImage(heroImage, `${baseRecipe.id}-hero`);
    } catch (err) {
      console.warn(`Hero-Bild für ${baseRecipe.name} konnte nicht lokal gespeichert werden:`, err);
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
          `${baseRecipe.id}-step-${i + 1}`,
        );
      } catch (err) {
        console.warn(`Schrittbild ${i + 1} für ${baseRecipe.name} konnte nicht gespeichert werden:`, err);
        if (isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url)) {
          next.instructions[i].imageUrl = url;
        } else {
          delete next.instructions[i].imageUrl;
        }
      }
    }
  }

  next.importedAt = new Date().toISOString();
  return applyRecipeClassification(normalizeRecipeOverrides(next));
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/check-pin", async (req, res) => {
  const existingSession = requestSession(req);
  if (existingSession) {
    const user = await ensureUser(
      existingSession.userId,
      existingSession.role === "demo" ? "Demo Account" : undefined,
    );
    return res.json({
      enabled: true,
      demoEnabled: demoEnabled(),
      ok: true,
      user: publicUser(user),
      token: issueSession(user.id, existingSession.role),
    });
  }

  const pin = String((req.body as { pin?: unknown })?.pin || "").trim();
  const account = pin ? await accountForPin(pin) : null;
  if (account) {
    const user = await ensureUser(account.id);
    return res.json({
      enabled: true,
      demoEnabled: demoEnabled(),
      ok: true,
      user: publicUser(user),
      token: issueSession(user.id, "account"),
    });
  }

  const accounts = await readAccountConfig();
  if (accounts.length > 0) {
    return res.status(401).json({
      enabled: true,
      demoEnabled: demoEnabled(),
      ok: false,
    });
  }

  const expectedPin = process.env.MEALPILOT_ADMIN_PIN?.trim();
  if (!expectedPin && !demoEnabled()) {
    const user = await ensureUser(defaultUserId);
    return res.json({
      enabled: false,
      demoEnabled: false,
      ok: true,
      user: publicUser(user),
    });
  }

  if (pin === expectedPin) {
    const user = await ensureUser(defaultUserId);
    return res.json({
      enabled: true,
      demoEnabled: demoEnabled(),
      ok: true,
      user: publicUser(user),
      token: issueSession(user.id, "account"),
    });
  }

  return res.status(401).json({
    enabled: true,
    demoEnabled: demoEnabled(),
    ok: false,
  });
});

app.post("/api/auth/demo", async (_req, res) => {
  if (!demoEnabled()) {
    return res.status(404).json({ error: "Demo-Zugang ist nicht aktiviert." });
  }
  await cleanupExpiredDemoData();
  const user = await ensureUser(`demo-${nanoid(12)}`, "Demo Account");
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const plan = buildWeekPlan(recipes, [], user.settings);
  const entry: HistoryEntry = {
    id: plan.id,
    userId: user.id,
    createdAt: plan.createdAt,
    recipeIds: plan.days.flatMap((day) =>
      day.meals.map((meal) => meal.recipe.id),
    ),
    plan,
  };
  await writeJson("history.json", prependHistoryForUser(history, entry, user.id));
  res.json({
    ok: true,
    user: publicUser(user),
    token: issueSession(user.id, "demo"),
  });
});

app.use("/api", async (req, res, next) => {
  const accounts = await readAccountConfig();
  const authRequired =
    accounts.length > 0 ||
    Boolean(process.env.MEALPILOT_ADMIN_PIN?.trim()) ||
    demoEnabled();
  if (!authRequired) return next();

  const session = requestSession(req);
  if (!session) {
    return res.status(401).json({ error: "Sitzung fehlt oder ist abgelaufen." });
  }
  requestSessions.set(req, session);
  next();
});

app.get("/api/users/current", async (req, res) => {
  const user = await ensureUser(currentUserId(req));
  res.json(publicUser(user));
});

app.get("/api/recipes", async (req, res) => {
  const all = (await readJson<Recipe[]>("recipes.json", [])).map(enrichRecipe);

  // Abwärtskompatibel: ohne limit/offset weiterhin das volle Array zurückgeben.
  const hasPagination =
    req.query.limit !== undefined || req.query.offset !== undefined;
  if (!hasPagination) {
    res.json(all);
    return;
  }

  const query = String(req.query.query ?? "").trim().toLowerCase();
  const tier = String(req.query.tier ?? "alle");
  const sort = String(req.query.sort ?? "name-asc");
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 5));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const filtered = all
    .filter((recipe) => tier === "alle" || recipe.tier === tier)
    .filter((recipe) => {
      if (!query) return true;
      const haystack = [
        recipe.name,
        recipe.tier,
        ...(recipe.tags || []),
        ...(recipe.ingredients || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (sort === "rating")
        return tierScore(b.tier) - tierScore(a.tier) || a.name.localeCompare(b.name, "de");
      if (sort === "protein-desc")
        return (
          getRecipeNutritionPerServing(b).protein -
            getRecipeNutritionPerServing(a).protein ||
          a.name.localeCompare(b.name, "de")
        );
      if (sort === "kcal-asc")
        return (
          getRecipeNutritionPerServing(a).kcal -
            getRecipeNutritionPerServing(b).kcal ||
          a.name.localeCompare(b.name, "de")
        );
      if (sort === "kcal-desc")
        return (
          getRecipeNutritionPerServing(b).kcal -
            getRecipeNutritionPerServing(a).kcal ||
          a.name.localeCompare(b.name, "de")
        );
      if (sort === "duration-asc")
        return a.durationMinutes - b.durationMinutes || a.name.localeCompare(b.name, "de");
      return a.name.localeCompare(b.name, "de");
    });

  const items = filtered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  res.json({
    items,
    total: filtered.length,
    hasMore: nextOffset < filtered.length,
    nextOffset,
  });
});

function parseShoppingListMode(value: unknown): ShoppingListMode {
  const mode = String(value || "package");
  return mode === "exact" || mode === "mealprep" ? mode : "package";
}

function parseMealprepFactor(value: unknown, mode: ShoppingListMode) {
  const fallback = mode === "mealprep" ? 2 : 1;
  const parsed = Number(String(value || fallback).replace(",", "."));
  if ([1, 2, 3, 4].includes(parsed)) return parsed;
  return fallback;
}

app.get("/api/recipes/:recipeId/shopping-list", async (req, res) => {
  const userId = currentUserId(req);
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((r) => r.id === req.params.recipeId);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });

  const mode = parseShoppingListMode(req.query.mode);
  const requestedFactor = parseMealprepFactor(req.query.factor, mode);
  const recipeMultiplier = mode === "mealprep" ? requestedFactor : 1;
  const settings = await readSettingsForUser(userId);
  const pantry = await readPantryStateForUser(userId);
  const shoppingState = await readShoppingState();
  const items = buildShoppingListForSlots(
    [{ recipe }],
    settings,
    (itemKey) => singleShoppingStateKey(userId, recipe.id, itemKey),
    pantry,
    shoppingState,
    [],
    {
      packageAdjusted: mode !== "exact",
      recipeMultiplier,
    },
  );

  await recordRecipeHistory(userId, recipe, "shopping-list");
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
        Boolean(shoppingState.checked[singleShoppingStateKey(userId, recipe.id, item.key)]),
      ]),
    ),
    pantryCatalog: pantryCatalogFromState(pantry),
    categories: groupShoppingItems(items),
    grouped: groupShoppingItems(items),
    items,
  });
});

app.post("/api/recipes/:recipeId/shopping-check", async (req, res) => {
  const userId = currentUserId(req);
  const { itemKey, checked } = req.body as {
    itemKey: string;
    checked: boolean;
  };
  if (!itemKey) return res.status(400).json({ error: "itemKey fehlt." });

  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((r) => r.id === req.params.recipeId);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });

  const state = await readShoppingState();
  state.checked[singleShoppingStateKey(userId, req.params.recipeId, itemKey)] =
    Boolean(checked);
  await writeShoppingState(state);
  res.json({ ok: true });
});

app.get("/api/recipes/:id", async (req, res) => {
  const userId = currentUserId(req);
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((r) => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });
  await recordRecipeHistory(userId, recipe, "viewed");
  res.json(enrichRecipe(recipe));
});

app.post("/api/recipes/:id/import-source", async (req, res) => {
  if (isDemoRequest(req)) {
    return res.status(403).json({
      error: "Rezeptimporte sind im Demo-Zugang nicht verfügbar.",
    });
  }
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const index = recipes.findIndex((r) => r.id === req.params.id);
  if (index < 0)
    return res.status(404).json({ error: "Rezept nicht gefunden." });
  try {
    const imported = await enrichRecipeFromSourceUrl(recipes[index]);
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

app.post("/api/recipes/import-all", async (req, res) => {
  if (isDemoRequest(req)) {
    return res.status(403).json({
      error: "Rezeptimporte sind im Demo-Zugang nicht verfügbar.",
    });
  }
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  let imported = 0;
  const errors: { id: string; message: string }[] = [];
  for (let i = 0; i < recipes.length; i += 1) {
    if (!recipes[i].sourceUrl) continue;
    try {
      recipes[i] = await enrichRecipeFromSourceUrl(recipes[i]);
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

app.get("/api/settings", async (req, res) => {
  res.json(await readSettingsForUser(currentUserId(req)));
});

app.patch("/api/settings", async (req, res) => {
  const userId = currentUserId(req);
  const current = await readSettingsForUser(userId);
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
    "fastMaxMinutes",
    "highProteinMinProteinPerServing",
    "lowCalMaxKcal",
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
  await writeSettingsForUser(userId, next);
  res.json(next);
});

app.get("/api/history/recipes", async (req, res) => {
  const userId = currentUserId(req);
  const history = await readJson<SingleRecipeHistoryEntry[]>(
    "recipeHistory.json",
    [],
  );
  res.json(
    history.filter((entry) => recipeHistoryEntryBelongsToUser(entry, userId)),
  );
});

app.post("/api/history/recipes", async (req, res) => {
  const userId = currentUserId(req);
  const { recipeId, action, viewedAt } = req.body as {
    recipeId?: string;
    action?: SingleRecipeHistoryEntry["action"];
    viewedAt?: string;
  };
  if (!recipeId) return res.status(400).json({ error: "recipeId fehlt." });
  const normalizedAction =
    action === "shopping-list" || action === "viewed" ? action : "viewed";
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });
  const timestamp =
    viewedAt && !Number.isNaN(Date.parse(viewedAt))
      ? new Date(viewedAt).toISOString()
      : undefined;
  const entry = await recordRecipeHistory(userId, recipe, normalizedAction, timestamp);
  res.json(entry);
});

app.get("/api/history", async (req, res) => {
  const history = await readJson<HistoryEntry[]>("history.json", []);
  res.json(historyForUser(history, currentUserId(req)));
});

app.post("/api/history/:planId/activate", async (req, res) => {
  const userId = currentUserId(req);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const entry = history.find(
    (item) =>
      item.id === req.params.planId && historyEntryBelongsToUser(item, userId),
  );
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
    userId,
    createdAt: now,
    recipeIds: activatedPlan.days.flatMap((day) =>
      day.meals.map((meal) => meal.recipe.id),
    ),
    plan: activatedPlan,
  };

  await writeJson("history.json", prependHistoryForUser(history, activatedEntry, userId));
  res.json(enrichPlan(activatedPlan));
});

app.post("/api/plans/generate", async (req, res) => {
  const userId = currentUserId(req);
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const userHistory = historyForUser(history, userId);
  const settings = await readSettingsForUser(userId);
  let plan: WeekPlan;
  try {
    plan = buildWeekPlan(recipes, userHistory, settings);
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
    userId,
    createdAt: plan.createdAt,
    recipeIds: plan.days.flatMap((d) => d.meals.map((m) => m.recipe.id)),
    plan,
  };
  await writeJson("history.json", prependHistoryForUser(history, entry, userId));
  res.json(enrichPlan(plan));
});

app.get("/api/plans/latest", async (req, res) => {
  const userId = currentUserId(req);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const latest = history.find(
    (h) => h.plan && historyEntryBelongsToUser(h, userId),
  );
  if (!latest?.plan)
    return res.status(404).json({ error: "Noch kein Wochenplan vorhanden." });
  res.json(enrichPlan(latest.plan));
});

app.post("/api/plans/:planId/remix", async (req, res) => {
  const userId = currentUserId(req);
  const { day, mealIndex } = req.body as { day: string; mealIndex: 1 | 2 };
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const userHistory = historyForUser(history, userId);
  const settings = await readSettingsForUser(userId);
  const idx = history.findIndex(
    (h) =>
      h.id === req.params.planId &&
      h.plan &&
      historyEntryBelongsToUser(h, userId),
  );
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
    userHistory.filter((entry) => entry.id !== req.params.planId),
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
          targetMealKcal: getRecipeNutritionPerServing(oldRecipe).kcal,
          targetMealProtein: getRecipeNutritionPerServing(oldRecipe).protein,
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
  const userId = currentUserId(req);
  const { day, mealIndex, recipeId } = req.body as {
    day: string;
    mealIndex: 1 | 2;
    recipeId: string;
  };
  const recipes = await readJson<Recipe[]>("recipes.json", []);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettingsForUser(userId);

  const idx = history.findIndex(
    (h) =>
      h.id === req.params.planId &&
      h.plan &&
      historyEntryBelongsToUser(h, userId),
  );
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
  const userId = currentUserId(req);
  const { fromDay, fromMealIndex, toDay, toMealIndex } = req.body as {
    fromDay: string;
    fromMealIndex: 1 | 2;
    toDay: string;
    toMealIndex: 1 | 2;
  };

  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettingsForUser(userId);

  const idx = history.findIndex(
    (h) =>
      h.id === req.params.planId &&
      h.plan &&
      historyEntryBelongsToUser(h, userId),
  );
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
  const userId = currentUserId(req);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const settings = await readSettingsForUser(userId);
  const pantry = await readPantryStateForUser(userId);
  const shoppingState = await readShoppingState();
  const entry = history.find(
    (h) =>
      h.id === req.params.planId &&
      h.plan &&
      historyEntryBelongsToUser(h, userId),
  );
  if (!entry?.plan)
    return res.status(404).json({ error: "Plan nicht gefunden." });
  const requested = String(req.query.range || "all");
  const range: ShoppingRange =
    requested === "mon-thu" || requested === "fri-sun" ? requested : "all";
  const items = buildShoppingList(
    entry.plan,
    settings,
    userId,
    range,
    pantry,
    shoppingState,
  );
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
  const userId = currentUserId(req);
  const { range, itemKey, checked } = req.body as {
    range: ShoppingRange;
    itemKey: string;
    checked: boolean;
  };
  if (!itemKey) return res.status(400).json({ error: "itemKey fehlt." });
  const normalizedRange: ShoppingRange =
    range === "mon-thu" || range === "fri-sun" ? range : "all";
  const state = await readShoppingState();
  state.checked[shoppingStateKey(userId, req.params.planId, normalizedRange, itemKey)] =
    Boolean(checked);
  await writeShoppingState(state);
  res.json({ ok: true });
});

app.get("/api/pantry", async (req, res) => {
  res.json(await readPantryStateForUser(currentUserId(req)));
});

app.post("/api/pantry", async (req, res) => {
  const userId = currentUserId(req);
  const { itemKey, inPantry, name, category } = req.body as {
    itemKey: string;
    inPantry: boolean;
    name?: string;
    category?: string;
  };
  if (!itemKey) return res.status(400).json({ error: "itemKey fehlt." });
  const pantry = await readPantryStateForUser(userId);
  pantry.items[itemKey] = Boolean(inPantry);
  pantry.names = pantry.names || {};
  pantry.categories = pantry.categories || {};
  if (name) pantry.names[itemKey] = name;
  if (category) pantry.categories[itemKey] = category;
  await writePantryStateForUser(userId, pantry);
  res.json(pantry);
});

app.get("/api/plans/archive", async (req, res) => {
  const userId = currentUserId(req);
  const history = await readJson<HistoryEntry[]>("history.json", []);
  const archive = history
    .filter((h) => h.plan && historyEntryBelongsToUser(h, userId))
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      hasPlan: Boolean(entry.plan),
      days: entry.plan!.days.map((day) => ({
        day: day.day,
        meals: day.meals.map((meal) => {
          const nutrition = getRecipeNutritionPerServing(meal.recipe);
          return {
            mealIndex: meal.mealIndex,
            recipeId: meal.recipe.id,
            name: meal.recipe.name,
            kcal: nutrition.kcal,
            protein: nutrition.protein,
          };
        }),
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
