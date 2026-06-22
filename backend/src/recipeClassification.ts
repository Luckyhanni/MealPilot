export type RecipeCategory =
  | "schnell"
  | "high-protein"
  | "low-cal"
  | "vegetarisch"
  | "vegan";

export type DietaryType = "omnivore" | "vegetarian" | "vegan" | "needs-review";

export type RecipeClassification = {
  categories: RecipeCategory[];
  dietaryType: DietaryType;
  reasons: string[];
  matches: {
    meatOrFish: string[];
    animalProducts: string[];
    explicitVegetarian: string[];
    explicitVegan: string[];
  };
  needsReview: boolean;
};

type RecipeLike = {
  name?: string;
  kcal?: number;
  protein?: number;
  nutritionPerServing?: {
    kcal?: number;
    protein?: number;
  };
  durationMinutes?: number;
  tags?: string[];
  categories?: string[];
  ingredients?: string[];
};

export const recipeClassificationThresholds = {
  fastMaxMinutes: 30,
  highProteinMinGrams: 35,
  highProteinDensityMinGrams: 25,
  highProteinDensityMinPer100Kcal: 4.5,
  lowCalMaxKcal: 650,
} as const;

const categoryOrder: RecipeCategory[] = [
  "schnell",
  "high-protein",
  "low-cal",
  "vegetarisch",
  "vegan",
];

const categoryTagLabels: Record<RecipeCategory, string> = {
  schnell: "schnell",
  "high-protein": "high protein",
  "low-cal": "low cal",
  vegetarisch: "vegetarisch",
  vegan: "vegan",
};

const meatOrFishTerms = [
  "hähnchen",
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
  "fleischbällchen",
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
  "meeresfrüchte",
  "meeresfruechte",
];

const animalProductTerms = [
  ...meatOrFishTerms,
  "käse",
  "kaese",
  "gouda",
  "mozzarella",
  "parmesan",
  "feta",
  "hirtenkäse",
  "hirtenkaese",
  "grillkäse",
  "grillkaese",
  "hartkäse",
  "hartkaese",
  "ricotta",
  "cheddar",
  "milch",
  "milk",
  "sahne",
  "cream",
  "crème fraîche",
  "creme fraiche",
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
  "hühnerbrühe",
  "huehnerbruehe",
  "rinderbrühe",
  "rinderbruehe",
];

const vegetarianTerms = ["vegetarisch", "vegetarian", "veggie", "fleischlos"];
const veganTerms = ["vegan", "vegane", "veganer", "veganes"];

const managedCategoryTags = new Set(
  Object.values(categoryTagLabels).map((tag) => normalizeText(tag)),
);

export function normalizeText(value: unknown): string {
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

function stripParentheticalHints(value: string): string {
  return value.replace(/\([^)]*\)/g, " ");
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "de"));
}

function tokensFor(text: string): string[] {
  return normalizeText(text).match(/[a-z0-9]+/g) || [];
}

function termMatchesToken(term: string, token: string): boolean {
  if (token === term) return true;
  if (term.length <= 3) return false;
  if (token.startsWith(term)) return true;
  if (term.length >= 5 && token.includes(term)) return true;
  return false;
}

function termMatchesPhrase(term: string, text: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalizeText(text));
}

function findTerms(text: string, terms: string[]): string[] {
  const normalizedText = normalizeText(text);
  const tokens = tokensFor(normalizedText);
  return uniqueSorted(
    terms
      .map((term) => normalizeText(term))
      .filter(Boolean)
      .filter((term) => {
        if (term.includes(" ")) return termMatchesPhrase(term, normalizedText);
        return tokens.some((token) => termMatchesToken(term, token));
      }),
  );
}

function recipeTags(recipe: RecipeLike): string[] {
  return Array.isArray(recipe.tags) ? recipe.tags.filter(Boolean) : [];
}

function recipeIngredients(recipe: RecipeLike): string[] {
  return Array.isArray(recipe.ingredients)
    ? recipe.ingredients.filter(Boolean)
    : [];
}

function textForBlockers(recipe: RecipeLike): string {
  return [
    recipe.name,
    ...recipeIngredients(recipe),
    ...recipeTags(recipe),
  ].join(" ");
}

function textForExplicitDietaryHints(recipe: RecipeLike): string {
  const ingredientsWithoutParentheses = recipeIngredients(recipe).map(
    stripParentheticalHints,
  );
  return [recipe.name, ...recipeTags(recipe), ...ingredientsWithoutParentheses].join(
    " ",
  );
}

function textForAllExplicitDietaryWords(recipe: RecipeLike): string {
  return [recipe.name, ...recipeTags(recipe), ...recipeIngredients(recipe)].join(
    " ",
  );
}

function nutritionPerServing(recipe: RecipeLike) {
  return {
    kcal: Number(recipe.nutritionPerServing?.kcal ?? recipe.kcal),
    protein: Number(recipe.nutritionPerServing?.protein ?? recipe.protein),
  };
}

function orderedCategories(categories: RecipeCategory[]): RecipeCategory[] {
  const unique = [...new Set(categories)];
  return categoryOrder.filter((category) => unique.includes(category));
}

export function classifyRecipe(recipe: RecipeLike): RecipeClassification {
  const nutrition = nutritionPerServing(recipe);
  const durationMinutes = Number(recipe.durationMinutes);
  const proteinDensity =
    nutrition.kcal > 0 ? (nutrition.protein / nutrition.kcal) * 100 : 0;
  const blockerText = textForBlockers(recipe);
  const explicitHintText = textForExplicitDietaryHints(recipe);
  const allExplicitText = textForAllExplicitDietaryWords(recipe);
  const meatOrFish = findTerms(blockerText, meatOrFishTerms);
  const animalProducts = findTerms(blockerText, animalProductTerms);
  const explicitVegetarian = findTerms(allExplicitText, vegetarianTerms);
  const explicitVegan = findTerms(allExplicitText, veganTerms);
  const actionableVegetarianHints = findTerms(explicitHintText, vegetarianTerms);
  const actionableVeganHints = findTerms(explicitHintText, veganTerms);
  const categories: RecipeCategory[] = [];
  const reasons: string[] = [];
  let dietaryType: DietaryType;
  let needsReview = false;

  if (durationMinutes > 0 && durationMinutes <= recipeClassificationThresholds.fastMaxMinutes) {
    categories.push("schnell");
    reasons.push(
      `Schnell: ${durationMinutes} Minuten <= ${recipeClassificationThresholds.fastMaxMinutes}.`,
    );
  }

  if (
    nutrition.protein >= recipeClassificationThresholds.highProteinMinGrams ||
    (nutrition.protein >= recipeClassificationThresholds.highProteinDensityMinGrams &&
      proteinDensity >= recipeClassificationThresholds.highProteinDensityMinPer100Kcal)
  ) {
    categories.push("high-protein");
    reasons.push(
      `High Protein: ${nutrition.protein} g Protein, ${proteinDensity.toFixed(1)} g/100 kcal.`,
    );
  }

  if (nutrition.kcal > 0 && nutrition.kcal <= recipeClassificationThresholds.lowCalMaxKcal) {
    categories.push("low-cal");
    reasons.push(
      `Low Cal: ${nutrition.kcal} kcal <= ${recipeClassificationThresholds.lowCalMaxKcal}.`,
    );
  }

  if (meatOrFish.length > 0) {
    dietaryType = "omnivore";
    reasons.push(
      `Omnivor: Fleisch/Fisch/Meeresfruechte erkannt (${meatOrFish.join(", ")}).`,
    );
    if (explicitVegetarian.length > 0 || explicitVegan.length > 0) {
      needsReview = true;
      reasons.push(
        "Review: positive vegetarisch/vegan-Hinweise vorhanden, aber Fleisch/Fisch blockiert diese Kategorien.",
      );
    }
  } else if (animalProducts.length > 0) {
    dietaryType = "vegetarian";
    categories.push("vegetarisch");
    reasons.push(
      `Vegetarisch: keine Fleisch-/Fischbegriffe, aber tierische Produkte erkannt (${animalProducts.join(", ")}).`,
    );
    if (explicitVegan.length > 0 || actionableVeganHints.length > 0) {
      needsReview = true;
      reasons.push(
        "Review: veganer Hinweis vorhanden, aber tierische Produkte blockieren vegan.",
      );
    }
  } else {
    dietaryType = "vegan";
    categories.push("vegetarisch", "vegan");
    reasons.push(
      "Vegan: keine Fleisch-/Fischbegriffe und keine tierischen Produktbegriffe erkannt.",
    );
  }

  if (
    actionableVegetarianHints.length > 0 &&
    dietaryType !== "omnivore" &&
    !categories.includes("vegetarisch")
  ) {
    categories.push("vegetarisch");
  }
  if (
    actionableVeganHints.length > 0 &&
    animalProducts.length === 0 &&
    !categories.includes("vegan")
  ) {
    categories.push("vegan");
    if (!categories.includes("vegetarisch")) categories.push("vegetarisch");
  }

  return {
    categories: orderedCategories(categories),
    dietaryType,
    reasons,
    matches: {
      meatOrFish,
      animalProducts,
      explicitVegetarian,
      explicitVegan,
    },
    needsReview,
  };
}

export function removeManagedCategoryTags(tags: string[] = []): string[] {
  return tags.filter((tag) => !managedCategoryTags.has(normalizeText(tag)));
}

export function categoryTagsFor(categories: RecipeCategory[]): string[] {
  return categories.map((category) => categoryTagLabels[category]);
}

export function applyRecipeClassification<T extends RecipeLike>(
  recipe: T,
): T & {
  categories: RecipeCategory[];
  dietaryType: DietaryType;
  classificationReasons: string[];
  classificationNeedsReview: boolean;
  tags?: string[];
} {
  const classification = classifyRecipe(recipe);
  const unmanagedTags = removeManagedCategoryTags(recipe.tags);
  const normalizedTags = new Set(unmanagedTags.map((tag) => normalizeText(tag)));
  const categoryTags = categoryTagsFor(classification.categories).filter((tag) => {
    const normalized = normalizeText(tag);
    if (normalizedTags.has(normalized)) return false;
    normalizedTags.add(normalized);
    return true;
  });

  return {
    ...recipe,
    categories: classification.categories,
    dietaryType: classification.dietaryType,
    classificationReasons: classification.reasons,
    classificationNeedsReview: classification.needsReview,
    tags: [...unmanagedTags, ...categoryTags],
  };
}
