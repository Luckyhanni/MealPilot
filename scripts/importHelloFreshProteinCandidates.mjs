import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const candidatesPath = path.join(
  projectRoot,
  "backend",
  "data",
  "hellofresh-protein-import-candidates.json",
);
const recipesPath = path.join(projectRoot, "backend", "data", "recipes.json");

const categoryTagLabels = new Set([
  "schnell",
  "high protein",
  "high-protein",
  "low cal",
  "low-cal",
  "vegetarisch",
  "vegan",
]);

function normalizeText(value) {
  return String(value || "")
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

function normalizeSourceUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null);
  if (value == null || value === "") return [];
  return [value];
}

function asStringArray(value) {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item?.name === "string") return item.name.trim();
      if (typeof item?.text === "string") return item.text.trim();
      return "";
    })
    .filter(Boolean);
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!normalized) return undefined;
  const parsed = Number(normalized[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDurationMinutes(candidate) {
  return (
    parseNumber(candidate.durationMinutes) ??
    parseNumber(candidate.totalTimeMinutes) ??
    parseNumber(candidate.timeMinutes) ??
    parseNumber(candidate.prepTimeMinutes) ??
    parseNumber(candidate.duration) ??
    0
  );
}

function normalizeInstructions(value) {
  return asArray(value)
    .map((step, index) => {
      if (typeof step === "string") {
        const text = step.trim();
        return text ? { title: `Schritt ${index + 1}`, text } : null;
      }
      if (step && typeof step === "object") {
        const text = String(step.text || step.description || step.instruction || "").trim();
        if (!text) return null;
        return {
          title: String(step.title || `Schritt ${index + 1}`),
          text,
          ...(step.imageUrl ? { imageUrl: step.imageUrl } : {}),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeTags(candidate) {
  return [
    ...asStringArray(candidate.tags),
    ...asStringArray(candidate.labels),
    ...asStringArray(candidate.badges),
  ].filter((tag, index, tags) => {
    const normalized = normalizeText(tag).replace(/\s+/g, " ");
    if (!normalized || categoryTagLabels.has(normalized)) return false;
    return tags.findIndex((other) => normalizeText(other) === normalized) === index;
  });
}

function candidateList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.recipes)) return data.recipes;
  return [];
}

function normalizeCandidate(candidate, sourceCollection) {
  const name = String(candidate.name || candidate.title || candidate.recipeName || "").trim();
  const sourceUrl = String(candidate.sourceUrl || candidate.url || candidate.recipeUrl || "").trim();
  const id = String(candidate.id || slugify(name || sourceUrl)).trim();
  const kcal =
    parseNumber(candidate.nutritionPerServing?.kcal) ??
    parseNumber(candidate.nutrition?.kcal) ??
    parseNumber(candidate.kcal) ??
    parseNumber(candidate.calories) ??
    0;
  const protein =
    parseNumber(candidate.nutritionPerServing?.protein) ??
    parseNumber(candidate.nutrition?.protein) ??
    parseNumber(candidate.protein) ??
    0;
  const ingredients = asStringArray(candidate.ingredients || candidate.ingredientLines);
  const instructions = normalizeInstructions(candidate.instructions || candidate.steps);
  const imageUrl = String(
    candidate.imageUrl || candidate.image || candidate.thumbnailUrl || "",
  ).trim();
  const needsDetailImport =
    Boolean(candidate.needsDetailImport) ||
    ingredients.length === 0 ||
    instructions.length === 0 ||
    !imageUrl;
  const needsNutritionImport =
    Boolean(candidate.needsNutritionImport) || protein <= 0 || kcal <= 0;

  return {
    id,
    name,
    tier: "High Protein",
    kcal,
    protein,
    durationMinutes: parseDurationMinutes(candidate),
    imageUrl,
    sourceUrl,
    tags: normalizeTags(candidate),
    ingredients,
    instructions,
    categories: [],
    sourceProvider: String(candidate.sourceProvider || "HelloFresh"),
    sourceCollection: String(candidate.sourceCollection || sourceCollection || "proteinreiche-rezepte"),
    needsDetailImport,
    needsNutritionImport,
    servings: parseNumber(candidate.servings) ?? 2,
    nutritionPerServing: { kcal, protein },
    nutritionSource: protein > 0 || kcal > 0 ? "per-serving" : "unknown",
  };
}

function hasUsefulValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value != null && value !== "";
}

function mergeExistingRecipe(existing, incoming) {
  const merged = { ...existing };
  let changed = false;

  for (const key of [
    "sourceProvider",
    "sourceCollection",
    "sourceUrl",
    "imageUrl",
    "ingredients",
    "instructions",
  ]) {
    if (!hasUsefulValue(merged[key]) && hasUsefulValue(incoming[key])) {
      merged[key] = incoming[key];
      changed = true;
    }
  }

  const needsDetailImport =
    Boolean(merged.needsDetailImport) ||
    !Array.isArray(merged.ingredients) ||
    merged.ingredients.length === 0 ||
    !Array.isArray(merged.instructions) ||
    merged.instructions.length === 0 ||
    !merged.imageUrl;
  if (merged.needsDetailImport !== needsDetailImport) {
    merged.needsDetailImport = needsDetailImport;
    changed = true;
  }

  const protein = parseNumber(merged.nutritionPerServing?.protein) ?? parseNumber(merged.protein) ?? 0;
  const kcal = parseNumber(merged.nutritionPerServing?.kcal) ?? parseNumber(merged.kcal) ?? 0;
  const needsNutritionImport = Boolean(merged.needsNutritionImport) || protein <= 0 || kcal <= 0;
  if (merged.needsNutritionImport !== needsNutritionImport) {
    merged.needsNutritionImport = needsNutritionImport;
    changed = true;
  }

  return { recipe: merged, changed };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runOptionalScript(relativePath) {
  const scriptPath = path.join(projectRoot, relativePath);
  return fs
    .access(scriptPath)
    .then(() => {
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: projectRoot,
        stdio: "inherit",
      });
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
      return true;
    })
    .catch((error) => {
      if (error?.code === "ENOENT") return false;
      throw error;
    });
}

const candidateData = await readJson(candidatesPath);
const recipes = await readJson(recipesPath);
const candidates = candidateList(candidateData);
const sourceCollection =
  candidateData?.sourceCollection || candidateData?.collection || "proteinreiche-rezepte";

const idToIndex = new Map();
const sourceUrlToIndex = new Map();

recipes.forEach((recipe, index) => {
  if (recipe.id) idToIndex.set(String(recipe.id), index);
  const normalizedUrl = normalizeSourceUrl(recipe.sourceUrl);
  if (normalizedUrl) sourceUrlToIndex.set(normalizedUrl, index);
});

const summary = {
  candidates: candidates.length,
  imported: 0,
  skippedDuplicates: 0,
  updated: 0,
  skippedInvalid: 0,
  missingProtein: 0,
};

for (const candidate of candidates) {
  const incoming = normalizeCandidate(candidate, sourceCollection);

  if (!incoming.id || !incoming.name) {
    summary.skippedInvalid += 1;
    continue;
  }

  if (incoming.needsNutritionImport) summary.missingProtein += 1;

  const sourceIndex = sourceUrlToIndex.get(normalizeSourceUrl(incoming.sourceUrl));
  const idIndex = idToIndex.get(incoming.id);
  const existingIndex = sourceIndex ?? idIndex;

  if (existingIndex != null) {
    summary.skippedDuplicates += 1;

    if (sourceIndex != null) {
      const { recipe, changed } = mergeExistingRecipe(recipes[existingIndex], incoming);
      if (changed) {
        recipes[existingIndex] = recipe;
        summary.updated += 1;
      }
    }

    continue;
  }

  recipes.push(incoming);
  idToIndex.set(incoming.id, recipes.length - 1);
  const normalizedUrl = normalizeSourceUrl(incoming.sourceUrl);
  if (normalizedUrl) sourceUrlToIndex.set(normalizedUrl, recipes.length - 1);
  summary.imported += 1;
}

await writeJson(recipesPath, recipes);

console.log(JSON.stringify(summary, null, 2));
console.log("Running recipe classification...");
await runOptionalScript("scripts/classifyMealPilotRecipes.mjs");
console.log("Running recipe category validation...");
await runOptionalScript("scripts/validateRecipeCategories.mjs");
