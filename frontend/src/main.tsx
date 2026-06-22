import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RefreshCw,
  Printer,
  ShoppingBasket,
  History,
  Utensils,
  Home,
  BookOpen,
  CalendarDays,
  DownloadCloud,
  Dumbbell,
  Layout,
  LockKeyhole,
  SlidersHorizontal,
  UserRound,
  Search,
  X,
  Beef,
  Apple,
  Milk,
  Carrot,
  Wheat,
  Package,
  Soup,
  CupSoda,
  Store,
  CheckCheck,
  ChevronDown,
  Plus,
  Minus,
} from "lucide-react";
import "./styles.css";

type RecipeStep = { title?: string; text: string; imageUrl?: string };
type Recipe = {
  id: string;
  name: string;
  tier: string;
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
  dietaryType?: "omnivore" | "vegetarian" | "vegan" | "needs-review";
  classificationReasons?: string[];
  classificationNeedsReview?: boolean;
  ingredients: string[];
  instructions?: RecipeStep[];
  estimatedCost?: number;
  priceNote?: string;
  importedAt?: string | null;
};

type DayKey = "Mo" | "Di" | "Mi" | "Do" | "Fr" | "Sa" | "So";
type DailyMealCounts = Record<DayKey, number>;
type AppSettings = {
  targetKcal: number;
  targetProtein: number;
  mealsPerDay: number;
  dailyMealCounts: DailyMealCounts;
  shakeProteinWater: number;
  shakeProteinMilk: number;
  shakeKcalWater: number;
  shakeKcalMilk: number;
  girlfriendPortionFactor: number;
  avoidRepeatDays: number;
};

type MealSlot = { day: string; mealIndex: 1 | 2; recipe: Recipe };
type DayPlan = {
  day: string;
  meals: MealSlot[];
  mealKcal: number;
  mealProtein: number;
  shakes: string[];
  totalKcalWithShakes: number;
  totalProteinWithShakes: number;
};
type WeekPlan = { id: string; createdAt: string; days: DayPlan[]; remixMemory?: Record<string, string[]> };
type ShoppingItem = {
  key: string;
  name: string;
  amount: number;
  amountText?: string;
  unit: string;
  neededQuantity?: number;
  neededUnit?: string;
  neededText?: string;
  purchaseQuantity?: number;
  purchaseUnit?: string;
  purchaseLabel?: string;
  purchaseText?: string;
  remainderQuantity?: number;
  remainderUnit?: string;
  remainderText?: string;
  packageAdjusted?: boolean;
  packageNote?: string;
  recipes: string[];
  category?: string;
  checked?: boolean;
  inPantry?: boolean;
  estimatedCost?: number;
  priceNote?: string;
  priceType?: string;
  priceEstimatedFallback?: boolean;
  priceEntryKey?: string;
  pantryDefault?: boolean;
  source?: string;
};
type ShoppingRange = "all" | "mon-thu" | "fri-sun";
type SingleShoppingMode = "exact" | "package" | "mealprep";
type AuthState = "checking" | "locked" | "open";
type ShoppingPayload = {
  factor: number;
  range: ShoppingRange;
  rangeLabel: string;
  totalEstimatedCost: number;
  pantryItems?: Record<string, boolean>;
  pantryCatalog?: { key: string; name: string; category?: string; inPantry: boolean }[];
  items: ShoppingItem[];
};
type SingleShoppingPayload = Omit<ShoppingPayload, "range"> & {
  recipe: Recipe;
  range: "single";
  mode?: SingleShoppingMode;
  requestedFactor?: number;
  estimatedTotal?: number;
  grouped?: Record<string, ShoppingItem[]>;
  categories?: Record<string, ShoppingItem[]>;
  pantryStatus?: Record<string, boolean>;
  checkedStatus?: Record<string, boolean>;
};

type ArchiveEntry = {
  id: string;
  createdAt: string;
  recipeCount: number;
  hasPlan?: boolean;
  days: { day: string; meals: { mealIndex: 1 | 2; name: string; kcal: number; protein: number }[] }[];
};
type MealPilotUser = {
  id: string;
  name: string;
  createdAt?: string;
  settings?: AppSettings;
};
type SingleRecipeHistoryEntry = {
  id: string;
  recipeId: string;
  recipeName: string;
  imageUrl?: string;
  viewedAt: string;
  action: "viewed" | "shopping-list";
};
type PrintOrientation = "portrait" | "landscape";
type View = "home" | "plan" | "shopping" | "print" | "recipe" | "history" | "settings" | "single" | "profile";
type SingleSort = "rating" | "protein-desc" | "kcal-asc" | "kcal-desc" | "duration-asc" | "name-asc";
type HistoryMode = "plans" | "recipes";
type RecipesPage = {
  items: Recipe[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

const dayKeys: DayKey[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const defaultDailyMealCounts: DailyMealCounts = {
  Mo: 2,
  Di: 2,
  Mi: 2,
  Do: 2,
  Fr: 2,
  Sa: 2,
  So: 2,
};

const tierFilters = [
  "alle",
  "Himmel auf Erden",
  "Henkersmahlzeit",
  "Mamas Klassiker",
  "Mc Donalds",
];

type DailyDiscoveryCategoryKey = "all" | "fast" | "high-protein" | "low-cal" | "vegetarian" | "vegan";
type RecipeCategory = "schnell" | "high-protein" | "low-cal" | "vegetarisch" | "vegan";

const dailyDiscoveryCategories: {
  key: DailyDiscoveryCategoryKey;
  label: string;
  iconUrl?: string;
  Icon?: typeof Layout;
}[] = [
  {
    key: "all",
    label: "Alles",
    Icon: Layout,
  },
  {
    key: "fast",
    label: "Schnell",
    iconUrl: "/assets/category-icons/schnell.svg",
  },
  {
    key: "high-protein",
    label: "High Protein",
    iconUrl: "/assets/category-icons/high-protein.svg",
  },
  {
    key: "low-cal",
    label: "Low Cal",
    iconUrl: "/assets/meal-meta-icons/calories-flame.svg",
  },
  {
    key: "vegetarian",
    label: "Vegetarisch",
    iconUrl: "/assets/category-icons/vegetarisch.svg",
  },
  {
    key: "vegan",
    label: "Vegan",
    iconUrl: "/assets/category-icons/vegetarisch.svg",
  },
];

const shoppingCategoryOrder = [
  "Protein",
  "Kohlenhydrate",
  "Gemüse & Obst",
  "Gemüse",
  "Milchprodukte",
  "Saucen, Gewürze & Vorrat",
  "Saucen & Vorrat",
  "Shakes",
  "Sonstiges",
];

function tierRank(tier: string): number {
  const value = tier.toLowerCase();
  if (value.includes("himmel")) return 4;
  if (value.includes("henker")) return 3;
  if (value.includes("mamas")) return 2;
  if (value.includes("mcdonald") || value.includes("mc donald")) return 1;
  return 0;
}

function getLocalDateKey(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getRecipeNutritionPerServing(recipe: Recipe) {
  return {
    kcal: recipe.nutritionPerServing?.kcal ?? recipe.kcal,
    protein: recipe.nutritionPerServing?.protein ?? recipe.protein,
  };
}

const fallbackMeatOrFishTerms = [
  "haehnchen",
  "chicken",
  "pute",
  "turkey",
  "rind",
  "beef",
  "steak",
  "rinderhack",
  "hackfleisch",
  "hack",
  "schwein",
  "pork",
  "speck",
  "bacon",
  "wurst",
  "salami",
  "chorizo",
  "fleisch",
  "fleischbaellchen",
  "schnitzel",
  "lachs",
  "salmon",
  "thunfisch",
  "tuna",
  "fisch",
  "seelachs",
  "garnele",
  "garnelen",
  "shrimp",
  "prawns",
  "meeresfruechte",
];

const fallbackAnimalProductTerms = [
  ...fallbackMeatOrFishTerms,
  "kaese",
  "gouda",
  "mozzarella",
  "parmesan",
  "feta",
  "hirtenkaese",
  "grillkaese",
  "hartkaese",
  "ricotta",
  "cheddar",
  "milch",
  "milk",
  "sahne",
  "cream",
  "creme",
  "schmand",
  "joghurt",
  "yogurt",
  "quark",
  "skyr",
  "butter",
  "ei",
  "eier",
  "egg",
  "honig",
  "honey",
  "huehnerbruehe",
  "rinderbruehe",
];

function normalizeDiscoveryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recipeDiscoveryText(recipe: Recipe): string {
  return normalizeDiscoveryText(
    [recipe.name, recipe.tier, ...(recipe.tags || []), ...(recipe.ingredients || [])].join(" "),
  );
}

function discoveryTextHasTerm(text: string, terms: string[]): boolean {
  const tokens = text.match(/[a-z0-9]+/g) || [];
  return terms.some((term) =>
    tokens.some((token) => {
      if (token === term) return true;
      if (term.length <= 3) return false;
      if (token.startsWith(term)) return true;
      return term.length >= 5 && token.includes(term);
    }),
  );
}

function fallbackRecipeMatchesDiscoveryCategory(
  recipe: Recipe,
  categoryKey: DailyDiscoveryCategoryKey,
): boolean {
  const nutrition = getRecipeNutritionPerServing(recipe);
  if (categoryKey === "fast") return recipe.durationMinutes <= 30;
  if (categoryKey === "high-protein") {
    const proteinDensity =
      nutrition.kcal > 0 ? (nutrition.protein / nutrition.kcal) * 100 : 0;
    return nutrition.protein >= 35 || (nutrition.protein >= 25 && proteinDensity >= 4.5);
  }
  if (categoryKey === "low-cal") return nutrition.kcal > 0 && nutrition.kcal <= 650;

  const text = recipeDiscoveryText(recipe);
  const hasIngredients = Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0;
  if (!hasIngredients) return false;
  if (categoryKey === "vegetarian") {
    return !discoveryTextHasTerm(text, fallbackMeatOrFishTerms);
  }
  if (categoryKey === "vegan") {
    return !discoveryTextHasTerm(text, fallbackAnimalProductTerms);
  }
  return false;
}

function recipeCategoryForDiscovery(categoryKey: DailyDiscoveryCategoryKey): RecipeCategory | null {
  if (categoryKey === "fast") return "schnell";
  if (categoryKey === "high-protein") return "high-protein";
  if (categoryKey === "low-cal") return "low-cal";
  if (categoryKey === "vegetarian") return "vegetarisch";
  if (categoryKey === "vegan") return "vegan";
  return null;
}

function sortRecipesForDailyDiscovery(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "de") ||
      a.id.localeCompare(b.id, "de"),
  );
}

function getDailyCategoryRecipes(
  recipes: Recipe[],
  categoryKey: DailyDiscoveryCategoryKey,
): Recipe[] {
  const sortedRecipes = sortRecipesForDailyDiscovery(recipes);
  if (categoryKey === "all") return sortedRecipes;
  const recipeCategory = recipeCategoryForDiscovery(categoryKey);

  const filtered = sortedRecipes.filter((recipe) => {
    if (recipeCategory && Array.isArray(recipe.categories)) {
      return recipe.categories.includes(recipeCategory);
    }

    return fallbackRecipeMatchesDiscoveryCategory(recipe, categoryKey);
  });

  return filtered;
}

function getDailyOverrideStorageKey(
  dateKey: string,
  categoryKey: DailyDiscoveryCategoryKey,
): string {
  return `mealpilot_daily_discovery_override_${dateKey}_${categoryKey}`;
}

function readDailyOverrideRecipe(
  recipes: Recipe[],
  dateKey: string,
  categoryKey: DailyDiscoveryCategoryKey,
): Recipe | null {
  if (typeof window === "undefined") return null;
  try {
    const storedId = window.localStorage.getItem(
      getDailyOverrideStorageKey(dateKey, categoryKey),
    );
    return storedId ? recipes.find((recipe) => recipe.id === storedId) || null : null;
  } catch {
    return null;
  }
}

function getDailyRecipe(
  recipes: Recipe[],
  dateKey: string,
  categoryKey: DailyDiscoveryCategoryKey,
): Recipe | null {
  if (!recipes.length) return null;
  const override = readDailyOverrideRecipe(recipes, dateKey, categoryKey);
  if (override) return override;
  const index = hashString(`${dateKey}:${categoryKey}`) % recipes.length;
  return recipes[index];
}

function getRecipeSummary(recipe: Recipe): string {
  const cleanTags = (recipe.tags || [])
    .filter((tag) => tag && !tag.toLowerCase().includes("himmel"))
    .slice(0, 2);
  if (cleanTags.length) {
    return `${cleanTags.join(" und ")} auf den Punkt gebracht. Schnell gemacht und einfach lecker.`;
  }
  const ingredients = (recipe.ingredients || []).slice(0, 3);
  if (ingredients.length >= 2) {
    return `Mit ${ingredients.join(", ")}. Einfach geplant und bereit zum Kochen.`;
  }
  return "Schnell gemacht, unkompliziert geplant und einfach lecker.";
}

function groupShoppingItems(items: ShoppingItem[]) {
  const map = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const key = item.category || "Sonstiges";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.entries()].sort((a, b) => {
    const indexA = shoppingCategoryOrder.indexOf(a[0]);
    const indexB = shoppingCategoryOrder.indexOf(b[0]);
    if (indexA !== indexB) return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    return a[0].localeCompare(b[0], "de");
  });
}

const currentUserStorageKey = "mealpilot_current_user_id";
const currentUserNameStorageKey = "mealpilot_current_user_name";
const legacyViewedRecipesStorageKey = "mealpilot_viewed_recipes";

function readCurrentUserId() {
  if (typeof window === "undefined") return "johannes-sophie";
  return window.localStorage.getItem(currentUserStorageKey) || "johannes-sophie";
}

function writeCurrentUserId(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(currentUserStorageKey, userId || "johannes-sophie");
}

function readStoredCurrentUser(): MealPilotUser | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(currentUserStorageKey);
  const name = window.localStorage.getItem(currentUserNameStorageKey);
  return id && name ? { id, name } : null;
}

function writeCurrentUser(user: Pick<MealPilotUser, "id" | "name">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(currentUserStorageKey, user.id);
  window.localStorage.setItem(currentUserNameStorageKey, user.name);
}

function clearCurrentUserId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(currentUserStorageKey);
  window.localStorage.removeItem(currentUserNameStorageKey);
}

async function migrateLegacyViewedRecipes(userId: string) {
  if (typeof window === "undefined") return;
  const migrationKey = `mealpilot_viewed_recipes_migrated_${userId}`;
  if (window.localStorage.getItem(migrationKey) === "true") return;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(legacyViewedRecipesStorageKey) || "[]",
    ) as { id?: string; viewedAt?: string }[];
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice().reverse()) {
        if (!item.id) continue;
        await api<SingleRecipeHistoryEntry>("/api/history/recipes", {
          method: "POST",
          body: JSON.stringify({
            recipeId: item.id,
            action: "viewed",
            viewedAt: item.viewedAt,
          }),
        });
      }
    }
  } catch {
    // Migration ist optional; der neue Backend-Verlauf bleibt die Quelle.
  } finally {
    window.localStorage.setItem(migrationKey, "true");
  }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    "X-MealPilot-User": readCurrentUserId(),
    ...(options?.headers && !(options.headers instanceof Headers)
      ? (options.headers as Record<string, string>)
      : {}),
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  return res.json() as Promise<T>;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [pinInput, setPinInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Lädt...");
  const [error, setError] = useState<string | null>(null);
  const [shoppingData, setShoppingData] = useState<Record<
    ShoppingRange,
    ShoppingPayload
  > | null>(null);
  const [shoppingContext, setShoppingContext] = useState<"week" | "single">("week");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeBackView, setRecipeBackView] = useState<View>("plan");
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [singleDishRecipe, setSingleDishRecipe] = useState<Recipe | null>(null);
  const [singleInitialQuery, setSingleInitialQuery] = useState("");
  const [singleShoppingData, setSingleShoppingData] = useState<SingleShoppingPayload | null>(null);
  const [singleShoppingLoading, setSingleShoppingLoading] = useState(false);
  const [singleShoppingError, setSingleShoppingError] = useState<string | null>(null);
  const [singleShoppingMode, setSingleShoppingMode] = useState<SingleShoppingMode>("mealprep");
  const [singleMealFactor, setSingleMealFactor] = useState(1);
  const [changeTarget, setChangeTarget] = useState<MealSlot | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("plans");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [draggingSlot, setDraggingSlot] = useState<{ day: string; mealIndex: 1 | 2 } | null>(null);
  const [currentUser, setCurrentUser] = useState<MealPilotUser | null>(null);
  const [recipeHistory, setRecipeHistory] = useState<SingleRecipeHistoryEntry[]>([]);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (authState !== "open") return;
    loadCurrentUser();
    api<WeekPlan>("/api/plans/latest")
      .then((p) => setPlan(p))
      .catch(() => undefined);
    loadRecipes();
  }, [authState]);

  async function loadCurrentUser() {
    try {
      const user = await api<MealPilotUser>("/api/users/current");
      writeCurrentUser(user);
      setCurrentUser(user);
      await migrateLegacyViewedRecipes(user.id);
      const history = await api<SingleRecipeHistoryEntry[]>("/api/history/recipes");
      setRecipeHistory(history);
    } catch {
      setCurrentUser(null);
      setRecipeHistory([]);
    }
  }

  async function loadRecipeHistory() {
    try {
      const history = await api<SingleRecipeHistoryEntry[]>("/api/history/recipes");
      setRecipeHistory(history);
      return history;
    } catch {
      setRecipeHistory([]);
      return [];
    }
  }

  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/auth/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 401) {
        const storedUser = readStoredCurrentUser();
        if (storedUser && localStorage.getItem("mealpilot_pin_ok") === "true") {
          setCurrentUser(storedUser);
          setAuthState("open");
          return;
        }
        clearCurrentUserId();
        setAuthState(
          "locked",
        );
        return;
      }
      const data = (await res.json()) as { enabled: boolean; ok: boolean; user?: MealPilotUser };
      if (!data.enabled) {
        localStorage.removeItem("mealpilot_pin_ok");
      }
      if (data.ok && data.user) {
        writeCurrentUser(data.user);
        setCurrentUser(data.user);
      }
      setAuthState(data.ok ? "open" : "locked");
    } catch {
      setAuthError("PIN-Status konnte nicht geprüft werden.");
      setAuthState("locked");
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (!res.ok) {
        setAuthError("PIN ist falsch.");
        return;
      }
      const data = (await res.json()) as { ok: boolean; user?: MealPilotUser };
      if (!data.ok || !data.user) {
        setAuthError("PIN ist falsch.");
        return;
      }
      localStorage.setItem("mealpilot_pin_ok", "true");
      writeCurrentUser(data.user);
      setCurrentUser(data.user);
      setAuthState("open");
    } catch {
      setAuthError("PIN konnte nicht geprüft werden.");
    }
  }

  function logout() {
    localStorage.removeItem("mealpilot_pin_ok");
    clearCurrentUserId();
    setPinInput("");
    setAuthError(null);
    setCurrentUser(null);
    setPlan(null);
    setShoppingData(null);
    setSingleShoppingData(null);
    setRecipeHistory([]);
    setSelectedRecipe(null);
    setChangeTarget(null);
    setView("home");
    setAuthState("locked");
  }

  async function loadRecipes() {
    try {
      const recipes = await api<Recipe[]>("/api/recipes");
      setAllRecipes(recipes);
    } catch {
      // Die Rezeptliste wird spätestens beim gezielten Ändern erneut geladen.
    }
  }

  async function openHistory(mode: HistoryMode = "plans") {
    setLoading(true);
    setLoadingText("Verlauf wird geladen...");
    setError(null);
    try {
      setHistoryMode(mode);
      if (mode === "plans") {
        const data = await api<ArchiveEntry[]>("/api/plans/archive");
        setArchive(data);
      } else {
        await loadRecipeHistory();
      }
      setView("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verlauf konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  async function openSettings() {
    setLoading(true);
    setLoadingText("Einstellungen werden geladen...");
    setError(null);
    setSettingsSaved(false);
    try {
      const data = await api<AppSettings>("/api/settings");
      setSettings(data);
      setView("settings");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einstellungen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  function setDailyMealCount(day: DayKey, count: number) {
    setSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        dailyMealCounts: {
          ...current.dailyMealCounts,
          [day]: count,
        },
      };
    });
    setSettingsSaved(false);
  }

  function resetDailyMealCounts() {
    setSettings((current) =>
      current
        ? { ...current, dailyMealCounts: { ...defaultDailyMealCounts } }
        : current,
    );
    setSettingsSaved(false);
  }

  async function saveSettings() {
    if (!settings) return;
    setLoading(true);
    setLoadingText("Einstellungen werden gespeichert...");
    setError(null);
    try {
      const next = await api<AppSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ dailyMealCounts: settings.dailyMealCounts }),
      });
      setSettings(next);
      setSettingsSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einstellungen konnten nicht gespeichert werden");
    } finally {
      setLoading(false);
    }
  }

  async function activateHistoryPlan(planId: string) {
    setLoading(true);
    setLoadingText("Wochenplan wird geöffnet...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/history/${planId}/activate`, {
        method: "POST",
        body: "{}",
      });
      setPlan(next);
      setShoppingData(null);
      setSelectedRecipe(null);
      setChangeTarget(null);
      setView("plan");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Wochenplan konnte nicht geöffnet werden",
      );
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    setLoading(true);
    setLoadingText("Wochenplan wird erstellt...");
    setError(null);
    try {
      const next = await api<WeekPlan>("/api/plans/generate", {
        method: "POST",
        body: "{}",
      });
      setPlan(next);
      setView("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function remix(day: string, mealIndex: 1 | 2) {
    if (!plan) return;
    setLoading(true);
    setLoadingText("Gericht wird zufällig ersetzt...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/plans/${plan.id}/remix`, {
        method: "POST",
        body: JSON.stringify({ day, mealIndex }),
      });
      setPlan(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remix fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function replaceMeal(day: string, mealIndex: 1 | 2, recipeId: string) {
    if (!plan) return;
    setLoading(true);
    setLoadingText("Gericht wird gezielt geändert...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/plans/${plan.id}/replace`, {
        method: "POST",
        body: JSON.stringify({ day, mealIndex, recipeId }),
      });
      setPlan(next);
      setChangeTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ändern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function moveMeal(
    fromDay: string,
    fromMealIndex: 1 | 2,
    toDay: string,
    toMealIndex: 1 | 2,
  ) {
    if (!plan) return;
    if (fromDay === toDay && fromMealIndex === toMealIndex) return;
    setLoading(true);
    setLoadingText("Gerichte werden verschoben...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/plans/${plan.id}/move-meal`, {
        method: "POST",
        body: JSON.stringify({ fromDay, fromMealIndex, toDay, toMealIndex }),
      });
      setPlan(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verschieben fehlgeschlagen");
    } finally {
      setDraggingSlot(null);
      setLoading(false);
    }
  }

  async function openChange(slot: MealSlot) {
    if (allRecipes.length === 0) await loadRecipes();
    setChangeTarget(slot);
  }

  async function loadShoppingData(showLoading = true) {
    if (!plan) return null;
    if (showLoading) {
      setLoading(true);
      setLoadingText("Einkaufsliste wird berechnet...");
    }
    setError(null);
    try {
      const [all, first, second] = await Promise.all([
        api<ShoppingPayload>(`/api/plans/${plan.id}/shopping-list?range=all`),
        api<ShoppingPayload>(
          `/api/plans/${plan.id}/shopping-list?range=mon-thu`,
        ),
        api<ShoppingPayload>(
          `/api/plans/${plan.id}/shopping-list?range=fri-sun`,
        ),
      ]);
      const data = { all, "mon-thu": first, "fri-sun": second };
      setShoppingData(data);
      return data;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Einkaufsliste konnte nicht geladen werden",
      );
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function openShopping() {
    setShoppingContext("week");
    setView("shopping");
    if (plan) await loadShoppingData(true);
  }

  // Einzelrezept-Einkauf: Liste laden und im Einkauf-Tab anzeigen.
  async function openSingleShopping(recipe: Recipe) {
    setShoppingContext("single");
    setView("shopping");
    await loadSingleShoppingData(recipe, true);
  }

  // Bottom-/Desktop-Navigation: passenden Einkauf-Kontext anzeigen.
  function openShoppingTab() {
    if (shoppingContext === "single" && (singleShoppingData || singleShoppingLoading)) {
      setView("shopping");
      return;
    }
    void openShopping();
  }

  // Segment-Control auf der Einkauf-Seite: zwischen Einzelgericht und Wocheneinkauf wechseln.
  function selectShoppingSegment(segment: "single" | "week") {
    if (segment === "single") {
      setShoppingContext("single");
      return;
    }
    setShoppingContext("week");
    if (plan && !shoppingData) void loadShoppingData(true);
  }

  async function openSingleDish(initialQuery = "") {
    if (allRecipes.length === 0) await loadRecipes();
    setSingleInitialQuery(initialQuery);
    setSingleShoppingError(null);
    setView("single");
  }

  async function loadSingleShoppingData(
    recipe: Recipe,
    showLoading = true,
    mode: SingleShoppingMode = singleShoppingMode,
    factor = singleMealFactor,
  ) {
    setSingleDishRecipe(recipe);
    setSingleShoppingError(null);
    if (showLoading) setSingleShoppingLoading(true);
    try {
      const params = new URLSearchParams({ mode });
      if (mode === "mealprep") params.set("factor", String(factor));
      const data = await api<SingleShoppingPayload>(
        `/api/recipes/${recipe.id}/shopping-list?${params.toString()}`,
      );
      setSingleShoppingData(data);
      setSingleDishRecipe(data.recipe);
      void loadRecipeHistory();
      return data;
    } catch (e) {
      setSingleShoppingError(
        e instanceof Error
          ? e.message
          : "Einkaufsliste konnte nicht erstellt werden",
      );
      return null;
    } finally {
      if (showLoading) setSingleShoppingLoading(false);
    }
  }

  async function changeSingleShoppingMode(mode: SingleShoppingMode) {
    const nextFactor = mode === "mealprep" && singleMealFactor === 1 ? 2 : singleMealFactor;
    setSingleShoppingMode(mode);
    if (mode === "mealprep" && nextFactor !== singleMealFactor) {
      setSingleMealFactor(nextFactor);
    }
    if (singleDishRecipe) await loadSingleShoppingData(singleDishRecipe, true, mode, nextFactor);
  }

  async function changeSingleMealFactor(factor: number) {
    setSingleMealFactor(factor);
    if (singleDishRecipe) {
      const mode = singleShoppingMode === "mealprep" ? singleShoppingMode : "mealprep";
      if (mode !== singleShoppingMode) setSingleShoppingMode(mode);
      await loadSingleShoppingData(singleDishRecipe, true, mode, factor);
    }
  }

  function resetSingleDishSelection() {
    setSingleDishRecipe(null);
    setSingleShoppingData(null);
    setSingleShoppingError(null);
  }

  async function setShoppingChecked(range: ShoppingRange, itemKey: string, checked: boolean) {
    if (!plan) return;
    setShoppingData((current) => {
      if (!current) return current;
      return {
        ...current,
        [range]: {
          ...current[range],
          items: current[range].items.map((item) =>
            item.key === itemKey ? { ...item, checked } : item,
          ),
        },
      };
    });
    try {
      await api(`/api/plans/${plan.id}/shopping-check`, {
        method: "POST",
        body: JSON.stringify({ range, itemKey, checked }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkbox konnte nicht gespeichert werden");
      await loadShoppingData(false);
    }
  }

  async function setSingleShoppingChecked(recipeId: string, itemKey: string, checked: boolean) {
    setSingleShoppingData((current) => {
      if (!current) return current;
      return {
        ...current,
        checkedStatus: { ...(current.checkedStatus || {}), [itemKey]: checked },
        items: current.items.map((item) =>
          item.key === itemKey ? { ...item, checked } : item,
        ),
      };
    });
    try {
      await api(`/api/recipes/${recipeId}/shopping-check`, {
        method: "POST",
        body: JSON.stringify({ itemKey, checked }),
      });
    } catch (e) {
      setSingleShoppingError(e instanceof Error ? e.message : "Checkbox konnte nicht gespeichert werden");
      if (singleDishRecipe) await loadSingleShoppingData(singleDishRecipe, false);
    }
  }

  async function setPantryItem(itemKey: string, inPantry: boolean, name?: string, category?: string) {
    setShoppingData((current) => {
      if (!current) return current;
      const next = { ...current };
      for (const range of Object.keys(next) as ShoppingRange[]) {
        const existingCatalog = next[range].pantryCatalog || [];
        const hasCatalogItem = existingCatalog.some((entry) => entry.key === itemKey);
        next[range] = {
          ...next[range],
          pantryItems: { ...(next[range].pantryItems || {}), [itemKey]: inPantry },
          pantryCatalog: hasCatalogItem
            ? existingCatalog.map((entry) =>
                entry.key === itemKey ? { ...entry, inPantry, name: name || entry.name, category: category || entry.category } : entry,
              )
            : [...existingCatalog, { key: itemKey, name: name || itemKey, category, inPantry }],
          items: next[range].items.map((item) =>
            item.key === itemKey ? { ...item, inPantry } : item,
          ),
        };
      }
      return next;
    });
    setSingleShoppingData((current) => {
      if (!current) return current;
      const existingCatalog = current.pantryCatalog || [];
      const hasCatalogItem = existingCatalog.some((entry) => entry.key === itemKey);
      return {
        ...current,
        pantryItems: { ...(current.pantryItems || {}), [itemKey]: inPantry },
        pantryStatus: { ...(current.pantryStatus || {}), [itemKey]: inPantry },
        pantryCatalog: hasCatalogItem
          ? existingCatalog.map((entry) =>
              entry.key === itemKey ? { ...entry, inPantry, name: name || entry.name, category: category || entry.category } : entry,
            )
          : [...existingCatalog, { key: itemKey, name: name || itemKey, category, inPantry }],
        items: current.items.map((item) =>
          item.key === itemKey ? { ...item, inPantry } : item,
        ),
      };
    });
    try {
      await api("/api/pantry", {
        method: "POST",
        body: JSON.stringify({ itemKey, inPantry, name, category }),
      });
      await loadShoppingData(false);
      if (singleDishRecipe) await loadSingleShoppingData(singleDishRecipe, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zuhause-Liste konnte nicht gespeichert werden");
    }
  }

  async function openRecipe(recipe: Recipe) {
    setRecipeBackView(view === "recipe" ? "plan" : view);
    setLoading(true);
    setLoadingText("Rezept wird geöffnet...");
    setError(null);
    try {
      const full = await api<Recipe>(`/api/recipes/${recipe.id}`);
      setSelectedRecipe(full);
      setView("recipe");
      void loadRecipeHistory();
    } catch (e) {
      setSelectedRecipe(recipe);
      setView("recipe");
      setError(
        e instanceof Error
          ? e.message
          : "Rezept konnte nicht vollständig geladen werden",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openRecipeById(recipeId: string) {
    const knownRecipe =
      allRecipes.find((recipe) => recipe.id === recipeId) || selectedRecipe;
    if (knownRecipe?.id === recipeId) {
      await openRecipe(knownRecipe);
      return;
    }
    setRecipeBackView("history");
    setLoading(true);
    setLoadingText("Rezept wird geöffnet...");
    setError(null);
    try {
      const recipe = await api<Recipe>(`/api/recipes/${recipeId}`);
      setSelectedRecipe(recipe);
      setView("recipe");
      void loadRecipeHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rezept konnte nicht geöffnet werden");
    } finally {
      setLoading(false);
    }
  }

  async function openRecipeShoppingById(recipeId: string) {
    const knownRecipe = allRecipes.find((recipe) => recipe.id === recipeId);
    if (knownRecipe) {
      await openSingleShopping(knownRecipe);
      return;
    }
    setLoading(true);
    setLoadingText("Einkaufsliste wird geöffnet...");
    setError(null);
    try {
      const recipe = await api<Recipe>(`/api/recipes/${recipeId}`);
      await openSingleShopping(recipe);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einkaufsliste konnte nicht geöffnet werden");
    } finally {
      setLoading(false);
    }
  }

  async function importRecipe(recipe: Recipe) {
    setLoading(true);
    setLoadingText("HelloFresh-Bilder und Anleitung werden importiert...");
    setError(null);
    try {
      const imported = await api<Recipe>(
        `/api/recipes/${recipe.id}/import-source`,
        { method: "POST", body: "{}" },
      );
      setSelectedRecipe(imported);
      if (plan) setPlan(replaceRecipeEverywhere(plan, imported));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fehlgeschlagen. Tipp: Prüfe im Serverfenster, ob HelloFresh den Zugriff blockiert hat.");
    } finally {
      setLoading(false);
    }
  }

  async function importAll() {
    setLoading(true);
    setLoadingText(
      "Alle HelloFresh-Bilder werden importiert. Das kann dauern...",
    );
    setError(null);
    try {
      const result = await api<{
        imported: number;
        errors: { id: string; message: string }[];
      }>("/api/recipes/import-all", { method: "POST", body: "{}" });
      setError(
        result.errors.length
          ? `${result.imported} Rezepte importiert, ${result.errors.length} Fehler. Details stehen in der Konsole vom Server.`
          : `${result.imported} Rezepte importiert.`,
      );
      if (plan) {
        const latest = await api<WeekPlan>("/api/plans/latest");
        setPlan(latest);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Import aller Rezepte fehlgeschlagen",
      );
    } finally {
      setLoading(false);
    }
  }

  if (authState !== "open") {
    return (
      <PinGate
        checking={authState === "checking"}
        pin={pinInput}
        error={authError}
        onPinChange={setPinInput}
        onSubmit={submitPin}
      />
    );
  }

  return (
    <div className={`app view-${view}`}>
      {view !== "print" && (
        <>
          <header className="topbar">
            <button className="brand" onClick={() => setView("home")}>
              <Utensils size={24} />
              <span>MealPilot</span>
            </button>
            <DesktopNavigation
  plan={plan}
  openHome={() => setView("home")}
  openSingleDish={() => openSingleDish()}
  openShopping={openShoppingTab}
  openPlan={() => setView("plan")}
  openHistory={openHistory}
  openSettings={openSettings}
  openPrint={() => setView("print")}
  openProfile={() => setView("profile")}
/>
            {currentUser && (
              <span className="header-user-greeting">Hallo {currentUser.name}</span>
            )}
          </header>
          <BottomNavigation
            view={view}
            plan={plan}
            openHome={() => setView("home")}
            openSingleDish={() => openSingleDish()}
            openShopping={openShoppingTab}
            openPlan={() => setView("plan")}
            openProfile={() => setView("profile")}
          />
        </>
      )}

      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {loading && <div className="loading">{loadingText}</div>}

      {view === "home" && (
        <HomeView
          allRecipes={allRecipes}
          openRecipe={openRecipe}
        />
      )}
      {view === "plan" && (
  plan ? (
    <PlanView
      plan={plan}
      remix={remix}
      openRecipe={openRecipe}
      openChange={openChange}
      openPrint={() => setView("print")}
      openShopping={openShopping}
      draggingSlot={draggingSlot}
      setDraggingSlot={setDraggingSlot}
      moveMeal={moveMeal}
    />
  ) : (
    <PlanEmptyState
      generatePlan={generatePlan}
      openSettings={openSettings}
      currentUser={currentUser}
    />
  )
)}
      {view === "shopping" && (
        <ShoppingView
          context={shoppingContext}
          data={shoppingData}
          onCheckedChange={setShoppingChecked}
          onPantryChange={setPantryItem}
          single={singleShoppingData}
          singleRecipe={singleDishRecipe}
          singleLoading={singleShoppingLoading}
          singleError={singleShoppingError}
          onSingleCheckedChange={setSingleShoppingChecked}
          shoppingMode={singleShoppingMode}
          mealFactor={singleMealFactor}
          onShoppingModeChange={changeSingleShoppingMode}
          onMealFactorChange={changeSingleMealFactor}
          onResetSingle={resetSingleDishSelection}
          onSelectSegment={selectShoppingSegment}
          planAvailable={Boolean(plan)}
          goToRecipes={() => openSingleDish()}
          goToPlan={() => setView("plan")}
        />
      )}
      {view === "single" && (
        <SingleDishView
          initialQuery={singleInitialQuery}
          onOpenRecipe={openRecipe}
          onOpenShopping={openSingleShopping}
        />
      )}
      {view === "history" && (
        <HistoryView
          mode={historyMode}
          archive={archive}
          recipeHistory={recipeHistory}
          activatePlan={activateHistoryPlan}
          openPlans={() => void openHistory("plans")}
          openRecipes={() => void openHistory("recipes")}
          openRecipeById={(recipeId) => void openRecipeById(recipeId)}
          openRecipeShoppingById={(recipeId) => void openRecipeShoppingById(recipeId)}
        />
      )}
      {view === "profile" && (
        <ProfileView
          currentUser={currentUser}
          openSettings={openSettings}
          openPlanHistory={() => void openHistory("plans")}
          openRecipeHistory={() => void openHistory("recipes")}
          logout={logout}
          recipeHistory={recipeHistory}
        />
      )}
      {view === "settings" && settings && (
        <SettingsView
          settings={settings}
          saved={settingsSaved}
          setDailyMealCount={setDailyMealCount}
          resetDailyMealCounts={resetDailyMealCounts}
          saveSettings={saveSettings}
        />
      )}
      {view === "recipe" && selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          back={() => setView(recipeBackView === "recipe" ? "plan" : recipeBackView)}
          importRecipe={importRecipe}
        />
      )}
      {view === "print" && plan && (
        <PrintView plan={plan} back={() => setView("plan")} />
      )}

      {changeTarget && plan && (
        <ChangeRecipeModal
          target={changeTarget}
          recipes={allRecipes}
          usedRecipeIds={new Set(
            plan.days
              .flatMap((day) => day.meals)
              .filter(
                (slot) =>
                  !(
                    slot.day === changeTarget.day &&
                    slot.mealIndex === changeTarget.mealIndex
                  ),
              )
              .map((slot) => slot.recipe.id),
          )}
          onClose={() => setChangeTarget(null)}
          onSelect={(recipeId) =>
            replaceMeal(changeTarget.day, changeTarget.mealIndex, recipeId)
          }
        />
      )}
    </div>
  );
}

function PlanEmptyState({
  generatePlan,
  openSettings,
  currentUser,
}: {
  generatePlan: () => void;
  openSettings: () => void;
  currentUser: MealPilotUser | null;
}) {
  return (
    <main className="page-wrap plan-empty-page">
      <section className="plan-empty-card">
        <div className="plan-empty-icon">
          <CalendarDays size={28} />
        </div>

        <p className="eyebrow">Wochenplan</p>
        <h1>Dein Wochenplan</h1>

        <p>
          Du hast für {currentUser?.name || "dieses Profil"} noch keinen
          Wochenplan erstellt. Erstelle deinen ersten Wochenplan basierend auf
          deinen persönlichen Einstellungen.
        </p>

        <div className="plan-empty-actions">
          <button className="primary" onClick={generatePlan}>
            <CalendarDays size={18} /> Wochenplan erstellen
          </button>

          <button className="secondary" onClick={openSettings}>
            <SlidersHorizontal size={18} /> Plan-Einstellungen öffnen
          </button>
        </div>
      </section>
    </main>
  );
}

function PinGate({
  checking,
  pin,
  error,
  onPinChange,
  onSubmit,
}: {
  checking: boolean;
  pin: string;
  error: string | null;
  onPinChange: (pin: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <main className="pin-screen">
      <form className="pin-panel" onSubmit={onSubmit}>
        <div className="pin-icon">
          <LockKeyhole size={28} />
        </div>
        <p className="eyebrow">MealPilot</p>
        <h1>PIN</h1>
        {checking ? (
          <p className="hint">Zugriff wird geprüft...</p>
        ) : (
          <>
            <input
              value={pin}
              onChange={(e) => onPinChange(e.target.value)}
              inputMode="numeric"
              type="password"
              placeholder="PIN eingeben"
              autoFocus
            />
            {error && <p className="pin-error">{error}</p>}
            <button className="primary" type="submit">
              <LockKeyhole size={18} /> Öffnen
            </button>
          </>
        )}
      </form>
    </main>
  );
}

function DesktopNavigation({
  plan,
  openHome,
  openSingleDish,
  openShopping,
  openPlan,
  openHistory,
  openSettings,
  openPrint,
  openProfile,
}: {
  plan: WeekPlan | null;
  openHome: () => void;
  openSingleDish: () => void;
  openShopping: () => void;
  openPlan: () => void;
  openHistory: () => void;
  openSettings: () => void;
  openPrint: () => void;
  openProfile: () => void;
}) {
  return (
    <nav className="desktop-nav" aria-label="Hauptnavigation">
      <button onClick={openHome}>
        <Home size={18} /> Entdecken
      </button>
      <button onClick={openSingleDish}>
        <BookOpen size={18} /> Rezepte
      </button>
      <button onClick={openShopping}>
        <ShoppingBasket size={18} /> Einkauf
      </button>
      <button onClick={openPlan}>
  <CalendarDays size={18} /> Wochenplan
</button>
      <button onClick={openHistory}>
        <History size={18} /> Verlauf
      </button>
      <button onClick={openProfile}>
  <UserRound size={18} /> Profil
</button>
      <button onClick={openSettings}>
        <SlidersHorizontal size={18} /> Einstellungen
      </button>
      <button disabled={!plan} onClick={openPrint}>
        <Printer size={18} /> Druckansicht
      </button>
    </nav>
  );
}

function BottomNavigation({
  view,
  plan,
  openHome,
  openSingleDish,
  openShopping,
  openPlan,
  openProfile,
}: {
  view: View;
  plan: WeekPlan | null;
  openHome: () => void;
  openSingleDish: () => void;
  openShopping: () => void;
  openPlan: () => void;
  openProfile: () => void;
}) {
  const activeTab =
    view === "single" || view === "recipe"
      ? "recipes"
      : view === "shopping"
        ? "shopping"
        : view === "plan" || view === "print"
          ? "plan"
          : view === "profile" || view === "settings" || view === "history"
            ? "profile"
            : "home";

  return (
    <nav className="bottom-nav" aria-label="Mobile Hauptnavigation">
      <button className={activeTab === "home" ? "active" : ""} onClick={openHome}>
        <Home size={21} />
        <span>Entdecken</span>
      </button>
      <button className={activeTab === "recipes" ? "active" : ""} onClick={openSingleDish}>
        <BookOpen size={21} />
        <span>Rezepte</span>
      </button>
      <button className={activeTab === "shopping" ? "active" : ""} onClick={openShopping}>
        <ShoppingBasket size={21} />
        <span>Einkauf</span>
      </button>
      <button className={activeTab === "plan" ? "active" : ""} onClick={openPlan}>
  <CalendarDays size={21} />
  <span>Wochenplan</span>
</button>
      <button className={activeTab === "profile" ? "active" : ""} onClick={openProfile}>
        <UserRound size={21} />
        <span>Profil</span>
      </button>
    </nav>
  );
}

function ProfileView({
  currentUser,
  openSettings,
  openPlanHistory,
  openRecipeHistory,
  logout,
  recipeHistory,
}: {
  currentUser: MealPilotUser | null;
  openSettings: () => void;
  openPlanHistory: () => void;
  openRecipeHistory: () => void;
  logout: () => void;
  recipeHistory: SingleRecipeHistoryEntry[];
}) {
  const [profileSettings, setProfileSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [archiveCount, setArchiveCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    api<AppSettings>("/api/settings")
      .then((data) => {
        if (!active) return;
        setProfileSettings(data);
        setSettingsDraft(data);
      })
      .catch(() => {
        if (active) setProfileError("Einstellungen konnten nicht geladen werden.");
      });
    api<ArchiveEntry[]>("/api/plans/archive")
      .then((data) => {
        if (active) setArchiveCount(data.length);
      })
      .catch(() => {
        if (active) setArchiveCount(0);
      });
    return () => {
      active = false;
    };
  }, []);

  const weekdayCounts = profileSettings?.dailyMealCounts;
  const moFrCounts = weekdayCounts ? dayKeys.slice(0, 5).map((day) => weekdayCounts[day]) : [];
  const weekendCounts = weekdayCounts ? dayKeys.slice(5).map((day) => weekdayCounts[day]) : [];
  const compactMealCount = (values: number[]) => {
    if (!values.length) return "lädt...";
    const unique = [...new Set(values)];
    if (unique.length === 1) return `${unique[0]} ${unique[0] === 1 ? "Gericht" : "Gerichte"}`;
    return `${Math.min(...values)}-${Math.max(...values)} Gerichte`;
  };

  function updateDraftDay(day: DayKey, count: number) {
    setSettingsDraft((current) =>
      current
        ? {
            ...current,
            dailyMealCounts: {
              ...current.dailyMealCounts,
              [day]: count,
            },
          }
        : current,
    );
  }

  function updateDraftNumber(field: "targetKcal" | "targetProtein", value: string) {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    setSettingsDraft((current) =>
      current ? { ...current, [field]: numeric } : current,
    );
  }

  async function saveProfileSettings() {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const next = await api<AppSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          dailyMealCounts: settingsDraft.dailyMealCounts,
          targetKcal: settingsDraft.targetKcal,
          targetProtein: settingsDraft.targetProtein,
        }),
      });
      setProfileSettings(next);
      setSettingsDraft(next);
      setSettingsOpen(false);
      setProfileMessage("Plan-Einstellungen gespeichert.");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Einstellungen konnten nicht gespeichert werden.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function cancelProfileSettings() {
    setSettingsDraft(profileSettings);
    setSettingsOpen(false);
    setProfileError(null);
  }

  return (
    <main className="profile-page">
      <section className="profile-hero">
        <h1>Profil</h1>
        <p>Hier findest du dein Konto, Ziele, Einstellungen und deinen Verlauf.</p>
      </section>

      {profileError && <div className="profile-status error-like">{profileError}</div>}
      {profileMessage && <div className="profile-status">{profileMessage}</div>}

      <section className="profile-account-card">
        <div className="profile-avatar">
          <UserRound size={34} aria-hidden="true" />
        </div>
        <div className="profile-account-copy">
          <h2>Dein MealPilot Konto</h2>
          <p>{currentUser?.name || "Angemeldet"}</p>
          <div className="profile-action-row">
            <button type="button" className="profile-primary-button" onClick={openSettings}>
              <SlidersHorizontal size={18} /> Einstellungen öffnen
            </button>
            <button type="button" className="profile-secondary-button" onClick={logout}>
              <LockKeyhole size={18} /> Ausloggen
            </button>
          </div>
        </div>
      </section>

      <section className="profile-card profile-plan-card">
        <div className="profile-card-head">
          <span className="profile-card-icon">
            <CalendarDays size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Dein Wochenplan</h2>
            <p>Lege fest, wie dein Wochenplan aufgebaut ist.</p>
          </div>
          <button
            type="button"
            className="profile-secondary-button"
            onClick={() => setSettingsOpen(true)}
            disabled={!settingsDraft}
          >
            Plan-Einstellungen
          </button>
        </div>

        <div className="profile-plan-grid">
          <article className="profile-plan-stat">
            <span>Mo-Fr</span>
            <strong>{compactMealCount(moFrCounts)}</strong>
          </article>
          <article className="profile-plan-stat">
            <span>Sa-So</span>
            <strong>{compactMealCount(weekendCounts)}</strong>
          </article>
          <article className="profile-plan-stat">
            <span>Ziel pro Tag</span>
            <strong>
              {profileSettings
                ? `${profileSettings.targetKcal} kcal / ${profileSettings.targetProtein} g Protein`
                : "lädt..."}
            </strong>
          </article>
        </div>

        {settingsOpen && settingsDraft && (
          <div className="profile-settings-panel">
            <div className="profile-settings-head">
              <div>
                <h3>Plan-Einstellungen</h3>
                <p>Gerichte je Tag und Tagesziele anpassen.</p>
              </div>
              <button type="button" className="profile-secondary-button" onClick={cancelProfileSettings}>
                Abbrechen
              </button>
            </div>

            <div className="profile-settings-grid">
              {dayKeys.map((day) => (
                <label className="profile-day-setting" key={day}>
                  <span>{day}</span>
                  <select
                    value={settingsDraft.dailyMealCounts[day]}
                    onChange={(e) => updateDraftDay(day, Number(e.target.value))}
                  >
                    <option value={0}>0 Gerichte</option>
                    <option value={1}>1 Gericht</option>
                    <option value={2}>2 Gerichte</option>
                  </select>
                </label>
              ))}
            </div>

            <div className="profile-goal-inputs">
              <label>
                <span>Tagesziel kcal</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={settingsDraft.targetKcal}
                  onChange={(e) => updateDraftNumber("targetKcal", e.target.value)}
                />
              </label>
              <label>
                <span>Tagesziel Protein</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={settingsDraft.targetProtein}
                  onChange={(e) => updateDraftNumber("targetProtein", e.target.value)}
                />
              </label>
            </div>

            <div className="profile-settings-actions">
              <button
                type="button"
                className="profile-primary-button"
                onClick={() => void saveProfileSettings()}
                disabled={settingsSaving}
              >
                {settingsSaving ? "Speichert..." : "Speichern"}
              </button>
              <button type="button" className="profile-secondary-button" onClick={cancelProfileSettings}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="profile-card">
        <div className="profile-card-head">
          <span className="profile-card-icon">
            <History size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Dein Verlauf</h2>
            <p>Deine Aktivitäten und gespeicherten Inhalte.</p>
          </div>
        </div>

        <div className="profile-history-list">
          <button type="button" className="profile-history-row" onClick={openPlanHistory}>
            <span>
              <strong>Wochenpläne</strong>
              <small>{archiveCount === null ? "lädt..." : `${archiveCount} gespeichert`}</small>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="profile-history-row"
            onClick={openRecipeHistory}
          >
            <span>
              <strong>Einzelgerichte</strong>
              <small>{recipeHistory.length} Einträge</small>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <button type="button" className="profile-card profile-settings-link" onClick={openSettings}>
        <span className="profile-card-icon">
          <SlidersHorizontal size={22} aria-hidden="true" />
        </span>
        <span>
          <strong>App-Einstellungen</strong>
          <small>Allgemeine App-Einstellungen.</small>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
    </main>
  );
}

function SettingsView({
  settings,
  saved,
  setDailyMealCount,
  resetDailyMealCounts,
  saveSettings,
}: {
  settings: AppSettings;
  saved: boolean;
  setDailyMealCount: (day: DayKey, count: number) => void;
  resetDailyMealCounts: () => void;
  saveSettings: () => void;
}) {
  const totalMeals = dayKeys.reduce(
    (sum, day) => sum + settings.dailyMealCounts[day],
    0,
  );

  return (
    <main className="page-wrap settings-wrap">
      <section className="page-head">
        <div>
          <p className="eyebrow">Planung</p>
          <h1>Einstellungen</h1>
          <p>
            Lege fest, wie viele Gerichte MealPilot pro Wochentag einplanen
            soll.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h2>Gerichte pro Tag</h2>
            <p>{totalMeals} Gerichte pro Woche</p>
          </div>
          <button className="secondary" onClick={resetDailyMealCounts}>
            Standard: jeden Tag 2
          </button>
        </div>

        <div className="daily-settings-grid">
          {dayKeys.map((day) => (
            <label className="daily-setting-row" key={day}>
              <span>{day}</span>
              <select
                value={settings.dailyMealCounts[day]}
                onChange={(e) =>
                  setDailyMealCount(day, Number(e.target.value))
                }
              >
                <option value={0}>0 Gerichte</option>
                <option value={1}>1 Gericht</option>
                <option value={2}>2 Gerichte</option>
              </select>
            </label>
          ))}
        </div>

        <div className="settings-actions">
          <button className="primary" onClick={saveSettings}>
            Speichern
          </button>
          {saved && <span>Einstellungen gespeichert</span>}
        </div>
      </section>
    </main>
  );
}

function replaceRecipeEverywhere(plan: WeekPlan, recipe: Recipe): WeekPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: day.meals.map((slot) =>
        slot.recipe.id === recipe.id ? { ...slot, recipe } : slot,
      ),
    })),
  };
}

function RecipeMeta({
  durationMinutes,
  kcal,
  protein,
  compact = false,
  detailed = false,
}: {
  durationMinutes: number;
  kcal: number;
  protein: number;
  compact?: boolean;
  detailed?: boolean;
}) {
  return (
    <div className={`recipe-meta ${compact ? "compact" : ""} ${detailed ? "detailed" : ""}`}>
      <span className="recipe-meta-item">
        <img
          src="/assets/meal-meta-icons/clock-time.svg"
          alt=""
          aria-hidden="true"
        />
        <span className="recipe-meta-copy">
          <strong>{durationMinutes} Min.</strong>
          {detailed && <small>Gesamtzeit</small>}
        </span>
      </span>
      <span className="recipe-meta-item">
        <img
          src="/assets/meal-meta-icons/calories-flame.svg"
          alt=""
          aria-hidden="true"
        />
        <span className="recipe-meta-copy">
          <strong>{kcal} kcal</strong>
          {detailed && <small>pro Portion</small>}
        </span>
      </span>
      <span className="recipe-meta-item">
        <Dumbbell className="recipe-meta-lucide" size={18} aria-hidden="true" />
        <span className="recipe-meta-copy">
          <strong>{protein} g</strong>
          {detailed ? <small>Protein</small> : " Protein"}
        </span>
      </span>
    </div>
  );
}

function HomeView({
  allRecipes,
  openRecipe,
}: {
  allRecipes: Recipe[];
  openRecipe: (recipe: Recipe) => void;
}) {
  const [activeCategoryKey, setActiveCategoryKey] =
    useState<DailyDiscoveryCategoryKey>("all");
  const [dateKey, setDateKey] = useState(getLocalDateKey);
  const [sessionOverrides, setSessionOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDateKey((current) => {
        const next = getLocalDateKey();
        return current === next ? current : next;
      });
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const activeCategory =
    dailyDiscoveryCategories.find((category) => category.key === activeCategoryKey) ||
    dailyDiscoveryCategories[0];
  const candidateRecipes = useMemo(
    () => getDailyCategoryRecipes(allRecipes, activeCategoryKey),
    [allRecipes, activeCategoryKey],
  );
  const overrideKey = getDailyOverrideStorageKey(dateKey, activeCategoryKey);
  const dailyRecipe = useMemo(
    () => {
      const sessionOverride = candidateRecipes.find(
        (recipe) => recipe.id === sessionOverrides[overrideKey],
      );
      return sessionOverride || getDailyRecipe(candidateRecipes, dateKey, activeCategoryKey);
    },
    [candidateRecipes, dateKey, activeCategoryKey, overrideKey, sessionOverrides],
  );

  function rerollDailyRecipe() {
    if (!dailyRecipe || candidateRecipes.length === 0) return;
    const currentIndex = Math.max(
      0,
      candidateRecipes.findIndex((recipe) => recipe.id === dailyRecipe.id),
    );
    const nextRecipe =
      candidateRecipes.length > 1
        ? candidateRecipes[(currentIndex + 1) % candidateRecipes.length]
        : candidateRecipes[currentIndex];
    try {
      window.localStorage.setItem(overrideKey, nextRecipe.id);
    } catch {}
    setSessionOverrides((current) => ({ ...current, [overrideKey]: nextRecipe.id }));
  }

  return (
    <main className="discover-page">
      <section className="daily-category-tabs" aria-label="Tageskategorien">
        {dailyDiscoveryCategories.map((category) => {
          const isActive = category.key === activeCategory.key;
          const Icon = category.Icon;
          return (
            <button
              className={`daily-category-tab ${isActive ? "active" : ""}`}
              key={category.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveCategoryKey(category.key)}
            >
              {category.iconUrl ? (
                <img src={category.iconUrl} alt="" aria-hidden="true" />
              ) : Icon ? (
                <Icon size={22} aria-hidden="true" />
              ) : null}
              <span>{category.label}</span>
            </button>
          );
        })}
      </section>

      <p className="daily-info">
        <span aria-hidden="true">i</span>
        Jede Kategorie hat ihr eigenes zufälliges Gericht des Tages.
      </p>

      {dailyRecipe ? (
        <DailyRecipeCard recipe={dailyRecipe} openRecipe={openRecipe} />
      ) : (
        <section className="daily-empty">Rezepte werden geladen...</section>
      )}

      <button
        className="reroll-button"
        type="button"
        onClick={rerollDailyRecipe}
        disabled={!dailyRecipe}
      >
        <RefreshCw size={18} />
        Neu würfeln
      </button>
    </main>
  );
}

function DailyRecipeCard({
  recipe,
  openRecipe,
}: {
  recipe: Recipe;
  openRecipe: (recipe: Recipe) => void;
}) {
  const nutrition = getRecipeNutritionPerServing(recipe);
  return (
    <article className="daily-recipe-card">
      <div className="daily-recipe-image">
        <img src={recipe.imageUrl} alt={recipe.name} />
        <span className="daily-recipe-badge">
          <RefreshCw size={18} aria-hidden="true" />
          Gericht des Tages
        </span>
      </div>
      <div className="daily-recipe-body">
        <p className="daily-recipe-tier">{recipe.tier}</p>
        <h2 className="daily-recipe-title">{recipe.name}</h2>
        <p className="daily-recipe-description">{getRecipeSummary(recipe)}</p>
        <RecipeMeta
          detailed
          durationMinutes={recipe.durationMinutes}
          kcal={nutrition.kcal}
          protein={nutrition.protein}
        />
        <button
          className="daily-recipe-action"
          type="button"
          onClick={() => openRecipe(recipe)}
        >
          Rezept ansehen
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}

function PlanView({
  plan,
  openRecipe,
  openChange,
  openPrint,
  openShopping,
}: {
  plan: WeekPlan;
  remix: (day: string, mealIndex: 1 | 2) => void;
  openRecipe: (recipe: Recipe) => void;
  openChange: (slot: MealSlot) => void;
  openPrint: () => void;
  openShopping: () => void;
  draggingSlot: { day: string; mealIndex: 1 | 2 } | null;
  setDraggingSlot: (slot: { day: string; mealIndex: 1 | 2 } | null) => void;
  moveMeal: (fromDay: string, fromMealIndex: 1 | 2, toDay: string, toMealIndex: 1 | 2) => void;
}) {
  const todayIndex = new Date().getDay();
  const todayKey = dayKeys[(todayIndex + 6) % 7];
  const defaultDay = plan.days.some((day) => day.day === todayKey)
    ? todayKey
    : (plan.days[0]?.day as DayKey | undefined) || "Mo";
  const [selectedDayKey, setSelectedDayKey] = useState<DayKey>(defaultDay);

  useEffect(() => {
    if (!plan.days.some((day) => day.day === selectedDayKey)) {
      setSelectedDayKey(defaultDay);
    }
  }, [defaultDay, plan.days, selectedDayKey]);

  const avg = useMemo(() => {
    const kcal = Math.round(
      plan.days.reduce((s, d) => s + d.totalKcalWithShakes, 0) /
        plan.days.length,
    );
    const protein = Math.round(
      plan.days.reduce((s, d) => s + d.totalProteinWithShakes, 0) /
        plan.days.length,
    );
    return { kcal, protein };
  }, [plan]);
  const selectedDay =
    plan.days.find((day) => day.day === selectedDayKey) || plan.days[0];

  if (!selectedDay) {
    return (
      <main className="plan-page">
        <section className="plan-intro">
          <h1>Dein Wochenplan</h1>
          <p>Leckere Gerichte, perfekt für deine Woche.</p>
        </section>
        <section className="plan-empty-card">
          Für diese Woche ist noch kein Plan vorhanden.
        </section>
      </main>
    );
  }

  return (
    <main className="plan-page">
      <section className="plan-intro">
        <h1>Dein Wochenplan</h1>
        <p>Leckere Gerichte, perfekt für deine Woche.</p>
      </section>

      <section className="plan-stats-card" aria-label="Durchschnitt pro Tag">
        <div className="plan-stat">
          <span className="plan-stat-icon">
            <img src="/assets/meal-meta-icons/calories-flame.svg" alt="" aria-hidden="true" />
          </span>
          <span>
            <strong>Ø ca. {avg.kcal} kcal</strong>
            <small>pro Tag</small>
          </span>
        </div>
        <div className="plan-stat">
          <span className="plan-stat-icon">
            <Dumbbell size={22} aria-hidden="true" />
          </span>
          <span>
            <strong>{avg.protein} g Protein</strong>
            <small>pro Tag</small>
          </span>
        </div>
      </section>

      <section className="plan-day-tabs" aria-label="Wochentage">
        {plan.days.map((day) => (
          <button
            key={day.day}
            type="button"
            className={`plan-day-tab ${day.day === selectedDay.day ? "active" : ""}`}
            onClick={() => setSelectedDayKey(day.day as DayKey)}
          >
            <span>{day.day}</span>
            {day.day === selectedDay.day && (
              <span className="plan-day-indicator" aria-hidden="true" />
            )}
          </button>
        ))}
      </section>

      <section className="plan-meals" aria-label={`Gerichte am ${selectedDay.day}`}>
        {selectedDay.meals.length === 0 ? (
          <article className="plan-empty-card">
            Für diesen Tag sind noch keine Gerichte geplant.
          </article>
        ) : (
          selectedDay.meals.map((slot) => (
            <PlanMealCard
              key={`${selectedDay.day}-${slot.mealIndex}`}
              slot={slot}
              onChange={() => openChange(slot)}
              onOpen={() => openRecipe(slot.recipe)}
            />
          ))
        )}
      </section>

      <section className="plan-day-summary">
        <span className="plan-summary-icon">
          <CalendarDays size={22} aria-hidden="true" />
        </span>
        <div className="plan-summary-copy">
          <strong>Tagesgesamt</strong>
          <small>
            {selectedDay.meals.length}{" "}
            {selectedDay.meals.length === 1 ? "Gericht" : "Gerichte"} geplant
          </small>
        </div>
        <div className="plan-summary-values">
          <strong>{selectedDay.totalKcalWithShakes} kcal</strong>
          <span>{selectedDay.totalProteinWithShakes} g Protein</span>
        </div>
        <ChevronDown className="plan-summary-chevron" size={18} aria-hidden="true" />
      </section>

      <section className="plan-secondary-actions" aria-label="Weitere Plan-Aktionen">
        <button type="button" className="secondary" onClick={openShopping}>
          <ShoppingBasket size={18} /> Einkaufsliste
        </button>
        <button type="button" className="secondary" onClick={openPrint}>
          <Printer size={18} /> Druckansicht
        </button>
      </section>
    </main>
  );
}

function PlanMealCard({
  slot,
  onChange,
  onOpen,
}: {
  slot: MealSlot;
  onChange: () => void;
  onOpen: () => void;
}) {
  const recipe = slot.recipe;
  const nutrition = getRecipeNutritionPerServing(recipe);
  return (
    <article className="plan-meal-card">
      <button type="button" className="plan-meal-image-button" onClick={onOpen}>
        <img className="plan-meal-image" src={recipe.imageUrl} alt={recipe.name} />
      </button>
      <div className="plan-meal-content">
        <p className="plan-meal-tier">{recipe.tier}</p>
        <h2 className="plan-meal-title">{recipe.name}</h2>
        <div className="plan-meal-meta" aria-label="Rezeptwerte">
          <PlanMealMetaItem
            icon={<img src="/assets/meal-meta-icons/clock-time.svg" alt="" aria-hidden="true" />}
            value={`${recipe.durationMinutes} Min.`}
            label="Dauer"
          />
          <PlanMealMetaItem
            icon={<img src="/assets/meal-meta-icons/calories-flame.svg" alt="" aria-hidden="true" />}
            value={`${nutrition.kcal} kcal`}
            label="pro Portion"
          />
          <PlanMealMetaItem
            icon={<Dumbbell size={16} aria-hidden="true" />}
            value={`${nutrition.protein} g`}
            label="Protein"
          />
        </div>
        <div className="plan-meal-divider" />
        <div className="plan-meal-actions">
          <button type="button" className="secondary" onClick={onChange}>
            <RefreshCw size={17} /> Tauschen
          </button>
          <button type="button" className="primary" onClick={onOpen}>
            <BookOpen size={17} /> Details
          </button>
        </div>
      </div>
    </article>
  );
}

function PlanMealMetaItem({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <span className="plan-meal-meta-item">
      <span className="plan-meal-meta-icon">{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </span>
  );
}

function DayCard({
  day,
  remix,
  openRecipe,
  openChange,
  draggingSlot,
  setDraggingSlot,
  moveMeal,
}: {
  day: DayPlan;
  remix: (day: string, mealIndex: 1 | 2) => void;
  openRecipe: (recipe: Recipe) => void;
  openChange: (slot: MealSlot) => void;
  draggingSlot: { day: string; mealIndex: 1 | 2 } | null;
  setDraggingSlot: (slot: { day: string; mealIndex: 1 | 2 } | null) => void;
  moveMeal: (fromDay: string, fromMealIndex: 1 | 2, toDay: string, toMealIndex: 1 | 2) => void;
}) {
  return (
    <article className={`day-card meal-count-${day.meals.length}`}>
      <div className="day-label">{day.day}</div>
      <div className="meals">
        {day.meals.length === 0 && (
          <div className="no-meals">Kein Gericht geplant</div>
        )}
        {day.meals.map((slot) => (
          <MealCard
            key={`${day.day}-${slot.mealIndex}`}
            slot={slot}
            onOpen={() => openRecipe(slot.recipe)}
            onRemix={() => remix(day.day, slot.mealIndex)}
            onChange={() => openChange(slot)}
            draggingSlot={draggingSlot}
            setDraggingSlot={setDraggingSlot}
            moveMeal={moveMeal}
          />
        ))}
      </div>
      <aside className="day-stats">
        <strong>{day.totalKcalWithShakes} kcal</strong>
        <span>{day.totalProteinWithShakes} g Protein</span>
        <small>
          Shakes: {day.shakes.length ? day.shakes.join(" + ") : "keine"}
        </small>
      </aside>
    </article>
  );
}

function MealCard({
  slot,
  onOpen,
  onRemix,
  onChange,
  draggingSlot,
  setDraggingSlot,
  moveMeal,
}: {
  slot: MealSlot;
  onOpen: () => void;
  onRemix: () => void;
  onChange: () => void;
  draggingSlot: { day: string; mealIndex: 1 | 2 } | null;
  setDraggingSlot: (slot: { day: string; mealIndex: 1 | 2 } | null) => void;
  moveMeal: (fromDay: string, fromMealIndex: 1 | 2, toDay: string, toMealIndex: 1 | 2) => void;
}) {
  const r = slot.recipe;
  const nutrition = getRecipeNutritionPerServing(r);
  const isDragging =
    draggingSlot?.day === slot.day && draggingSlot?.mealIndex === slot.mealIndex;

  function handleDrop() {
    if (!draggingSlot) return;
    moveMeal(draggingSlot.day, draggingSlot.mealIndex, slot.day, slot.mealIndex);
  }

  return (
    <article
      className={`meal-card draggable-meal ${isDragging ? "is-dragging" : ""}`}
      title="Kochansicht öffnen oder Gericht ziehen"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ day: slot.day, mealIndex: slot.mealIndex }),
        );
        setDraggingSlot({ day: slot.day, mealIndex: slot.mealIndex });
      }}
      onDragEnd={() => setDraggingSlot(null)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleDrop();
      }}
    >
      <button
        className="meal-open-area"
        onClick={onOpen}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      >
        <img src={r.imageUrl} alt={r.name} draggable={false} />
        <div className="meal-content">
          <div className="tier">{r.tier}</div>
          <h3>{r.name}</h3>
          <RecipeMeta
            compact
            durationMinutes={r.durationMinutes}
            kcal={nutrition.kcal}
            protein={nutrition.protein}
          />
          <span className="price-pill">
            ≈ {formatEuro(r.estimatedCost)} für dich
          </span>
          <span className="open-recipe">
            <BookOpen size={14} /> Anleitung öffnen
          </span>
        </div>
      </button>
      <div className="meal-actions">
        <button className="remix" onClick={onRemix}>
          <RefreshCw size={15} /> Remix
        </button>
        <button className="change-meal" onClick={onChange}>
          Ändern
        </button>
      </div>
    </article>
  );
}

function ChangeRecipeModal({
  target,
  recipes,
  usedRecipeIds,
  onClose,
  onSelect,
}: {
  target: MealSlot;
  recipes: Recipe[];
  usedRecipeIds: Set<string>;
  onClose: () => void;
  onSelect: (recipeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("alle");

  const tiers = useMemo(() => {
    return [
      "alle",
      ...Array.from(new Set(recipes.map((recipe) => recipe.tier))).sort(),
    ];
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((recipe) => recipe.id !== target.recipe.id)
      .filter((recipe) => tierFilter === "alle" || recipe.tier === tierFilter)
      .filter((recipe) => {
        if (!q) return true;
        const haystack = [
          recipe.name,
          recipe.tier,
          ...(recipe.tags || []),
          ...(recipe.ingredients || []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const usedA = usedRecipeIds.has(a.id) ? 1 : 0;
        const usedB = usedRecipeIds.has(b.id) ? 1 : 0;
        if (usedA !== usedB) return usedA - usedB;
        return b.tier.localeCompare(a.tier, "de");
      });
  }, [query, recipes, target.recipe.id, tierFilter, usedRecipeIds]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="change-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Gezielt ändern</p>
            <h2>Gericht ersetzen</h2>
            <p>
              {target.day}, Mahlzeit {target.mealIndex}: aktuell „
              {target.recipe.name}“
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="recipe-filters">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nach Gericht, Zutat oder Tag suchen …"
            autoFocus
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            {tiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier === "alle" ? "Alle Kategorien" : tier}
              </option>
            ))}
          </select>
        </div>

        <div className="recipe-picker-list">
          {filtered.map((recipe) => {
            const used = usedRecipeIds.has(recipe.id);
            const nutrition = getRecipeNutritionPerServing(recipe);
            return (
              <article className={`recipe-picker-item ${used ? "used" : ""}`} key={recipe.id}>
                <img src={recipe.imageUrl} alt={recipe.name} />
                <div>
                  <span>{recipe.tier}</span>
                  <h3>{recipe.name}</h3>
                  <RecipeMeta
                    compact
                    durationMinutes={recipe.durationMinutes}
                    kcal={nutrition.kcal}
                    protein={nutrition.protein}
                  />
                  <p>≈ {formatEuro(recipe.estimatedCost)}</p>
                  {used && <small>Schon in dieser Woche eingeplant</small>}
                </div>
                <button
                  className="primary"
                  disabled={used}
                  onClick={() => onSelect(recipe.id)}
                >
                  Einsetzen
                </button>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-picker">Kein passendes Rezept gefunden.</div>
          )}
        </div>
      </section>
    </div>
  );
}

const RECIPES_PAGE_SIZE = 5;

function SingleDishView({
  initialQuery,
  onOpenRecipe,
  onOpenShopping,
}: {
  initialQuery: string;
  onOpenRecipe: (recipe: Recipe) => void;
  onOpenShopping: (recipe: Recipe) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim());
  const [sort, setSort] = useState<SingleSort>("name-asc");
  const [tierFilter, setTierFilter] = useState("alle");

  const [items, setItems] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialQuery.trim()) setQuery(initialQuery);
  }, [initialQuery]);

  // Suche entprellen, damit nicht jeder Tastendruck eine Anfrage auslöst.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = useCallback(
    async (reset: boolean) => {
      if (!reset && (loadingRef.current || !hasMoreRef.current)) return;
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;
      const offset = reset ? 0 : nextOffsetRef.current;
      if (reset) setLoadingInitial(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(RECIPES_PAGE_SIZE),
          offset: String(offset),
          query: debouncedQuery,
          sort,
          tier: tierFilter,
        });
        const data = await api<RecipesPage>(`/api/recipes?${params.toString()}`);
        if (requestId !== requestIdRef.current) return;
        nextOffsetRef.current = data.nextOffset;
        hasMoreRef.current = data.hasMore;
        setTotal(data.total);
        setHasMore(data.hasMore);
        setItems((prev) => {
          if (reset) return data.items;
          const seen = new Set(prev.map((recipe) => recipe.id));
          return [...prev, ...data.items.filter((recipe) => !seen.has(recipe.id))];
        });
      } catch (e) {
        if (requestId === requestIdRef.current) {
          setError(e instanceof Error ? e.message : "Rezepte konnten nicht geladen werden");
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoadingInitial(false);
          setLoadingMore(false);
          loadingRef.current = false;
        }
      }
    },
    [debouncedQuery, sort, tierFilter],
  );

  // Bei jeder Filter-/Sortier-/Suchänderung Liste zurücksetzen und erste Seite laden.
  useEffect(() => {
    nextOffsetRef.current = 0;
    hasMoreRef.current = false;
    void load(true);
  }, [load]);

  // Infinite Scroll: lädt nach, sobald der Sentinel sichtbar wird.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void load(false);
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [load, items.length, hasMore]);

  return (
    <main className="recipes-page">
      <section className="recipes-filter-card">
        <div className="recipes-search-row">
          <div className="recipes-search-input">
            <Search size={20} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rezepte, Zutaten, Küchen suchen..."
              aria-label="Rezepte suchen"
            />
          </div>
        </div>
        <div className="recipes-filter-grid">
          <label>
            <span>Sortierung</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SingleSort)}>
              <option value="name-asc">Alphabetisch</option>
              <option value="protein-desc">Protein hoch</option>
              <option value="kcal-asc">Kalorien niedrig</option>
              <option value="kcal-desc">Kalorien hoch</option>
              <option value="duration-asc">Dauer kurz</option>
            </select>
          </label>
          <label>
            <span>Kategorie</span>
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
              {tierFilters.map((tier) => (
                <option key={tier} value={tier}>
                  {tier === "alle" ? "Alle Kategorien" : tier}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loadingInitial ? (
        <div className="recipes-empty-state">Rezepte werden geladen...</div>
      ) : error && items.length === 0 ? (
        <div className="recipes-empty-state">{error}</div>
      ) : items.length === 0 ? (
        <div className="recipes-empty-state">Keine passenden Rezepte gefunden.</div>
      ) : (
        <>
          <section className="recipes-list">
            {items.map((recipe) => {
              const tags = (recipe.tags || []).filter(Boolean).slice(0, 3);
              const nutrition = getRecipeNutritionPerServing(recipe);
              return (
                <article className="recipe-list-card" key={recipe.id}>
                  <div className="recipe-list-card-image">
                    <img src={recipe.imageUrl} alt={recipe.name} loading="lazy" />
                  </div>
                  <div className="recipe-list-card-body">
                    {recipe.tier && <span className="recipe-list-card-tier">{recipe.tier}</span>}
                    <h2>{recipe.name}</h2>
                    <RecipeMeta
                      compact
                      durationMinutes={recipe.durationMinutes}
                      kcal={nutrition.kcal}
                      protein={nutrition.protein}
                    />
                    {tags.length > 0 && (
                      <div className="recipe-list-card-tags">
                        {tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {typeof recipe.estimatedCost === "number" && (
                      <small className="recipe-list-card-cost">≈ {formatEuro(recipe.estimatedCost)}</small>
                    )}
                    <div className="recipe-list-card-actions">
                      <button className="primary" onClick={() => onOpenRecipe(recipe)}>
                        <BookOpen size={18} /> Rezept ansehen
                      </button>
                      <button className="secondary" onClick={() => onOpenShopping(recipe)}>
                        <ShoppingBasket size={18} /> Einkauf
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {error && items.length > 0 && <div className="inline-error">{error}</div>}

          {hasMore && <div ref={sentinelRef} className="load-more-sentinel" aria-hidden="true" />}

          {hasMore && !loadingMore && (
            <button
              type="button"
              className="secondary load-more-button"
              onClick={() => void load(false)}
            >
              Weitere Rezepte laden
            </button>
          )}

          {loadingMore && (
            <p className="load-more-status">Weitere Rezepte werden geladen...</p>
          )}

          {!hasMore && (
            <p className="load-more-status">
              Alle passenden Rezepte geladen{total ? ` (${total})` : ""}.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function ShoppingAmountDetails({ item }: { item: ShoppingItem }) {
  if (item.purchaseText === "Vorrat prüfen" || item.unit === "prüfen") {
    return (
      <span className="shopping-amount">
        <b>Vorrat prüfen</b>
      </span>
    );
  }

  if (item.packageAdjusted && item.neededText && item.purchaseText) {
    return (
      <span className="shopping-amount">
        <b>
          {item.neededText} benötigt · {item.purchaseText} kaufen
        </b>
        {item.remainderText && <small>Rest ca. {item.remainderText}</small>}
      </span>
    );
  }

  return (
    <span className="shopping-amount">
      <b>{item.neededText || item.amountText || `${item.amount} ${item.unit}`}</b>
    </span>
  );
}

function formatEuro(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "– €";
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

const FACTOR_VALUES = [1, 2, 3, 4];

function stepFactor(current: number, dir: 1 | -1): number {
  const idx = FACTOR_VALUES.indexOf(current);
  const safeIdx = idx === -1 ? 0 : idx;
  const nextIdx = Math.min(FACTOR_VALUES.length - 1, Math.max(0, safeIdx + dir));
  return FACTOR_VALUES[nextIdx];
}

function factorLabel(factor: number): string {
  return factor === 1 ? "1 Portion" : `${factor} Portionen`;
}

function shoppingCategoryIcon(category: string) {
  const c = category.toLowerCase();
  if (c.includes("protein")) return Beef;
  if (c.includes("kohlenhydrate")) return Wheat;
  if (c.includes("obst")) return Apple;
  if (c.includes("gemüse") || c.includes("gemuese")) return Carrot;
  if (c.includes("milch")) return Milk;
  if (c.includes("shake")) return CupSoda;
  if (c.includes("sauce") || c.includes("gewürz") || c.includes("gewuerz") || c.includes("vorrat"))
    return Soup;
  return Package;
}

function countChecked(items: ShoppingItem[]): number {
  return items.reduce((sum, item) => sum + (item.checked ? 1 : 0), 0);
}

function shoppingAmountText(item: ShoppingItem): string {
  if (item.purchaseText === "Vorrat prüfen" || item.unit === "prüfen") return "Vorrat prüfen";
  if (item.packageAdjusted && item.neededText && item.purchaseText) {
    return `${item.neededText} benötigt · ${item.purchaseText} kaufen`;
  }
  return item.neededText || item.amountText || (item.amount ? `${item.amount} ${item.unit}` : "");
}

function ShoppingView({
  context,
  data,
  onCheckedChange,
  onPantryChange,
  single,
  singleRecipe,
  singleLoading,
  singleError,
  onSingleCheckedChange,
  shoppingMode,
  mealFactor,
  onShoppingModeChange,
  onMealFactorChange,
  onResetSingle,
  onSelectSegment,
  planAvailable,
  goToRecipes,
  goToPlan,
}: {
  context: "week" | "single";
  data: Record<ShoppingRange, ShoppingPayload> | null;
  onCheckedChange: (range: ShoppingRange, itemKey: string, checked: boolean) => void;
  onPantryChange: (itemKey: string, inPantry: boolean, name?: string, category?: string) => void;
  single: SingleShoppingPayload | null;
  singleRecipe: Recipe | null;
  singleLoading: boolean;
  singleError: string | null;
  onSingleCheckedChange: (recipeId: string, itemKey: string, checked: boolean) => void;
  shoppingMode: SingleShoppingMode;
  mealFactor: number;
  onShoppingModeChange: (mode: SingleShoppingMode) => void;
  onMealFactorChange: (factor: number) => void;
  onResetSingle: () => void;
  onSelectSegment: (segment: "single" | "week") => void;
  planAvailable: boolean;
  goToRecipes: () => void;
  goToPlan: () => void;
}) {
  void onResetSingle;
  return (
    <main className="shopping-page">
      <div className="shopping-segmented" role="tablist" aria-label="Einkaufsart">
        <button
          type="button"
          role="tab"
          aria-selected={context === "single"}
          className={`shopping-segment-button ${context === "single" ? "active" : ""}`}
          onClick={() => onSelectSegment("single")}
        >
          Einzelgericht
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={context === "week"}
          className={`shopping-segment-button ${context === "week" ? "active" : ""}`}
          onClick={() => onSelectSegment("week")}
        >
          Wocheneinkauf
        </button>
      </div>

      {context === "single" ? (
        <SingleShoppingBody
          recipe={singleRecipe}
          data={single}
          loading={singleLoading}
          error={singleError}
          onCheckedChange={onSingleCheckedChange}
          onPantryChange={onPantryChange}
          shoppingMode={shoppingMode}
          mealFactor={mealFactor}
          onShoppingModeChange={onShoppingModeChange}
          onMealFactorChange={onMealFactorChange}
          goToRecipes={goToRecipes}
        />
      ) : (
        <WeekShoppingBody
          data={data}
          onCheckedChange={onCheckedChange}
          onPantryChange={onPantryChange}
          planAvailable={planAvailable}
          goToPlan={goToPlan}
        />
      )}
    </main>
  );
}

function ShoppingProgress({ checked, total }: { checked: number; total: number }) {
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const ringStyle = { "--pct": pct } as React.CSSProperties;
  return (
    <div className="shopping-progress-card" aria-label={`${checked} von ${total} eingekauft`}>
      <div className="shopping-progress-ring" style={ringStyle}>
        <span>{pct}%</span>
      </div>
      <div className="shopping-progress-copy">
        <strong>
          {checked} von {total}
        </strong>
        <small>eingekauft</small>
      </div>
    </div>
  );
}

function ShoppingTitle({
  subtitle,
  checked,
  total,
}: {
  subtitle: string;
  checked: number;
  total: number;
}) {
  return (
    <section className="shopping-title-row">
      <div className="shopping-title-copy">
        <h1>Einkaufsliste</h1>
        <p>{subtitle}</p>
      </div>
      <ShoppingProgress checked={checked} total={total} />
    </section>
  );
}

function ShoppingEmptyState({
  message,
  actionLabel,
  onAction,
  icon,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  icon: "recipes" | "plan";
}) {
  return (
    <section className="shopping-empty-state">
      <span className="shopping-empty-icon">
        {icon === "plan" ? (
          <CalendarDays size={32} aria-hidden="true" />
        ) : (
          <ShoppingBasket size={32} aria-hidden="true" />
        )}
      </span>
      <p>{message}</p>
      <button type="button" className="primary" onClick={onAction}>
        {icon === "plan" ? <CalendarDays size={18} /> : <BookOpen size={18} />} {actionLabel}
      </button>
    </section>
  );
}

function ShoppingItemRow({
  item,
  onToggle,
  onPantry,
}: {
  item: ShoppingItem;
  onToggle: (itemKey: string, checked: boolean) => void;
  onPantry: (item: ShoppingItem) => void;
}) {
  const amount = shoppingAmountText(item);
  return (
    <div
      className={`shopping-item-row ${item.checked ? "is-checked" : ""} ${item.inPantry ? "is-pantry" : ""}`}
    >
      <label className="shopping-item-main">
        <input
          type="checkbox"
          checked={Boolean(item.checked)}
          onChange={(e) => onToggle(item.key, e.target.checked)}
        />
        <span className="shopping-item-text">
          <strong>{item.name}</strong>
          {amount && <small>{amount}</small>}
        </span>
      </label>
      <div className="shopping-item-side">
        <span className="shopping-item-price">{formatEuro(item.estimatedCost)}</span>
        {(item.inPantry || item.priceEstimatedFallback || item.pantryDefault) && (
          <span className="shopping-price-note">
            {item.inPantry
              ? "Zuhause"
              : item.priceEstimatedFallback
                ? "geschätzt"
                : "Vorrat"}
          </span>
        )}
        <button
          type="button"
          className={`shopping-pantry-toggle ${item.inPantry ? "active" : ""}`}
          onClick={() => onPantry(item)}
          title={
            item.inPantry
              ? "Nicht mehr als zuhause markieren"
              : "Dauerhaft als zuhause vorhanden merken"
          }
        >
          {item.inPantry ? "Zuhause ✓" : "Zuhause"}
        </button>
      </div>
    </div>
  );
}

function ShoppingCategoryCards({
  grouped,
  collapsed,
  onToggleCollapse,
  onToggleItem,
  onPantry,
}: {
  grouped: [string, ShoppingItem[]][];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (category: string) => void;
  onToggleItem: (itemKey: string, checked: boolean) => void;
  onPantry: (item: ShoppingItem) => void;
}) {
  return (
    <section className="shopping-category-cards">
      {grouped.map(([category, categoryItems]) => {
        const Icon = shoppingCategoryIcon(category);
        const checked = countChecked(categoryItems);
        const isCollapsed = Boolean(collapsed[category]);
        return (
          <article className="shopping-category-card" key={category}>
            <button
              type="button"
              className="shopping-category-head"
              aria-expanded={!isCollapsed}
              onClick={() => onToggleCollapse(category)}
            >
              <span className="shopping-category-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="shopping-category-name">{category}</span>
              <span className="shopping-category-count">
                {checked}/{categoryItems.length}
              </span>
              <ChevronDown
                className={`shopping-category-chevron ${isCollapsed ? "is-collapsed" : ""}`}
                size={20}
                aria-hidden="true"
              />
            </button>
            {!isCollapsed && (
              <div className="shopping-category-items">
                {categoryItems.map((item) => (
                  <ShoppingItemRow
                    key={item.key}
                    item={item}
                    onToggle={onToggleItem}
                    onPantry={onPantry}
                  />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ShoppingActionsBar({
  onCheckAll,
  onSupermarket,
  disabled,
}: {
  onCheckAll: () => void;
  onSupermarket: () => void;
  disabled: boolean;
}) {
  return (
    <div className="shopping-actions-bar">
      <button type="button" className="secondary" onClick={onCheckAll} disabled={disabled}>
        <CheckCheck size={18} /> Alles abhaken
      </button>
      <button type="button" className="primary" onClick={onSupermarket} disabled={disabled}>
        <Store size={18} /> Zum Supermarktmodus
      </button>
    </div>
  );
}

function SupermarketMode({
  title,
  grouped,
  onToggle,
  onBack,
}: {
  title: string;
  grouped: [string, ShoppingItem[]][];
  onToggle: (itemKey: string, checked: boolean) => void;
  onBack: () => void;
}) {
  return (
    <section className="supermarket-mode">
      <div className="supermarket-head">
        <button type="button" className="secondary" onClick={onBack}>
          <X size={18} /> Beenden
        </button>
        <strong>{title}</strong>
      </div>
      {grouped.map(([category, items]) => (
        <div className="supermarket-group" key={category}>
          <h2>{category}</h2>
          {items.map((item) => (
            <label
              key={item.key}
              className={`supermarket-row ${item.checked ? "is-checked" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(item.checked)}
                onChange={(e) => onToggle(item.key, e.target.checked)}
              />
              <span className="supermarket-name">{item.name}</span>
              <small>{shoppingAmountText(item)}</small>
            </label>
          ))}
        </div>
      ))}
    </section>
  );
}

function SingleShoppingBody({
  recipe,
  data,
  loading,
  error,
  onCheckedChange,
  onPantryChange,
  shoppingMode,
  mealFactor,
  onShoppingModeChange,
  onMealFactorChange,
  goToRecipes,
}: {
  recipe: Recipe | null;
  data: SingleShoppingPayload | null;
  loading: boolean;
  error: string | null;
  onCheckedChange: (recipeId: string, itemKey: string, checked: boolean) => void;
  onPantryChange: (itemKey: string, inPantry: boolean, name?: string, category?: string) => void;
  shoppingMode: SingleShoppingMode;
  mealFactor: number;
  onShoppingModeChange: (mode: SingleShoppingMode) => void;
  onMealFactorChange: (factor: number) => void;
  goToRecipes: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [supermarket, setSupermarket] = useState(false);
  const items = data?.items || [];
  const grouped = useMemo(() => groupShoppingItems(items), [items]);

  if (!recipe) {
    return (
      <ShoppingEmptyState
        message="Wähle ein Rezept aus, um eine Einkaufsliste zu erstellen."
        actionLabel="Rezepte öffnen"
        onAction={goToRecipes}
        icon="recipes"
      />
    );
  }

  const total = items.length;
  const checkedCount = countChecked(items);
  const toggleItem = (itemKey: string, value: boolean) => onCheckedChange(recipe.id, itemKey, value);
  const togglePantry = (item: ShoppingItem) =>
    onPantryChange(item.key, !item.inPantry, item.name, item.category);
  const label = factorLabel(mealFactor);

  if (supermarket && total > 0) {
    return (
      <SupermarketMode
        title={recipe.name}
        grouped={grouped}
        onToggle={toggleItem}
        onBack={() => setSupermarket(false)}
      />
    );
  }

  return (
    <>
      <ShoppingTitle
        subtitle="Zutatenliste für dein ausgewähltes Gericht."
        checked={checkedCount}
        total={total}
      />

      <section className="shopping-summary-card">
        <div className="shopping-summary-image">
          <img src={recipe.imageUrl} alt={recipe.name} />
        </div>
        <div className="shopping-summary-content">
          <h2>{recipe.name}</h2>
          <div className="shopping-summary-meta">
            <span>
              <img src="/assets/meal-meta-icons/clock-time.svg" alt="" aria-hidden="true" />
              {recipe.durationMinutes} Min.
            </span>
            <span>
              <Utensils size={15} aria-hidden="true" />
              {label}
            </span>
          </div>
          <div className="shopping-summary-divider" />
          <div className="shopping-summary-price">
            <strong>{formatEuro(data?.totalEstimatedCost)}</strong>
            <small>geschätzt für {label}</small>
          </div>
        </div>
      </section>

      <section className="shopping-mode-card">
        <div className="shopping-factor-row">
          <span className="shopping-factor-label">Portionen</span>
          <div className="factor-stepper">
            <button
              type="button"
              aria-label="Weniger Portionen"
              onClick={() => onMealFactorChange(stepFactor(mealFactor, -1))}
              disabled={mealFactor <= FACTOR_VALUES[0]}
            >
              <Minus size={16} />
            </button>
            <select
              className="shopping-factor-select"
              value={mealFactor}
              onChange={(e) => onMealFactorChange(Number(e.target.value))}
              aria-label="Portionen"
            >
              <option value={1}>1 Portion</option>
              <option value={2}>2 Portionen</option>
              <option value={3}>3 Portionen</option>
              <option value={4}>4 Portionen</option>
            </select>
            <button
              type="button"
              aria-label="Mehr Portionen"
              onClick={() => onMealFactorChange(stepFactor(mealFactor, 1))}
              disabled={mealFactor >= FACTOR_VALUES[FACTOR_VALUES.length - 1]}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </section>

      {loading && <div className="inline-status">Einkaufsliste wird erstellt...</div>}
      {error && <div className="inline-error">{error}</div>}

      {!loading && total === 0 && (
        <div className="recipes-empty-state">Keine Zutaten gefunden.</div>
      )}

      {total > 0 && (
        <ShoppingCategoryCards
          grouped={grouped}
          collapsed={collapsed}
          onToggleCollapse={(category) =>
            setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))
          }
          onToggleItem={toggleItem}
          onPantry={togglePantry}
        />
      )}

      {total > 0 && (
        <ShoppingActionsBar
          onCheckAll={() =>
            items.forEach((item) => {
              if (!item.checked) toggleItem(item.key, true);
            })
          }
          onSupermarket={() => setSupermarket(true)}
          disabled={loading}
        />
      )}
    </>
  );
}

function WeekShoppingBody({
  data,
  onCheckedChange,
  onPantryChange,
  planAvailable,
  goToPlan,
}: {
  data: Record<ShoppingRange, ShoppingPayload> | null;
  onCheckedChange: (range: ShoppingRange, itemKey: string, checked: boolean) => void;
  onPantryChange: (itemKey: string, inPantry: boolean, name?: string, category?: string) => void;
  planAvailable: boolean;
  goToPlan: () => void;
}) {
  const [activeRange, setActiveRange] = useState<ShoppingRange>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [supermarket, setSupermarket] = useState(false);

  const current = data ? data[activeRange] : null;
  const items = current?.items || [];
  const grouped = useMemo(() => groupShoppingItems(items), [items]);

  if (!data || !current) {
    return (
      <ShoppingEmptyState
        message={
          planAvailable
            ? "Noch kein Wocheneinkauf berechnet."
            : "Noch kein Wocheneinkauf vorhanden."
        }
        actionLabel="Wochenplan öffnen"
        onAction={goToPlan}
        icon="plan"
      />
    );
  }

  const total = items.length;
  const checkedCount = countChecked(items);
  const toggleItem = (itemKey: string, value: boolean) => onCheckedChange(activeRange, itemKey, value);
  const togglePantry = (item: ShoppingItem) =>
    onPantryChange(item.key, !item.inPantry, item.name, item.category);

  const ranges: { key: ShoppingRange; label: string }[] = [
    { key: "all", label: "Woche" },
    { key: "mon-thu", label: "Mo–Do" },
    { key: "fri-sun", label: "Fr–So" },
  ];

  if (supermarket && total > 0) {
    return (
      <SupermarketMode
        title={`Wocheneinkauf · ${current.rangeLabel}`}
        grouped={grouped}
        onToggle={toggleItem}
        onBack={() => setSupermarket(false)}
      />
    );
  }

  return (
    <>
      <ShoppingTitle
        subtitle="Zutatenliste für deinen Wochenplan."
        checked={checkedCount}
        total={total}
      />

      <section className="shopping-summary-card week">
        <div className="shopping-summary-content">
          <h2>Wocheneinkauf</h2>
          <div className="shopping-summary-meta">
            <span>
              <CalendarDays size={15} aria-hidden="true" />
              {current.rangeLabel}
            </span>
            <span>
              <Utensils size={15} aria-hidden="true" />
              ca. {current.factor.toFixed(1).replace(".", ",")} Portionen
            </span>
          </div>
          <div className="shopping-summary-divider" />
          <div className="shopping-summary-price">
            <strong>{formatEuro(current.totalEstimatedCost)}</strong>
            <small>geschätzt für {current.rangeLabel}</small>
          </div>
        </div>
      </section>

      <div className="shopping-range-tabs">
        {ranges.map((range) => (
          <button
            key={range.key}
            type="button"
            className={activeRange === range.key ? "active" : ""}
            onClick={() => setActiveRange(range.key)}
          >
            {range.label}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="recipes-empty-state">Keine Zutaten in diesem Zeitraum.</div>
      ) : (
        <ShoppingCategoryCards
          grouped={grouped}
          collapsed={collapsed}
          onToggleCollapse={(category) =>
            setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))
          }
          onToggleItem={toggleItem}
          onPantry={togglePantry}
        />
      )}

      {total > 0 && (
        <ShoppingActionsBar
          onCheckAll={() =>
            items.forEach((item) => {
              if (!item.checked) toggleItem(item.key, true);
            })
          }
          onSupermarket={() => setSupermarket(true)}
          disabled={false}
        />
      )}
    </>
  );
}

function HistoryView({
  mode,
  archive,
  recipeHistory,
  activatePlan,
  openPlans,
  openRecipes,
  openRecipeById,
  openRecipeShoppingById,
}: {
  mode: HistoryMode;
  archive: ArchiveEntry[];
  recipeHistory: SingleRecipeHistoryEntry[];
  activatePlan: (planId: string) => void;
  openPlans: () => void;
  openRecipes: () => void;
  openRecipeById: (recipeId: string) => void;
  openRecipeShoppingById: (recipeId: string) => void;
}) {
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <main className="page-wrap history-wrap">
      <section className="page-head">
        <div>
          <p className="eyebrow">Verlauf</p>
          <h1>Verlauf</h1>
          <p>Wochenpläne und Einzelgerichte für dein aktuelles Profil.</p>
        </div>
      </section>

      <div className="history-tabs" role="tablist" aria-label="Verlaufstyp">
        <button
          type="button"
          className={mode === "plans" ? "active" : ""}
          onClick={openPlans}
        >
          Wochenpläne
        </button>
        <button
          type="button"
          className={mode === "recipes" ? "active" : ""}
          onClick={openRecipes}
        >
          Einzelgerichte
        </button>
      </div>

      {mode === "plans" ? (
        <section className="history-list">
          {archive.length === 0 && <p>Noch keine Wochenpläne gespeichert.</p>}
          {archive.map((entry) => (
            <article className="history-card" key={entry.id}>
              <div className="history-card-head">
                <div>
                  <h2>Woche vom {formatDate(entry.createdAt)}</h2>
                  <p>{entry.recipeCount} Mahlzeiten</p>
                </div>
                <button
                  className="secondary"
                  disabled={entry.hasPlan === false}
                  onClick={() => activatePlan(entry.id)}
                >
                  Als aktuellen Plan öffnen
                </button>
              </div>
              <div className="history-days">
                {entry.days.map((day) => (
                  <div key={day.day}>
                    <strong>{day.day}</strong>
                    <span>{day.meals.map((meal) => meal.name).join(" · ")}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="history-list recipe-history-list">
          {recipeHistory.length === 0 && <p>Noch keine Einträge.</p>}
          {recipeHistory.map((entry) => (
            <article className="history-card recipe-history-card" key={entry.id}>
              <img src={entry.imageUrl || "/assets/category-icons/bowl.svg"} alt={entry.recipeName} />
              <div className="recipe-history-body">
                <div>
                  <p className="eyebrow">
                    {entry.action === "shopping-list" ? "Einkaufsliste" : "Angesehen"}
                  </p>
                  <h2>{entry.recipeName}</h2>
                  <p>{formatDate(entry.viewedAt)}</p>
                </div>
                <div className="recipe-history-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => openRecipeById(entry.recipeId)}
                  >
                    Rezept ansehen
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => openRecipeShoppingById(entry.recipeId)}
                  >
                    Einkauf öffnen
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function RecipeDetail({
  recipe,
  back,
  importRecipe,
}: {
  recipe: Recipe;
  back: () => void;
  importRecipe: (recipe: Recipe) => void;
}) {
  const nutrition = getRecipeNutritionPerServing(recipe);
  return (
    <main className="recipe-detail-wrap">
      <section className="recipe-hero">
        <div className="recipe-hero-image">
          <img src={recipe.imageUrl} alt={recipe.name} />
        </div>
        <div className="recipe-hero-card">
          <p className="eyebrow">Kochansicht</p>
          <h1>{recipe.name}</h1>
          <RecipeMeta
            durationMinutes={recipe.durationMinutes}
            kcal={nutrition.kcal}
            protein={nutrition.protein}
          />
          <p className="recipe-tier-note">{recipe.tier}</p>
          <div className="recipe-actions">
            <button className="secondary" onClick={back}>
              Zurück
            </button>
            {recipe.sourceUrl && (
              <a
                className="secondary link-button"
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Original öffnen
              </a>
            )}
            {recipe.sourceUrl && (
              <button className="primary" onClick={() => importRecipe(recipe)}>
                <DownloadCloud size={18} /> Bilder/Zutaten/Anleitung neu importieren
              </button>
            )}
          </div>
          {recipe.importedAt && (
            <small className="import-note">
              Zuletzt importiert:{" "}
              {new Date(recipe.importedAt).toLocaleString("de-DE")}
            </small>
          )}
        </div>
      </section>

      <section className="recipe-two-col">
        <article className="ingredients-card">
          <h2>Zutaten</h2>
          <ul>
            {(recipe.ingredients || []).slice(0, 28).map((ingredient, i) => (
              <li key={`${ingredient}-${i}`}>{ingredient}</li>
            ))}
          </ul>
        </article>
        <article className="nutrition-card">
          <h2>Nährwerte pro Portion</h2>
          <dl>
            <div>
              <dt>Kalorien</dt>
              <dd>{nutrition.kcal} kcal</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{nutrition.protein} g</dd>
            </div>
            <div>
              <dt>Dauer</dt>
              <dd>{recipe.durationMinutes} Min.</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="steps-section">
        <h2>Zubereitung</h2>
        {recipe.instructions && recipe.instructions.length > 0 ? (
          <div className="steps-list">
            {recipe.instructions.map((step, index) => (
              <article className="step-card" key={`${step.title}-${index}`}>
                {step.imageUrl ? (
                  <img src={step.imageUrl} alt="" />
                ) : (
                  <div className="step-placeholder">{index + 1}</div>
                )}
                <div className="step-text">
                  <span>{index + 1}</span>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-steps">
            <p>
              Für dieses Rezept ist noch keine lokale
              Schritt-für-Schritt-Anleitung importiert.
            </p>
            {recipe.sourceUrl && (
              <button className="primary" onClick={() => importRecipe(recipe)}>
                <DownloadCloud size={18} /> Von HelloFresh importieren
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function PrintView({ plan, back }: { plan: WeekPlan; back: () => void }) {
  const [orientation, setOrientation] = useState<PrintOrientation>("portrait");
  return (
    <main className={`print-shell print-${orientation}`}>
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 0; } }`}</style>
      <div className="print-actions">
        <button onClick={back}>Zurück</button>
        <button
          onClick={() =>
            setOrientation(
              orientation === "portrait" ? "landscape" : "portrait",
            )
          }
        >
          <Layout size={18} />{" "}
          {orientation === "portrait" ? "Querformat" : "Hochkant"}
        </button>
        <button className="primary" onClick={() => window.print()}>
          <Printer size={18} /> Jetzt drucken
        </button>
      </div>
      <section className="print-page">
        <div className="leaf left">✦</div>
        <div className="leaf right">✦</div>
        <h1>Wochenplan</h1>
        <p className="print-subtitle">
          Flexible Tagesplanung • Ziel: ca. 2300 kcal / 180 g Protein •
          zusätzlich täglich ESN-Shakes
        </p>
        <p className="print-note">Mahlzeitenwerte ohne Shakes</p>
        <div className="print-week">
          {plan.days.map((day) => (
            <div
              className={`print-row print-meal-count-${day.meals.length}`}
              key={day.day}
            >
              <div className="print-day">{day.day}</div>
              {day.meals.length === 0 ? (
                <div className="print-empty-meal">Kein Gericht geplant</div>
              ) : (
                day.meals.map((slot) => {
                  const nutrition = getRecipeNutritionPerServing(slot.recipe);
                  return (
                    <div
                      className="print-meal"
                      key={`${day.day}-${slot.mealIndex}`}
                    >
                      <img src={slot.recipe.imageUrl} alt="" />
                      <div>
                        <h2>{slot.recipe.name}</h2>
                        <p>
                          {nutrition.kcal} kcal • {nutrition.protein} g
                          Protein • {slot.recipe.durationMinutes} Min.
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="print-shake">
                <span>🥤</span>
                <strong>Shakes:</strong>
                <small>
                  {day.shakes.length ? day.shakes.join(" + ") : "keine"}
                </small>
              </div>
            </div>
          ))}
        </div>
        <footer>♡ Guten Appetit ♡</footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
