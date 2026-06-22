import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  enrichRecipeFromSourceUrl,
  type Recipe,
  type RecipeStep,
} from "../src/hellofreshImporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const recipesDir = path.join(projectRoot, "backend", "data", "recipes");
const frontendPublicDir = path.join(projectRoot, "frontend", "public");
const delayMs = Number(process.env.MEALPILOT_RECIPE_ENRICH_DELAY_MS || 250);
const force = process.env.MEALPILOT_REIMPORT_ALL_RECIPES === "true";

process.env.USE_LOCAL_IMAGE_DOWNLOAD = "true";

type RecipeFile = {
  filePath: string;
  recipe: Recipe;
};

function isExternalHelloFreshImage(value: unknown) {
  return typeof value === "string" && /^https:\/\/img\.hellofresh\.com/i.test(value);
}

function isLocalHelloFreshImage(value: unknown) {
  return typeof value === "string" && value.startsWith("/images/hellofresh/");
}

async function localPublicFileExists(publicUrl: unknown) {
  if (typeof publicUrl !== "string" || !publicUrl.startsWith("/")) return false;
  const relativePath = publicUrl.replace(/^\/+/, "").split(/[?#]/)[0];
  const filePath = path.join(frontendPublicDir, relativePath);
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw error;
  }
}

function instructions(recipe: Recipe): RecipeStep[] {
  return Array.isArray(recipe.instructions) ? recipe.instructions : [];
}

function ingredients(recipe: Recipe): string[] {
  return Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
}

async function stepImagesAreMostlyMissing(recipe: Recipe) {
  const steps = instructions(recipe);
  if (steps.length < 2) return steps.length === 0;
  let withImages = 0;
  for (const step of steps) {
    if (!step.imageUrl) continue;
    if (isLocalHelloFreshImage(step.imageUrl)) {
      if (await localPublicFileExists(step.imageUrl)) withImages += 1;
    } else {
      withImages += 1;
    }
  }
  return withImages <= 1 || withImages / steps.length < 0.35;
}

async function needsEnrichment(recipe: Recipe) {
  if (!recipe.sourceUrl) return false;
  if (force) return true;
  const localHeroIsMissing =
    isLocalHelloFreshImage(recipe.imageUrl) &&
    !(await localPublicFileExists(recipe.imageUrl));
  return (
    recipe.needsDetailImport === true ||
    !recipe.imageUrl ||
    isExternalHelloFreshImage(recipe.imageUrl) ||
    localHeroIsMissing ||
    instructions(recipe).length === 0 ||
    (await stepImagesAreMostlyMissing(recipe)) ||
    ingredients(recipe).length === 0 ||
    !recipe.importedAt
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRecipeFiles(): Promise<RecipeFile[]> {
  let entries;
  try {
    entries = await fs.readdir(recipesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(recipesDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), "de"));
  const recipes: RecipeFile[] = [];

  for (const filePath of files) {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error(`${filePath}: Datei muss genau ein Rezeptobjekt enthalten.`);
    }
    if (!value.id) throw new Error(`${filePath}: Rezept-ID fehlt.`);
    recipes.push({ filePath, recipe: value as Recipe });
  }

  return recipes;
}

async function writeRecipeFile(filePath: string, recipe: Recipe) {
  await fs.writeFile(filePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
}

function summarizeImprovement(before: Recipe, after: Recipe) {
  return {
    imageUrlChanged: before.imageUrl !== after.imageUrl,
    hasLocalImage: isLocalHelloFreshImage(after.imageUrl),
    ingredients: ingredients(after).length,
    instructions: instructions(after).length,
    stepImages: instructions(after).filter((step) => Boolean(step.imageUrl)).length,
  };
}

const files = await readRecipeFiles();
const report = {
  checked: files.length,
  enriched: 0,
  skipped: 0,
  failed: 0,
  failures: [] as { id: string; name: string; reason: string }[],
  examples: [] as { id: string; name: string; improvement: ReturnType<typeof summarizeImprovement> }[],
};

for (const { filePath, recipe } of files) {
  if (!(await needsEnrichment(recipe))) {
    report.skipped += 1;
    continue;
  }

  try {
    const enriched = await enrichRecipeFromSourceUrl(recipe);
    await writeRecipeFile(filePath, enriched);
    report.enriched += 1;
    if (report.examples.length < 3) {
      report.examples.push({
        id: enriched.id,
        name: enriched.name,
        improvement: summarizeImprovement(recipe, enriched),
      });
    }
  } catch (error) {
    report.failed += 1;
    report.failures.push({
      id: recipe.id,
      name: recipe.name,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  if (delayMs > 0) await sleep(delayMs);
}

console.log(JSON.stringify(report, null, 2));
