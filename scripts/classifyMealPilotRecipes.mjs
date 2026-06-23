import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildRecipesBundle,
  readRecipesSource,
  writeRecipeFiles,
} from "./recipeFileStore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const backendRoot = path.join(projectRoot, "backend");
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
const categoryThresholdsSourcePath = path.join(
  backendRoot,
  "src",
  "categoryThresholds.ts",
);

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadClassificationModule() {
  const require = createRequire(import.meta.url);
  const typescriptPath = require.resolve("typescript", {
    paths: [backendRoot, projectRoot],
  });
  const ts = await import(pathToFileURL(typescriptPath).href);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mealpilot-classify-"));
  const compilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2022,
  };
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf8",
  );
  const files = [
    ["categoryThresholds.ts", categoryThresholdsSourcePath],
    ["recipeClassification.ts", classificationSourcePath],
  ];
  await Promise.all(
    files.map(async ([outputName, sourcePath]) => {
      const source = await fs.readFile(sourcePath, "utf8");
      const output = ts.transpileModule(source, {
        compilerOptions,
        fileName: sourcePath,
      }).outputText;
      await fs.writeFile(
        path.join(tempDir, outputName.replace(/\.ts$/, ".js")),
        output,
        "utf8",
      );
    }),
  );
  return import(pathToFileURL(path.join(tempDir, "recipeClassification.js")).href);
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

const recipes = await readRecipesSource();
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

await writeRecipeFiles(classifiedRecipes);
const bundleResult = await buildRecipesBundle();
if (!bundleResult.ok) {
  console.error(bundleResult.errors.join("\n"));
  process.exit(1);
}
await writeJson(reportPath, report);

console.log(JSON.stringify(report.summary, null, 2));
