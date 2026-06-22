import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRecipesBundle,
  readRecipesSource,
  writeRecipeFiles,
} from "./recipeFileStore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const reportPath = path.join(projectRoot, "backend", "data", "recipe-nutrition-report.json");

const reviewLimits = {
  minKcalPerServing: 250,
  maxKcalPerServing: 1300,
  minProteinPerServing: 5,
  maxProteinPerServing: 90,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function roundNutrition(value) {
  return Math.round(value * 10) / 10;
}

function isPlausibleNutrition(kcal, protein) {
  return (
    isFiniteNumber(kcal) &&
    isFiniteNumber(protein) &&
    kcal >= reviewLimits.minKcalPerServing &&
    kcal <= reviewLimits.maxKcalPerServing &&
    protein >= reviewLimits.minProteinPerServing &&
    protein <= reviewLimits.maxProteinPerServing
  );
}

function inferServingsFromIngredients(recipe) {
  const text = [recipe.name, ...(recipe.ingredients || [])].join(" ").toLowerCase();
  const twoPortionHints = [
    /\b2\s+stück\b/,
    /\b250\s*g\s+(hähnchen|haehnchen|rind|schwein|steak|hack|fleisch|garnelen)/,
    /\b300\s*g\s+(bio\s+)?(rinderhack|hack|hackfleisch|fleisch)/,
    /\b200\s*g\s+(rinderhack|hack|hackfleisch|grillkäse|grillkaese|hirtenkäse|hirtenkaese)/,
    /\b360\s*g\s+(rigatoni|pasta|nudeln)/,
    /\b150\s*g\s+(reis|basmatireis|jasminreis|naturjoghurt|joghurt)/,
    /\b400\s*g\s+(gnocchi|spätzle|spaetzle|kartoffel|kartoffeln)/,
  ];
  return twoPortionHints.some((pattern) => pattern.test(text)) ? 2 : 1;
}

function normalizeRecipeNutrition(recipe) {
  const oldKcal = recipe.kcal;
  const oldProtein = recipe.protein;
  const existing = recipe.nutritionPerServing;
  const inferredIngredientServings = inferServingsFromIngredients(recipe);

  if (
    existing &&
    isFiniteNumber(existing.kcal) &&
    isFiniteNumber(existing.protein)
  ) {
    const kcal = roundNutrition(existing.kcal);
    const protein = roundNutrition(existing.protein);
    const nutritionSource = recipe.nutritionSource || "per-serving";
    const servings = recipe.servings || 1;
    const adjustedFromRecipeTotal = nutritionSource === "recipe-total" && servings > 1;
    const reportedOldKcal = adjustedFromRecipeTotal ? roundNutrition(kcal * servings) : oldKcal;
    const reportedOldProtein = adjustedFromRecipeTotal
      ? roundNutrition(protein * servings)
      : oldProtein;
    const nutritionNeedsReview = !isPlausibleNutrition(kcal, protein);
    return {
      recipe: {
        ...recipe,
        kcal,
        protein,
        servings,
        nutritionPerServing: { kcal, protein },
        nutritionSource,
        nutritionNeedsReview,
      },
      report: {
        oldKcal: reportedOldKcal,
        oldProtein: reportedOldProtein,
        newKcalPerServing: kcal,
        newProteinPerServing: protein,
        servings,
        nutritionSource,
        nutritionNeedsReview,
        adjustedFromRecipeTotal,
        reason:
          adjustedFromRecipeTotal
            ? "Bereits normalisierte recipe-total-Werte wurden idempotent übernommen; keine erneute Teilung."
            : "Bestehende nutritionPerServing-Werte wurden übernommen; keine erneute Teilung.",
        inferredIngredientServings,
      },
    };
  }

  let kcal = oldKcal;
  let protein = oldProtein;
  let servings = 1;
  let nutritionSource = "per-serving";
  let adjustedFromRecipeTotal = false;
  let reason =
    "Originalwerte liegen im plausiblen Bereich und werden als HelloFresh-typische Werte pro Portion übernommen.";

  const halfKcal = roundNutrition(oldKcal / 2);
  const halfProtein = roundNutrition(oldProtein / 2);
  const originalTooHigh =
    oldKcal > reviewLimits.maxKcalPerServing ||
    oldProtein > reviewLimits.maxProteinPerServing;

  if (originalTooHigh && isPlausibleNutrition(halfKcal, halfProtein)) {
    kcal = halfKcal;
    protein = halfProtein;
    servings = 2;
    nutritionSource = "recipe-total";
    adjustedFromRecipeTotal = true;
    reason =
      "Originalwerte wirken fuer 1 Portion zu hoch; halbierte Werte sind plausibel. Als wahrscheinlicher Gesamtwert fuer 2 Portionen normalisiert.";
  }

  kcal = roundNutrition(kcal);
  protein = roundNutrition(protein);
  const nutritionNeedsReview = !isPlausibleNutrition(kcal, protein);
  if (nutritionNeedsReview && !adjustedFromRecipeTotal) {
    nutritionSource = "unknown";
    reason =
      "Originalwerte wurden nicht automatisch veraendert, liegen aber ausserhalb der Plausibilitaetsgrenzen und brauchen Review.";
  }

  return {
    recipe: {
      ...recipe,
      kcal,
      protein,
      servings,
      nutritionPerServing: { kcal, protein },
      nutritionSource,
      nutritionNeedsReview,
    },
    report: {
      oldKcal,
      oldProtein,
      newKcalPerServing: kcal,
      newProteinPerServing: protein,
      servings,
      nutritionSource,
      nutritionNeedsReview,
      adjustedFromRecipeTotal,
      reason,
      inferredIngredientServings,
    },
  };
}

const recipes = await readRecipesSource();
const normalized = [];
const reportRecipes = [];

for (const recipe of recipes) {
  const result = normalizeRecipeNutrition(recipe);
  normalized.push(result.recipe);
  reportRecipes.push({
    id: recipe.id,
    name: recipe.name,
    ...result.report,
  });
}

const summary = {
  totalRecipes: reportRecipes.length,
  adjustedFromRecipeTotal: reportRecipes.filter((item) => item.adjustedFromRecipeTotal).length,
  perServingUnchanged: reportRecipes.filter(
    (item) => item.nutritionSource === "per-serving" && !item.adjustedFromRecipeTotal,
  ).length,
  nutritionNeedsReview: reportRecipes.filter((item) => item.nutritionNeedsReview).length,
};

const report = {
  generatedAt: new Date().toISOString(),
  reviewLimits,
  summary,
  recipes: reportRecipes,
};

await writeRecipeFiles(normalized);
const bundleResult = await buildRecipesBundle();
if (!bundleResult.ok) {
  console.error(bundleResult.errors.join("\n"));
  process.exit(1);
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(summary, null, 2));
