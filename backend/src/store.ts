import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "..", "data");
const defaultUserId = "johannes-sophie";
const historyTimeZone = "Europe/Berlin";

const storeKeys: Record<string, string> = {
  "recipes.json": "recipes",
  "history.json": "history",
  "settings.json": "settings",
  "users.json": "users",
  "recipeHistory.json": "recipeHistory",
  "pantry.json": "pantry",
  "shoppingState.json": "shoppingState",
};

let supabaseClient: SupabaseClient | null = null;

export function isSupabaseEnabled(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function storeKeyForFile(file: string): string {
  const key = storeKeys[file];
  if (!key) {
    throw new Error(`Kein Store-Key-Mapping für ${file} konfiguriert.`);
  }
  return key;
}

function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseEnabled()) {
    throw new Error("Supabase ENV ist nicht gesetzt.");
  }
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return supabaseClient;
}

function normalizeHistoryUserId(value: unknown): string {
  const normalized = String(value || defaultUserId).trim();
  return normalized || defaultUserId;
}

function recipeHistoryDayKey(value: unknown): string {
  const date = new Date(String(value || new Date().toISOString()));
  if (Number.isNaN(date.getTime())) return "unknown-date";

  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: historyTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function safeHistoryTime(value: unknown): number {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function dedupeRecipeHistory(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  const newestByKey = new Map<string, unknown>();
  const passthrough: unknown[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      passthrough.push(entry);
      continue;
    }

    const item = entry as {
      userId?: unknown;
      recipeId?: unknown;
      viewedAt?: unknown;
    };
    const recipeId = String(item.recipeId || "").trim();
    if (!recipeId) {
      passthrough.push(entry);
      continue;
    }

    // Keep only one visible entry per user, recipe and local day.
    // If the same recipe is opened several times on the same day, the latest entry wins.
    const key = `${normalizeHistoryUserId(item.userId)}:${recipeId}:${recipeHistoryDayKey(item.viewedAt)}`;
    const current = newestByKey.get(key) as { viewedAt?: unknown } | undefined;
    if (!current || safeHistoryTime(item.viewedAt) >= safeHistoryTime(current.viewedAt)) {
      newestByKey.set(key, entry);
    }
  }

  const deduped = [...newestByKey.values()].sort((a, b) => {
    const diff =
      safeHistoryTime((b as { viewedAt?: unknown }).viewedAt) -
      safeHistoryTime((a as { viewedAt?: unknown }).viewedAt);
    return Number.isFinite(diff) ? diff : 0;
  });

  return [...deduped, ...passthrough];
}

function normalizeStoreValue(file: string, value: unknown): unknown {
  if (file === "recipeHistory.json") return dedupeRecipeHistory(value);
  return value;
}

async function readLocalStore<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(dataDir, file), "utf-8");
    return normalizeStoreValue(file, JSON.parse(raw)) as T;
  } catch (error) {
    console.warn(
      `Lokaler Store ${file} konnte nicht gelesen werden, nutze Fallback:`,
      error,
    );
    return fallback;
  }
}

async function writeLocalStore(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, file),
    JSON.stringify(normalizeStoreValue(file, value), null, 2),
    "utf-8",
  );
}

export async function readStore<T>(file: string, fallback: T): Promise<T> {
  // The recipe catalog is versioned with the app and built from
  // backend/data/recipes/*.json during deployment. Do not read recipes from
  // Supabase here, otherwise production can silently serve an old catalog.
  if (file === "recipes.json") {
    return readLocalStore<T>(file, fallback);
  }

  if (!isSupabaseEnabled()) {
    return readLocalStore<T>(file, fallback);
  }

  const key = storeKeyForFile(file);
  try {
    const { data, error } = await getSupabaseClient()
      .from("mealpilot_data")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`Supabase Store ${key} konnte nicht gelesen werden:`, error);
      return fallback;
    }
    if (!data) return fallback;
    return normalizeStoreValue(file, data.value) as T;
  } catch (error) {
    console.error(`Supabase Store ${key} konnte nicht gelesen werden:`, error);
    return fallback;
  }
}

export async function writeStore(file: string, value: unknown): Promise<void> {
  const normalizedValue = normalizeStoreValue(file, value);

  // Keep the deployed recipe catalog file-based. User/runtime data can still
  // use Supabase; recipes are rebuilt from committed recipe JSON files.
  if (file === "recipes.json") {
    await writeLocalStore(file, normalizedValue);
    return;
  }

  if (!isSupabaseEnabled()) {
    await writeLocalStore(file, normalizedValue);
    return;
  }

  const key = storeKeyForFile(file);
  const { error } = await getSupabaseClient()
    .from("mealpilot_data")
    .upsert(
      {
        key,
        value: normalizedValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

  if (error) {
    console.error(`Supabase Store ${key} konnte nicht geschrieben werden:`, error);
    throw new Error(`Supabase-Schreibfehler für ${key}: ${error.message}`);
  }
}
