import fs from "fs";
import path from "path";
import {
  findIngredientPrice,
  normalizeIngredientName,
  resolveIngredientPrice,
} from "../src/ingredientPrices.ts";

type Recipe = {
  name: string;
  ingredients?: string[];
};

type ParsedIngredient = {
  amount: number;
  unit: string;
  name: string;
};

const FLEISCH_REGEX =
  /(hähnchen|haehnchen|chicken|rind|steak|hack|hackfleisch|bacon|schwein|schnitzel|bratwurst|köfte|koefte|pulled chicken)/i;

function cleanIngredientName(raw: string) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bBio\b/gi, "")
    .replace(/\bmulticolor\b/gi, "")
    .replace(/\bPetersilie\s+glatt\/Schnittlauch\b/gi, "Petersilie/Schnittlauch")
    .replace(/\bglatt\/Schnittlauch\b/gi, "Schnittlauch")
    .replace(/[„“”"'*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*$/g, "")
    .trim();
}

function parseIngredientAmount(line: string): ParsedIngredient | null {
  const original = String(line || "").replace(/\s+/g, " ").trim();
  if (!original) return null;
  if (/kann spuren|allergene|nicht in deiner lieferung|utensilien/i.test(original))
    return null;
  if (/^(?:\d+(?:[,.]\d+)?|½|¼|¾|⅓|⅔)?\s*(?:ml|l|el|esslöffel|tl|teelöffel)?\s*wass?er$/i.test(original))
    return null;

  const pantryMatch = original.match(/^(nach Geschmack|etwas|ein wenig)\s+(.+)$/i);
  if (pantryMatch) {
    return { amount: 1, unit: "prüfen", name: cleanIngredientName(pantryMatch[2]) };
  }

  const match = original.match(/^(\d+(?:[,.]\d+)?|½|¼|¾|⅓|⅔)\s*(g|kg|ml|l|stück|stk\.?|el|esslöffel|tl|teelöffel|becher|dose|dosen|packung|packungen|bund|zehe|zehen|scheibe|scheiben)?\s+(.+)$/i);
  if (!match) return { amount: 1, unit: "prüfen", name: cleanIngredientName(original) };

  const possibleName = cleanIngredientName(match[3] || "");
  if (/wasser/i.test(possibleName)) return null;

  const rawAmount = match[1]
    .replace("½", "0.5")
    .replace("¼", "0.25")
    .replace("¾", "0.75")
    .replace("⅓", "0.333")
    .replace("⅔", "0.667")
    .replace(",", ".");
  let amount = Number(rawAmount);
  let unit = (match[2] || "Stück").toLowerCase();

  if (Number.isNaN(amount)) amount = 1;
  if (unit === "kg") {
    amount *= 1000;
    unit = "g";
  }
  if (unit === "l") {
    amount *= 1000;
    unit = "ml";
  }
  if (unit === "stk." || unit === "stück") unit = "Stück";
  if (unit === "esslöffel") unit = "EL";
  if (unit === "teelöffel") unit = "TL";
  if (unit === "dose" || unit === "dosen") unit = "Dose";
  if (unit === "packung" || unit === "packungen") unit = "Packung";

  return { amount, unit, name: possibleName };
}

function categoryForItem(name: string) {
  const n = name.toLowerCase();
  if (FLEISCH_REGEX.test(n) || /(garnelen|fisch|seelachs|lachs|ribs|spareribs|\bei\b|eier)/.test(n))
    return "Protein";
  if (/(reis|kartoffel|brötchen|broetchen|brot|spätzle|spaetzle|gnocchi|pasta|nudel|rigatoni|conchiglie|tortellini|wrap|tortilla|bulgur|couscous|pommes|fettuccine)/.test(n))
    return "Kohlenhydrate";
  if (/(gewürz|gewuerz|hello |brühe|bruehe|sauce|soße|sosse|saucen|pesto|curry|senf|soja|hoisin|gochujang|teriyaki|sesam|honig|öl|oel|essig|\bsalz\b|pfeffer|tomatenmark|miso|ketchup|mayonnaise|aioli|dressing)/.test(n))
    return "Saucen, Gewürze & Vorrat";
  if (/(salat|gurke|tomate|avocado|kohlrabi|paprika|brokkoli|pak choi|gemüse|gemuese|mais|kidneybohnen|bohnen|linsen|karotte|porree|zwiebel|frühlingszwiebel|fruehlingszwiebel|knoblauch|birne|zitrone|limette|blumenkohl|wirsing|kraut|sultaninen|aprikose|erdnuss|sonnenblumenkerne|spinat|rucola|champignon|kräuter|kraeuter|petersilie|schnittlauch|basilikum|dill|minze|thymian|salbei)/.test(n))
    return "Gemüse & Obst";
  if (/(milch|käse|kaese|mozzarella|parmesan|joghurt|sahne|crème fraîche|creme fraiche|ricotta|hirtenkäse|hirtenkaese|grillkäse|grillkaese|butter)/.test(n))
    return "Milchprodukte";
  if (/(paniermehl|semmelbrösel|semmelbroesel|ingwerpaste|mehl|zucker)/.test(n))
    return "Saucen, Gewürze & Vorrat";
  if (/(esn|proteinpulver|shake)/.test(n)) return "Shakes";
  return "Sonstiges";
}

const recipesPath = path.resolve(process.cwd(), "data", "recipes.json");
const recipes = JSON.parse(fs.readFileSync(recipesPath, "utf8")) as Recipe[];
const originals = [...new Set(recipes.flatMap((recipe) => recipe.ingredients || []))]
  .map(String)
  .sort((a, b) => a.localeCompare(b, "de"));

const rows = originals
  .map((original) => {
    const parsed = parseIngredientAmount(original);
    if (!parsed) return null;
    const category = categoryForItem(parsed.name);
    const entry = findIngredientPrice(parsed.name);
    const price = resolveIngredientPrice({
      name: parsed.name,
      amount: parsed.amount,
      unit: parsed.unit,
      category,
    });
    return {
      original,
      normalized: normalizeIngredientName(parsed.name),
      category,
      entry: entry?.key || "",
      amount: `${parsed.amount} ${parsed.unit}`,
      priceable: price.estimatedCost >= 0,
      fallback: price.fallback,
      note: price.note || price.priceType,
    };
  })
  .filter((row): row is NonNullable<typeof row> => Boolean(row));

const direct = rows.filter((row) => row.entry).length;
const fallback = rows.filter((row) => row.fallback).length;

console.log("Original\tNormalisiert\tKategorie\tPreiseintrag\tMenge erkannt\tBerechenbar\tFallback\tHinweis");
for (const row of rows) {
  console.log(
    [
      row.original,
      row.normalized,
      row.category,
      row.entry || "-",
      row.amount,
      row.priceable ? "ja" : "nein",
      row.fallback ? "ja" : "nein",
      row.note,
    ].join("\t"),
  );
}

console.log("");
console.log(`Rezepte: ${recipes.length}`);
console.log(`Einzigartige Zutatenzeilen: ${originals.length}`);
console.log(`Auswertbare Zutatenzeilen: ${rows.length}`);
console.log(`Direkter Preiseintrag: ${direct}`);
console.log(`Fallback genutzt: ${fallback}`);
