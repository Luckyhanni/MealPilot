import { buildRecipesBundle } from "./recipeFileStore.mjs";

const result = await buildRecipesBundle();
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exit(1);
}
