import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRecipesSource } from "./recipeFileStore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const backendRoot = path.join(projectRoot, "backend");
const classificationSourcePath = path.join(
  backendRoot,
  "src",
  "recipeClassification.ts",
);

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

function firstBlockingIngredient(recipe, terms, normalizeText) {
  const haystacks =
    Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
      ? recipe.ingredients
      : [recipe.name, ...(recipe.tags || [])];
  const normalizedTerms = terms.map(normalizeText).filter(Boolean);

  for (const line of haystacks) {
    const normalizedLine = normalizeText(line);
    const tokens = normalizedLine.match(/[a-z0-9]+/g) || [];
    const match = normalizedTerms.find((term) => {
      if (term.includes(" ")) return normalizedLine.includes(term);
      return tokens.some((token) => {
        if (token === term) return true;
        if (term.length <= 3) return false;
        return token.startsWith(term) || (term.length >= 5 && token.includes(term));
      });
    });
    if (match) return `${line} (${match})`;
  }

  return terms[0] || "unbekannt";
}

const { classifyRecipe, normalizeText } = await loadClassificationModule();
const recipes = await readRecipesSource();
const errors = [];

for (const recipe of recipes) {
  const categories = Array.isArray(recipe.categories) ? recipe.categories : [];
  const classification = classifyRecipe(recipe);
  const meatMatches = classification.matches.meatOrFish;
  const animalMatches = classification.matches.animalProducts;

  if (meatMatches.length > 0) {
    for (const forbidden of ["vegetarisch", "vegan"]) {
      if (categories.includes(forbidden)) {
        errors.push({
          recipe: recipe.name,
          forbiddenCategory: forbidden,
          blockingIngredient: firstBlockingIngredient(recipe, meatMatches, normalizeText),
        });
      }
    }
  }

  if (animalMatches.length > 0 && categories.includes("vegan")) {
    errors.push({
      recipe: recipe.name,
      forbiddenCategory: "vegan",
      blockingIngredient: firstBlockingIngredient(recipe, animalMatches, normalizeText),
    });
  }

  for (const required of ["prosciutto", "ribs", "rinderhack", "haehnchen"]) {
    const ingredientText = normalizeText((recipe.ingredients || []).join(" "));
    if (
      ingredientText.includes(required) &&
      (categories.includes("vegetarisch") || categories.includes("vegan"))
    ) {
      errors.push({
        recipe: recipe.name,
        forbiddenCategory: categories
          .filter((category) => category === "vegetarisch" || category === "vegan")
          .join(", "),
        blockingIngredient: firstBlockingIngredient(recipe, [required], normalizeText),
      });
    }
  }
}

if (errors.length > 0) {
  console.error("Rezept-Kategorievalidierung fehlgeschlagen:");
  for (const error of errors) {
    console.error(
      `- ${error.recipe}: verbotene Kategorie "${error.forbiddenCategory}", blockierende Zutat: ${error.blockingIngredient}`,
    );
  }
  process.exit(1);
}

console.log(`Rezept-Kategorievalidierung erfolgreich: ${recipes.length} Rezepte geprüft.`);
