import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { applyRecipeClassification, type DietaryType } from "./recipeClassification.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const frontendPublicDir = path.resolve(projectRoot, "frontend", "public");
const hfImageDir = path.resolve(frontendPublicDir, "images", "hellofresh");

type Tier =
  | "Himmel auf Erden"
  | "Henkersmahlzeit"
  | "Mamas Klassiker"
  | "Mc Donalds"
  | string;

export type RecipeStep = {
  title?: string;
  text: string;
  imageUrl?: string;
};

export type Recipe = {
  id: string;
  name: string;
  tier: Tier;
  kcal: number;
  protein: number;
  servings?: number;
  nutritionPerServing?: {
    kcal: number;
    protein: number;
  };
  nutritionSource?: "per-serving" | "recipe-total" | "estimated" | "unknown";
  nutritionNeedsReview?: boolean;
  durationMinutes: number;
  imageUrl: string;
  sourceUrl?: string;
  tags: string[];
  categories?: string[];
  dietaryType?: DietaryType;
  classificationReasons?: string[];
  classificationNeedsReview?: boolean;
  ingredients: string[];
  instructions?: RecipeStep[];
  estimatedCost?: number;
  priceNote?: string;
  importedAt?: string | null;
  lastUsed?: string | null;
  needsDetailImport?: boolean;
};

const freshSpaetzleBaconId = "frische-eierspaetzle-mit-bacon";
const freshSpaetzleBaconSourceUrl =
  "https://www.hellofresh.de/recipes/one-pan-frische-eierspatzle-mit-bacon-and-doppelt-bacon-69e8809b4af8f3547a659dd8";

const freshSpaetzleBaconIngredients = [
  "200 g Bacon (Scheiben)",
  "400 g frische Eierspätzle",
  "1 Stück Porree",
  "1 Stück Knoblauchzehe",
  "25 g Tomatenpesto",
  "40 g Hartkäse ital. Art, gerieben",
  "100 g Crème fraîche, Bio",
  "4 g Hühnerbrühe",
  "1 Stück Karotte",
  "1 Stück Zwiebel",
  "nach Geschmack Salz",
  "1 Esslöffel Olivenöl",
  "nach Geschmack Pfeffer",
  "3 Esslöffel Wasser",
];

const freshSpaetzleBaconInstructions: RecipeStep[] = [
  {
    title: "Schritt 1",
    text: "Zwiebel fein würfeln. Knoblauch fein hacken. Porree längs halbieren, gründlich auswaschen und in 0,5 cm Halbmonde schneiden. Karotte nach Belieben schälen, längs halbieren und in dünne Halbmonde schneiden. Bacon in ca. 1 cm Streifen schneiden.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-1.jpg",
  },
  {
    title: "Schritt 2",
    text: "In einer großen Pfanne 1 EL [1,5 EL | 2 EL] Olivenöl* bei mittlerer Hitze erwärmen. Spätzle darin 4 – 6 Min. anbraten und gelegentlich umrühren, bis sie knusprig und leicht gebräunt sind. Spätzle anschließend aus der Pfanne nehmen, in eine große Schüssel umfüllen und beiseitestellen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-2.jpg",
  },
  {
    title: "Schritt 3",
    text: "Dieselbe große Pfanne ohne weitere Fettzugabe erneut bei mittlerer Hitze erwärmen. Baconstreifen darin 4 – 5 Min. anbraten, bis sie schön knusprig sind. Karotten, Porree und Zwiebelwürfel hinzugeben und weitere 5 – 6 Min. braten.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-3.jpg",
  },
  {
    title: "Schritt 4",
    text: "Hitze reduzieren, Knoblauch zum Bacon geben, leicht pfeffern* und ca. 1 Min. weiterköcheln lassen. Crème fraîche, Brühepulver, Tomatenpesto und 3 EL [4,5 EL | 6 EL] Wasser* zugeben und alles gut vermengen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-4.jpg",
  },
  {
    title: "Schritt 5",
    text: "Gebratene Spätzle in die Soße geben und vorsichtig unterheben. Soße 1 Min. weiterköcheln lassen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-5.jpg",
  },
  {
    title: "Schritt 6",
    text: "Spätzle auf Teller verteilen, Hartkäse darüberstreuen und genießen.",
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-step-6.jpg",
  },
];

function isFreshSpaetzleBaconRecipe(recipe: Recipe) {
  return recipe.id === freshSpaetzleBaconId;
}

export function normalizeRecipeOverrides(recipe: Recipe): Recipe {
  if (!isFreshSpaetzleBaconRecipe(recipe)) return recipe;

  const ingredientText = (recipe.ingredients || []).join(" ").toLowerCase();
  const instructionText = (recipe.instructions || [])
    .map((step) => step.text)
    .join(" ")
    .toLowerCase();
  const needsCanonicalData =
    recipe.sourceUrl !== freshSpaetzleBaconSourceUrl ||
    ingredientText.includes("100 g bacon") ||
    ingredientText.includes("tomate") ||
    ingredientText.includes("schalotte") ||
    instructionText.includes("schalotten") ||
    !ingredientText.includes("tomatenpesto") ||
    !ingredientText.includes("karotte") ||
    !ingredientText.includes("200 g bacon");

  return {
    ...recipe,
    sourceUrl: freshSpaetzleBaconSourceUrl,
    imageUrl: "/images/hellofresh/frische-eierspaetzle-mit-bacon-hero.jpg",
    ingredients: needsCanonicalData
      ? [...freshSpaetzleBaconIngredients]
      : recipe.ingredients,
    instructions: needsCanonicalData
      ? freshSpaetzleBaconInstructions.map((step) => ({ ...step }))
      : recipe.instructions,
  };
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .trim();
}

function stripTags(value: string) {
  return htmlDecode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function cleanInstructionStepText(value: string) {
  let text = htmlDecode(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopMarkers = [
    /Rezeptideen mit ähnlichen Zutaten/i,
    /Ähnliche Rezepte/i,
    /Weitere Rezepte/i,
    /Das könnte dir auch gefallen/i,
    /Bewertungen/i,
    /Nährwertangaben/i,
    /Zutaten/i,
    /Utensilien/i,
  ];

  let cutIndex = -1;
  for (const marker of stopMarkers) {
    const match = text.match(marker);
    if (match?.index !== undefined) {
      cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
    }
  }
  if (cutIndex >= 0) text = text.slice(0, cutIndex).trim();

  const appetitIndex = text.search(/Guten Appetit!?/i);
  if (appetitIndex >= 0) {
    const match = text.slice(appetitIndex).match(/Guten Appetit!?/i);
    if (match) text = text.slice(0, appetitIndex + match[0].length).trim();
  }

  return text.replace(/^\d+\s+/, "").trim();
}

function getMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return htmlDecode(match[1]);
  }
  return undefined;
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(htmlDecode(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const anyValue = value as Record<string, unknown>;
    return firstString(anyValue.url || anyValue.src || anyValue.path);
  }
  return undefined;
}

function imageFromValue(value: unknown): string | undefined {
  const raw = firstString(value);
  if (!raw) return undefined;
  return normalizeImageUrl(raw);
}

function normalizeImageUrl(raw: string) {
  let url = htmlDecode(raw)
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();

  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("/")) return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
  return url;
}

function isUsefulFoodImage(url: string, purpose: "hero" | "step" = "hero") {
  const u = url.toLowerCase();
  if (!/^https?:\/\//.test(u)) return false;
  if (/(logo|favicon|sprite|icon|facebook|twitter|instagram|pinterest|apple-touch|placeholder|transparent|blank)/.test(u))
    return false;
  if (!/(hellofresh|ctfassets|img\.hellofresh|images\.ctfassets|hfweb)/.test(u))
    return false;
  if (purpose === "hero" && /(ingredient|ingredients|allergen|utensil|step-|step_|how-to|instruction|zubereitung)/.test(u))
    return false;
  return true;
}

function findImageUrls(html: string) {
  const urls = new Set<string>();
  const regexes = [
    /https?:\\?\/\\?\/[^"'\\\s)<>]+?(?:\.(?:jpg|jpeg|png|webp)|\/image\/upload)[^"'\\\s)<>]*/gi,
    /https?:\/\/[^"'\s)<>]+?(?:\.(?:jpg|jpeg|png|webp)|\/image\/upload)[^"'\s)<>]*/gi,
    /https?:\/\/images\.ctfassets\.net\/[^"'\s)<>]+/gi,
    /https?:\/\/img\.hellofresh\.com\/[^"'\s)<>]+/gi,
  ];
  for (const re of regexes) {
    for (const m of html.matchAll(re)) {
      const normalized = normalizeImageUrl(m[0]);
      if (normalized && isUsefulFoodImage(normalized, "step")) urls.add(normalized);
    }
  }
  return [...urls];
}

function collectRecipeJsonLd(html: string) {
  const found: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  function visit(node: any) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const type = node["@type"];
    const typeText = Array.isArray(type) ? type.join(" ") : String(type || "");
    if (typeText.toLowerCase().includes("recipe")) found.push(node);
    if (node["@graph"]) visit(node["@graph"]);
    if (node.mainEntity) visit(node.mainEntity);
  }

  for (const match of html.matchAll(re)) visit(safeJsonParse(match[1]));
  return found[0];
}

function extractNextData(html: string): any | null {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  return safeJsonParse(m[1]);
}

function collectStringsDeep(node: unknown, predicate: (value: string, key?: string) => boolean, limit = 120) {
  const found: string[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown, key?: string) {
    if (found.length >= limit || value == null) return;
    if (typeof value === "string") {
      const decoded = htmlDecode(value);
      if (predicate(decoded, key)) found.push(decoded);
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, k);
  }

  visit(node);
  return [...new Set(found)];
}

function extractInstructionsFromNextData(nextData: any): RecipeStep[] {
  if (!nextData) return [];
  const texts = collectStringsDeep(
    nextData,
    (value, key) => {
      const text = stripTags(value).trim();
      return (
        text.length > 55 &&
        text.length < 1200 &&
        !/cookie|datenschutz|newsletter|rabatt|login|thermomix|tm5|tm6|allergene|zutaten|nährwert|kochbox/i.test(text) &&
        (/erhitze|schneide|verrühr|brat|koch|gib|lasse|verteile|servier|back|würz|vermisch|wasch|raspel|topf|pfanne/i.test(text) ||
          /instruction|preparation|step|text|description/i.test(String(key || "")))
      );
    },
    18,
  );

  return texts
    .map((text, index) => ({
      title: `Schritt ${index + 1}`,
      text: stripTags(text).replace(/^\d+\.?\s*/, ""),
    }))
    .filter((step, index, arr) => step.text && arr.findIndex((s) => s.text === step.text) === index)
    .slice(0, 8);
}

function extractStepImagesFromJsonLd(jsonLd: any): string[] {
  const urls: string[] = [];
  const instructions = Array.isArray(jsonLd?.recipeInstructions) ? jsonLd.recipeInstructions : [];
  for (const step of instructions) {
    const img = imageFromValue(step?.image);
    if (img && isUsefulFoodImage(img, "step")) urls.push(img);
  }
  return urls;
}

function srcSetCandidates(srcset: string) {
  const urls: string[] = [];
  const re = /(https?:\/\/\S+?)(?=\s+\d+[wx](?:,|$)|\s*$)/gi;
  for (const match of srcset.matchAll(re)) {
    const normalized = normalizeImageUrl(match[1].replace(/,$/, ""));
    if (normalized) urls.push(normalized);
  }
  return urls;
}

function looksLikeHeaderLogo(url: string) {
  return /(logo|hellofresh-logo|hf-logo|favicon|icon|brand)/i.test(url);
}

function extractBestImgFromBlock(block: string) {
  const srcMatch = block.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  const src = srcMatch?.[1] ? normalizeImageUrl(srcMatch[1]) : undefined;
  if (src && isUsefulFoodImage(src, "step") && !looksLikeHeaderLogo(src)) return src;

  const srcSetMatch = block.match(/<img[^>]+(?:srcSet|srcset)=["']([^"']+)["'][^>]*>/i);
  if (srcSetMatch?.[1]) {
    const candidates = srcSetCandidates(srcSetMatch[1]).filter((url) =>
      isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url),
    );
    return candidates[candidates.length - 1] || candidates[0];
  }
  return undefined;
}

function extractInstructionBlocksFromHtml(html: string): RecipeStep[] {
  const steps: RecipeStep[] = [];
  const stepRegex = /<div[^>]+data-test-id=["']instruction-step["'][^>]*>([\s\S]*?)(?=<div[^>]+data-test-id=["']instruction-step["']|<\/section>|<\/main>|$)/gi;
  for (const match of html.matchAll(stepRegex)) {
    const block = match[1];
    const imageUrl = extractBestImgFromBlock(block);
    const textParts = block
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img[^>]*>/gi, " ")
      .split(/<\/p>|<br\s*\/?>|<\/li>/i)
      .map(stripTags)
      .map(cleanInstructionStepText)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !/^\d+$/.test(x))
      .filter((x) => !/gemüse schneiden|reis kochen|guten appetit/i.test(x))
      .filter((x) => !/cookie|datenschutz|newsletter|thermomix|tm5|tm6/i.test(x));

    const text = cleanInstructionStepText(textParts.join("\n\n"));
    if (text.length > 20 || imageUrl) {
      steps.push({
        title: `Schritt ${steps.length + 1}`,
        text: text || `Schritt ${steps.length + 1}`,
        imageUrl,
      });
    }
    if (steps.length >= 10) break;
  }
  return steps.filter((step, index, arr) => {
    const normalized = cleanInstructionStepText(step.text).replace(/\s+/g, " ").trim();
    return normalized.length > 0 && arr.findIndex((s) => cleanInstructionStepText(s.text).replace(/\s+/g, " ").trim() === normalized) === index;
  });
}

function extractImagesFromNextData(nextData: any) {
  if (!nextData) return [];
  return collectStringsDeep(
    nextData,
    (value, key) => {
      const normalized = normalizeImageUrl(value);
      return Boolean(
        normalized &&
          isUsefulFoodImage(normalized, "step") &&
          /(image|img|url|src|path|photo|picture)/i.test(String(key || "")),
      );
    },
    80,
  )
    .map((url) => normalizeImageUrl(url)!)
    .filter(Boolean);
}

async function downloadImage(url: string, basename: string) {
  const cleanUrl = htmlDecode(url);
  if (process.env.USE_LOCAL_IMAGE_DOWNLOAD !== "true") return cleanUrl;

  await fs.mkdir(hfImageDir, { recursive: true });
  const urlWithoutQuery = cleanUrl.split("?")[0];
  let ext = "jpg";
  const extMatch = urlWithoutQuery.match(/\.(jpg|jpeg|png|webp)$/i);
  if (extMatch) ext = extMatch[1].toLowerCase().replace("jpeg", "jpg");
  const filename = `${basename}.${ext}`;
  const filePath = path.join(hfImageDir, filename);
  const response = await fetch(cleanUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MealPilot/1.0",
      "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "referer": "https://www.hellofresh.de/",
    },
  });
  if (!response.ok) throw new Error(`Bild konnte nicht geladen werden: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL ist kein Bild (${contentType || "unbekannt"}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
  return `/images/hellofresh/${filename}`;
}

function hasLocalHeroImage(recipe: Recipe) {
  return typeof recipe.imageUrl === "string" && recipe.imageUrl.startsWith("/images/hellofresh/");
}

function hasIngredients(recipe: Recipe) {
  return Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0;
}

function hasInstructions(recipe: Recipe) {
  return Array.isArray(recipe.instructions) && recipe.instructions.length > 0;
}

export function recipeHasCompleteDetails(recipe: Recipe) {
  return hasLocalHeroImage(recipe) && hasIngredients(recipe) && hasInstructions(recipe);
}

export async function enrichRecipeFromSourceUrl(recipe: Recipe): Promise<Recipe> {
  const baseRecipe = normalizeRecipeOverrides(recipe);
  if (!baseRecipe.sourceUrl) throw new Error("Dieses Rezept hat keine sourceUrl.");
  const response = await fetch(baseRecipe.sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MealPilot/1.0",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "de-DE,de;q=0.9,en;q=0.7",
    },
  });
  if (!response.ok) throw new Error(`HelloFresh-Seite konnte nicht geladen werden: HTTP ${response.status}`);

  const html = await response.text();
  const jsonLd = collectRecipeJsonLd(html);
  const nextData = extractNextData(html);
  const allImages = [
    ...extractStepImagesFromJsonLd(jsonLd),
    ...extractImagesFromNextData(nextData),
    ...findImageUrls(html),
  ].filter((url, index, arr) => url && arr.indexOf(url) === index);

  const heroCandidates = [
    imageFromValue(jsonLd?.image),
    getMeta(html, "og:image"),
    ...allImages,
  ].filter((url): url is string => Boolean(url && isUsefulFoodImage(url, "hero") && !looksLikeHeaderLogo(url)));

  const next: Recipe = { ...baseRecipe };
  const heroImage = heroCandidates[0];

  if (heroImage) {
    try {
      next.imageUrl = await downloadImage(heroImage, `${baseRecipe.id}-hero`);
    } catch (err) {
      console.warn(`Hero-Bild für ${baseRecipe.name} konnte nicht lokal gespeichert werden:`, err);
      next.imageUrl = heroImage;
    }
  }

  const htmlInstructionSteps = extractInstructionBlocksFromHtml(html);

  if (jsonLd) {
    if (Array.isArray(jsonLd.recipeIngredient) && jsonLd.recipeIngredient.length > 0) {
      next.ingredients = jsonLd.recipeIngredient
        .map((x: unknown) => stripTags(String(x)))
        .filter((x: string) => x.length > 0)
        .slice(0, 60);
    }

    const instructions = Array.isArray(jsonLd.recipeInstructions) ? jsonLd.recipeInstructions : [];
    if (instructions.length > 0) {
      next.instructions = instructions
        .map((step: any, index: number) => ({
          title: step.name ? String(step.name) : `Schritt ${index + 1}`,
          text: cleanInstructionStepText(stripTags(String(step.text || step.name || step || "")).replace(/^\d+\.?\s*/, "")),
          imageUrl: imageFromValue(step.image),
        }))
        .filter((s: RecipeStep) => s.text.length > 0 && !/thermomix|tm5|tm6/i.test(s.text));
    }
  }

  if (htmlInstructionSteps.length > 0) {
    next.instructions = htmlInstructionSteps.map((step, index) => ({
      title: step.title || `Schritt ${index + 1}`,
      text: cleanInstructionStepText(step.text),
      imageUrl: step.imageUrl,
    }));
  }

  if (!next.instructions || next.instructions.length === 0) {
    const nextInstructions = extractInstructionsFromNextData(nextData);
    if (nextInstructions.length > 0) next.instructions = nextInstructions;
  }

  if (!next.instructions || next.instructions.length === 0) {
    const prepIndex = html.search(/Zubereitung|Anleitung|recipeInstructions/i);
    const snippet = prepIndex >= 0 ? html.slice(prepIndex, prepIndex + 22000) : html;
    const roughSteps: RecipeStep[] = [];
    const parts = snippet.split(/(?:<li[^>]*>|<p[^>]*>|<div[^>]*>)/i).map(stripTags);
    for (const part of parts) {
      const text = cleanInstructionStepText(part.replace(/\s+/g, " ").trim());
      if (
        text.length > 70 &&
        text.length < 1000 &&
        !/cookie|datenschutz|newsletter|login|thermomix|tm5|tm6|allergene|kochbox|rabatt/i.test(text) &&
        /erhitze|schneide|brat|koch|gib|lasse|servier|vermisch|pfanne|topf|verteile/i.test(text)
      ) {
        roughSteps.push({ title: `Schritt ${roughSteps.length + 1}`, text });
      }
      if (roughSteps.length >= 8) break;
    }
    if (roughSteps.length > 0) next.instructions = roughSteps;
  }

  if (next.instructions && next.instructions.length > 0) {
    const candidateStepImages = allImages
      .filter((url) => url !== heroImage && isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url))
      .filter((url, index, arr) => arr.indexOf(url) === index);

    for (let i = 0; i < next.instructions.length; i += 1) {
      let url = next.instructions[i].imageUrl;
      if (!url || !isUsefulFoodImage(url, "step") || looksLikeHeaderLogo(url)) {
        url = candidateStepImages[i];
      }
      if (!url) continue;
      try {
        next.instructions[i].imageUrl = await downloadImage(url, `${baseRecipe.id}-step-${i + 1}`);
      } catch (err) {
        console.warn(`Schrittbild ${i + 1} für ${baseRecipe.name} konnte nicht gespeichert werden:`, err);
        if (isUsefulFoodImage(url, "step") && !looksLikeHeaderLogo(url)) next.instructions[i].imageUrl = url;
        else delete next.instructions[i].imageUrl;
      }
    }
  }

  next.importedAt = new Date().toISOString();
  next.needsDetailImport = !recipeHasCompleteDetails(next);
  return applyRecipeClassification(normalizeRecipeOverrides(next));
}
