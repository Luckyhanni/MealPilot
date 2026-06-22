import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const recipesPath = path.join(projectRoot, "backend", "data", "recipes.json");
const reportPath = path.join(projectRoot, "backend", "data", "recipe-category-report.json");
const overridesPath = path.join(
  projectRoot,
  "backend",
  "data",
  "recipe-category-overrides.json",
);

const categoryTags = {
  schnell: "schnell",
  "high-protein": "high protein",
  "low-cal": "low cal",
  vegetarisch: "vegetarisch",
  vegan: "vegan",
};

const thresholds = {
  fastMaxMinutes: 30,
  highProteinMinGrams: 35,
  highProteinDensityMinPer100Kcal: 5,
  lowCalMaxKcal: 650,
};

const meatOrFishTerms = [
  "haehnchen",
  "hahnchen",
  "chicken",
  "pute",
  "turkey",
  "rind",
  "beef",
  "steak",
  "hack",
  "hackfleisch",
  "schwein",
  "pork",
  "speck",
  "bacon",
  "wurst",
  "bratwurst",
  "salami",
  "chorizo",
  "fleisch",
  "schnitzel",
  "lachs",
  "salmon",
  "thunfisch",
  "tuna",
  "fisch",
  "seelachs",
  "garnele",
  "garnelen",
  "grossgarnelen",
  "shrimp",
  "spareribs",
  "ribs",
  "huehnerbruehe",
  "huhnerbruhe",
  "rinderbruehe",
  "rinderbruhe",
];

const animalProductTerms = [
  ...meatOrFishTerms,
  "kaese",
  "kase",
  "gouda",
  "mozzarella",
  "parmesan",
  "feta",
  "hirtenkaese",
  "hirtenkase",
  "grillkaese",
  "grillkase",
  "hartkaese",
  "hartkase",
  "ricotta",
  "cheddar",
  "milch",
  "buttermilch",
  "sahne",
  "kochsahne",
  "creme",
  "cremefraiche",
  "schmand",
  "joghurt",
  "yogurt",
  "naturjoghurt",
  "sahnejoghurt",
  "quark",
  "skyr",
  "butter",
  "ei",
  "eier",
  "eierspaetzle",
  "eierspatzle",
  "honig",
  "mayonnaise",
  "mayo",
  "huehnerbruehe",
  "huhnerbruhe",
  "rinderbruehe",
  "rinderbruhe",
  "brioche",
];

const vegetarianTerms = ["vegetarisch", "vegetarian", "veggie"];
const veganTerms = ["vegan"];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/crème/g, "creme");
}

const managedCategoryTagValues = new Set(
  Object.values(categoryTags).map((tag) => normalizeText(tag)),
);

function unmanagedTags(recipe) {
  return (recipe.tags || []).filter(
    (tag) => !managedCategoryTagValues.has(normalizeText(tag)),
  );
}

function recipeSearchText(recipe) {
  return normalizeText(
    [recipe.name, ...unmanagedTags(recipe), ...(recipe.ingredients || [])].join(" "),
  );
}

function recipeCategoryHintText(recipe) {
  return normalizeText([recipe.name, ...unmanagedTags(recipe)].join(" "));
}

function tokensFor(text) {
  return text.match(/[a-z0-9]+/g) || [];
}

function termMatchesToken(term, token) {
  if (token === term) return true;
  if (term.length >= 4 && token.startsWith(term)) return true;
  if (term.length >= 5 && token.includes(term)) return true;
  return false;
}

function findTerms(text, terms) {
  const normalizedTerms = terms.map(normalizeText);
  const tokens = tokensFor(text);
  return [...new Set(
    normalizedTerms.filter((term) =>
      tokens.some((token) => termMatchesToken(term, token)),
    ),
  )].sort((a, b) => a.localeCompare(b, "de"));
}

async function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function analyzeRecipe(recipe, overrides) {
  const text = recipeSearchText(recipe);
  const categoryHintText = recipeCategoryHintText(recipe);
  const meatOrFishMatches = findTerms(text, meatOrFishTerms);
  const animalProductMatches = findTerms(text, animalProductTerms);
  const explicitVegetarian = findTerms(text, vegetarianTerms).length > 0;
  const explicitVegan = findTerms(categoryHintText, veganTerms).length > 0;
  const containsMeatOrFish = meatOrFishMatches.length > 0;
  const containsAnimalProducts = animalProductMatches.length > 0;
  const proteinDensity =
    Number(recipe.kcal) > 0 ? (Number(recipe.protein) / Number(recipe.kcal)) * 100 : 0;

  const categories = [];
  const reasons = [];
  let needsReview = false;
  const reviewNotes = [];

  if (Number(recipe.durationMinutes) <= thresholds.fastMaxMinutes) {
    categories.push("schnell");
    reasons.push(`Schnell: ${recipe.durationMinutes} Minuten <= ${thresholds.fastMaxMinutes}.`);
  }

  if (
    Number(recipe.protein) >= thresholds.highProteinMinGrams ||
    proteinDensity >= thresholds.highProteinDensityMinPer100Kcal
  ) {
    categories.push("high-protein");
    reasons.push(
      `High Protein: ${recipe.protein} g Protein oder ${proteinDensity.toFixed(1)} g/100 kcal.`,
    );
  }

  if (Number(recipe.kcal) <= thresholds.lowCalMaxKcal) {
    categories.push("low-cal");
    reasons.push(`Low Cal: ${recipe.kcal} kcal <= ${thresholds.lowCalMaxKcal}.`);
  }

  if (!containsMeatOrFish) {
    categories.push("vegetarisch");
    reasons.push("Vegetarisch: keine Fleisch-, Fisch- oder Meeresfruechte-Begriffe erkannt.");
  } else if (explicitVegetarian) {
    needsReview = true;
    reviewNotes.push(
      "Enthaelt vegetarischen Hinweis, aber auch Fleisch/Fisch. Der vegetarische Hinweis wurde nicht als Rezeptkategorie gewertet.",
    );
  }

  if (!containsAnimalProducts) {
    categories.push("vegan");
    if (!categories.includes("vegetarisch")) categories.push("vegetarisch");
    reasons.push("Vegan: keine Fleisch-/Fisch- und keine tierischen Produktbegriffe erkannt.");
  } else if (explicitVegan) {
    needsReview = true;
    reviewNotes.push(
      "Enthaelt veganen Hinweis, aber auch erkannte tierische Produktbegriffe.",
    );
  }

  const override = overrides?.[recipe.id];
  if (override) {
    if (Array.isArray(override.categories)) {
      categories.splice(0, categories.length, ...override.categories);
      reasons.push("Manuelle Override-Kategorien aus recipe-category-overrides.json angewendet.");
    }
    if (override.needsReview !== undefined) needsReview = Boolean(override.needsReview);
    if (override.note) reviewNotes.push(String(override.note));
  }

  const uniqueCategories = [...new Set(categories)].sort(
    (a, b) =>
      ["schnell", "high-protein", "low-cal", "vegetarisch", "vegan"].indexOf(a) -
      ["schnell", "high-protein", "low-cal", "vegetarisch", "vegan"].indexOf(b),
  );

  return {
    categories: uniqueCategories,
    reasons,
    hints: {
      containsMeatOrFish,
      containsAnimalProducts,
      explicitVegetarian,
      explicitVegan,
      meatOrFishMatches,
      animalProductMatches,
      proteinDensity: Number(proteinDensity.toFixed(2)),
    },
    needsReview,
    reviewNotes,
  };
}

function addCategoryTags(recipe, categories) {
  const tags = unmanagedTags(recipe);
  const normalizedTags = new Set(tags.map((tag) => normalizeText(tag)));
  for (const category of categories) {
    const tag = categoryTags[category];
    if (tag && !normalizedTags.has(normalizeText(tag))) tags.push(tag);
  }
  return tags;
}

function buildSummary(items) {
  const count = (category) =>
    items.filter((item) => item.categories.includes(category)).length;
  return {
    totalRecipes: items.length,
    schnell: count("schnell"),
    highProtein: count("high-protein"),
    lowCal: count("low-cal"),
    vegetarisch: count("vegetarisch"),
    vegan: count("vegan"),
    withoutCategoryExceptAll: items.filter((item) => item.categories.length === 0).length,
    needsReview: items.filter((item) => item.needsReview).length,
  };
}

const recipes = await readJsonIfExists(recipesPath, []);
const overrides = await readJsonIfExists(overridesPath, {});
const reportItems = [];

const categorizedRecipes = recipes.map((recipe) => {
  const analysis = analyzeRecipe(recipe, overrides);
  reportItems.push({
    id: recipe.id,
    name: recipe.name,
    kcal: recipe.kcal,
    protein: recipe.protein,
    durationMinutes: recipe.durationMinutes,
    categories: analysis.categories,
    reasons: analysis.reasons,
    hints: analysis.hints,
    needsReview: analysis.needsReview,
    reviewNotes: analysis.reviewNotes,
  });

  return {
    ...recipe,
    categories: analysis.categories,
    tags: addCategoryTags(recipe, analysis.categories),
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  thresholds,
  summary: buildSummary(reportItems),
  recipes: reportItems,
};

await fs.writeFile(recipesPath, `${JSON.stringify(categorizedRecipes, null, 2)}\n`, "utf8");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report.summary, null, 2));
