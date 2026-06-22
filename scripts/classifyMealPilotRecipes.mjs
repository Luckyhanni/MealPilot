import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const backendRoot = path.join(projectRoot, "backend");
const recipesPath = path.join(backendRoot, "data", "recipes.json");
const reportPath = path.join(
  backendRoot,
  "data",
  "recipe-classification-report.json",
);
const classificationSourcePath = path.join(
  backendRoot,
  "src",
  "recipeClassification.ts",
);

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadClassificationModule() {
  const require = createRequire(import.meta.url);
  const typescriptPath = require.resolve("typescript", {
    paths: [backendRoot, projectRoot],
  });
  const ts = await import(pathToFileURL(typescriptPath).href);
  const source = await fs.readFile(classificationSourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2022,
    },
    fileName: classificationSourcePath,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function buildSummary(items) {
  const countCategory = (category) =>
    items.filter((item) => item.categories.includes(category)).length;
  const countDietaryType = (dietaryType) =>
    items.filter((item) => item.dietaryType === dietaryType).length;

  return {
    total: items.length,
    schnell: countCategory("schnell"),
    "high-protein": countCategory("high-protein"),
    "low-cal": countCategory("low-cal"),
    vegetarisch: countCategory("vegetarisch"),
    vegan: countCategory("vegan"),
    omnivore: countDietaryType("omnivore"),
    vegetarian: countDietaryType("vegetarian"),
    needsReview: items.filter((item) => item.needsReview).length,
  };
}

const {
  classifyRecipe,
  applyRecipeClassification,
  recipeClassificationThresholds,
} = await loadClassificationModule();

const recipes = await readJson(recipesPath, []);
const reportItems = recipes.map((recipe) => {
  const classification = classifyRecipe(recipe);
  return {
    id: recipe.id,
    name: recipe.name,
    kcal: recipe.nutritionPerServing?.kcal ?? recipe.kcal,
    protein: recipe.nutritionPerServing?.protein ?? recipe.protein,
    durationMinutes: recipe.durationMinutes,
    categories: classification.categories,
    dietaryType: classification.dietaryType,
    reasons: classification.reasons,
    matches: classification.matches,
    needsReview: classification.needsReview,
  };
});

const classifiedRecipes = recipes.map((recipe) => applyRecipeClassification(recipe));
const report = {
  generatedAt: new Date().toISOString(),
  thresholds: recipeClassificationThresholds,
  summary: buildSummary(reportItems),
  recipes: reportItems,
};

await writeJson(recipesPath, classifiedRecipes);
await writeJson(reportPath, report);

console.log(JSON.stringify(report.summary, null, 2));
