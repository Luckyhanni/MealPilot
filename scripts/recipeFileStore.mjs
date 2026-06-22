import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..");
export const backendDataRoot = path.join(projectRoot, "backend", "data");
export const recipesDir = path.join(backendDataRoot, "recipes");
export const recipesBundlePath = path.join(backendDataRoot, "recipes.json");

export function sanitizeRecipeId(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function recipeFilePath(recipeId) {
  const safeId = sanitizeRecipeId(recipeId);
  if (!safeId) throw new Error("Rezept-ID fehlt.");
  return path.join(recipesDir, `${safeId}.json`);
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readRecipesBundle() {
  const recipes = await readJson(recipesBundlePath);
  if (!Array.isArray(recipes)) {
    throw new Error("backend/data/recipes.json muss ein Array enthalten.");
  }
  return recipes;
}

export async function listRecipeFiles() {
  try {
    const entries = await fs.readdir(recipesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(recipesDir, entry.name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), "de"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function recipesDirectoryExists() {
  try {
    const stat = await fs.stat(recipesDir);
    return stat.isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function readRecipeFiles() {
  const files = await listRecipeFiles();
  const recipes = [];
  const errors = [];

  for (const filePath of files) {
    try {
      const value = await readJson(filePath);
      if (!value || Array.isArray(value) || typeof value !== "object") {
        errors.push(`${filePath}: Datei muss genau ein Rezeptobjekt enthalten.`);
        continue;
      }
      if (!value.id) {
        errors.push(`${filePath}: Rezept-ID fehlt.`);
        continue;
      }
      recipes.push({ recipe: value, filePath });
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { recipes, errors };
}

export async function readRecipesSource() {
  const { recipes, errors } = await readRecipeFiles();
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  if (recipes.length > 0) return recipes.map((item) => item.recipe);
  return readRecipesBundle();
}

export async function writeRecipeFile(recipe) {
  if (!recipe?.id) throw new Error("Rezept-ID fehlt.");
  await writeJson(recipeFilePath(recipe.id), recipe);
}

export async function writeRecipeFiles(recipes) {
  for (const recipe of recipes) {
    await writeRecipeFile(recipe);
  }
}

export function findDuplicateIds(recipes) {
  const seen = new Map();
  const duplicates = new Map();
  for (const recipe of recipes) {
    const id = String(recipe.id || "");
    if (!id) continue;
    seen.set(id, (seen.get(id) || 0) + 1);
    if (seen.get(id) > 1) duplicates.set(id, seen.get(id));
  }
  return [...duplicates.entries()].map(([id, count]) => ({ id, count }));
}

export function sortRecipesStable(recipes) {
  return [...recipes].sort((a, b) => {
    const byName = String(a.name || "").localeCompare(String(b.name || ""), "de");
    if (byName !== 0) return byName;
    return String(a.id || "").localeCompare(String(b.id || ""), "de");
  });
}

export async function buildRecipesBundle() {
  const hasRecipesDirectory = await recipesDirectoryExists();
  const { recipes: fileItems, errors } = await readRecipeFiles();
  const recipes = fileItems.map((item) => item.recipe);
  const duplicateIds = findDuplicateIds(recipes);

  if (!hasRecipesDirectory && fileItems.length === 0) {
    try {
      const existingBundle = await readRecipesBundle();
      return {
        ok: true,
        filesRead: 0,
        recipesWritten: existingBundle.length,
        duplicateIds: findDuplicateIds(existingBundle),
        errors: [],
        source: "existing-bundle",
      };
    } catch (error) {
      errors.push(
        `backend/data/recipes/ fehlt und backend/data/recipes.json konnte nicht gelesen werden: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (hasRecipesDirectory && fileItems.length === 0) {
    errors.push(
      "backend/data/recipes/ existiert, enthält aber keine JSON-Rezeptdateien. Bundle wird nicht geleert.",
    );
  }

  if (duplicateIds.length > 0) {
    errors.push(
      `Doppelte Rezept-IDs: ${duplicateIds
        .map((item) => `${item.id} (${item.count}x)`)
        .join(", ")}`,
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      filesRead: fileItems.length,
      recipesWritten: 0,
      duplicateIds,
      errors,
    };
  }

  const sorted = sortRecipesStable(recipes);
  await writeJson(recipesBundlePath, sorted);

  return {
    ok: true,
    filesRead: fileItems.length,
    recipesWritten: sorted.length,
    duplicateIds,
    errors: [],
    source: "recipe-files",
  };
}
