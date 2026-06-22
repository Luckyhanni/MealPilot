import {
  findDuplicateIds,
  readRecipesBundle,
  sanitizeRecipeId,
  writeRecipeFile,
} from "./recipeFileStore.mjs";

const recipes = await readRecipesBundle();
const duplicateIds = findDuplicateIds(recipes);
const missingIds = recipes
  .map((recipe, index) => ({ index, name: recipe?.name || null }))
  .filter((item) => !recipes[item.index]?.id);
const unsafeIds = [];
let split = 0;

for (const recipe of recipes) {
  if (!recipe?.id) continue;
  const safeId = sanitizeRecipeId(recipe.id);
  if (safeId !== recipe.id) unsafeIds.push({ id: recipe.id, fileName: `${safeId}.json` });
  await writeRecipeFile(recipe);
  split += 1;
}

const summary = {
  split,
  duplicateIds,
  missingIds,
  unsafeIds,
};

console.log(JSON.stringify(summary, null, 2));

if (duplicateIds.length > 0 || missingIds.length > 0) {
  process.exit(1);
}
