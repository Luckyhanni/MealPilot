// Zentrale, realistische Preis-Datenbank für Zutaten.
//
// Idee:
// - Jede Zutat wird über `match` (Regex auf dem normalisierten Namen) erkannt.
// - `packageSize` / `packagePrice` beschreiben eine realistische Supermarkt-Kaufpackung.
//   Daraus wird der Preis pro Basiseinheit abgeleitet (unitPrice = packagePrice / packageSize).
// - Verbrauchskosten (Rezeptmenge):     benötigte Menge * unitPrice.
// - Kaufkosten (Packungsoptimiert):     bereits aufgerundete Kaufmenge * unitPrice ≈ Packungspreis.
// - `pantryDefault: true` markiert typische Vorratszutaten (Salz, Pfeffer, Öl, Mehl, Gewürze …).
//   Diese werden NICHT pauschal teuer gerechnet:
//     * Tauchen sie als "Vorrat prüfen" (unit "prüfen") auf, fließen sie mit 0 € in die Summe ein.
//     * Mit konkreter Kleinmenge (z. B. "1 EL Öl") nur als kleine Verbrauchskosten.
// - Zutaten, die der Nutzer als "Zuhause" markiert, zählen immer 0 €.
// - Unbekannte Zutaten bekommen einen kategoriebasierten Fallback (kein pauschales 1,50 €)
//   und werden mit `fallback: true` markiert.

export type IngredientBaseUnit = "g" | "ml" | "Stück";

export type IngredientPriceEntry = {
  key: string;
  match: RegExp;
  category: string;
  baseUnit: IngredientBaseUnit;
  /** Realistische Kaufpackung. */
  packageSize: number;
  packagePrice: number;
  /** Typische Vorratszutat (Salz, Öl, Gewürze …). */
  pantryDefault?: boolean;
  /** Durchschnittsgewicht je Stück (für Zutaten, die mal als g und mal als Stück vorkommen). */
  gramsPerPiece?: number;
};

// Kategorie-Fallback-Preise pro Basiseinheit (€/g bzw. €/Stück über gramsPerPiece-Annahme).
export const CATEGORY_FALLBACK: Record<string, number> = {
  Protein: 0.012,
  Kohlenhydrate: 0.003,
  "Gemüse & Obst": 0.004,
  Milchprodukte: 0.006,
  "Saucen, Gewürze & Vorrat": 0.005,
  Shakes: 0.02,
  Sonstiges: 0.005,
};

const P = "Protein";
const K = "Kohlenhydrate";
const G = "Gemüse & Obst";
const M = "Milchprodukte";
const S = "Saucen, Gewürze & Vorrat";
const SH = "Shakes";

// Reihenfolge ist wichtig: spezifischere Begriffe stehen vor generischen
// (z. B. olivenöl vor öl, hartkäse vor käse, süßkartoffel vor kartoffel).
export const INGREDIENT_PRICES: IngredientPriceEntry[] = [
  // --- Gewürze / Gewürzmischungen zuerst (fangen "Hello Paprika", "gerebelter Oregano" ab) ---
  { key: "gewuerz", match: /(gewuerz|hello |gerebelt|curry|paprikapulver|harissa|piri|muskat|chiliflocken|kraeutermischung|oregano, gerebelt)/, category: S, baseUnit: "g", packageSize: 50, packagePrice: 1.49, pantryDefault: true },

  // --- Saucen / Pasten / Vorrat (überlappende Tokens vor generischen Namen) ---
  { key: "tomatenmark", match: /tomatenmark/, category: S, baseUnit: "g", packageSize: 200, packagePrice: 0.39, pantryDefault: true },
  { key: "basilikumpaste", match: /(basilikumpaste|pestopaste)/, category: S, baseUnit: "g", packageSize: 100, packagePrice: 1.99 },
  { key: "pesto", match: /pesto/, category: S, baseUnit: "g", packageSize: 190, packagePrice: 1.49 },
  { key: "tomatensugo", match: /(tomatensugo|passata|sugo|tomatensoße|tomatensauce|tomatensosse)/, category: S, baseUnit: "g", packageSize: 500, packagePrice: 0.99 },
  { key: "asia-sauce", match: /(hoisin|gochujang|teriyaki|bulgogi|sweet chili|sweetchili|chilisoße|chilisauce|chilisosse|bbq|sriracha|worcester|fischsauce|austernsauce)/, category: S, baseUnit: "g", packageSize: 250, packagePrice: 1.99, pantryDefault: true },
  { key: "miso", match: /miso/, category: S, baseUnit: "g", packageSize: 200, packagePrice: 2.99, pantryDefault: true },
  { key: "marmelade", match: /(chutney|konfitüre|konfiture|marmelade|preiselbeer|fruchtaufstrich)/, category: S, baseUnit: "g", packageSize: 340, packagePrice: 2.49 },
  { key: "ketchup", match: /ketchup/, category: S, baseUnit: "g", packageSize: 450, packagePrice: 0.99, pantryDefault: true },
  { key: "mayonnaise", match: /(mayonnaise|mayo|aioli)/, category: S, baseUnit: "g", packageSize: 250, packagePrice: 0.99, pantryDefault: true },
  { key: "senf", match: /senf/, category: S, baseUnit: "g", packageSize: 250, packagePrice: 0.79, pantryDefault: true },
  { key: "sojasauce", match: /(sojaso|sojasauce|soja\b)/, category: S, baseUnit: "ml", packageSize: 150, packagePrice: 1.49, pantryDefault: true },
  { key: "dressing", match: /dressing/, category: S, baseUnit: "ml", packageSize: 250, packagePrice: 1.49 },
  { key: "bruehe", match: /(brüh|brueh|bruehe|fond|bouillon)/, category: S, baseUnit: "g", packageSize: 100, packagePrice: 1.49, pantryDefault: true },
  { key: "ingwerpaste", match: /ingwerpaste/, category: S, baseUnit: "g", packageSize: 100, packagePrice: 1.49, pantryDefault: true },

  // --- Öle / Essig / Grundvorrat ---
  { key: "olivenoel", match: /(olivenöl|olivenoel)/, category: S, baseUnit: "ml", packageSize: 500, packagePrice: 3.99, pantryDefault: true },
  { key: "sesamoel", match: /(sesamöl|sesamoel)/, category: S, baseUnit: "ml", packageSize: 250, packagePrice: 2.99, pantryDefault: true },
  { key: "oel", match: /\b(öl|oel)\b/, category: S, baseUnit: "ml", packageSize: 1000, packagePrice: 1.99, pantryDefault: true },
  { key: "salz", match: /\bsalz\b/, category: S, baseUnit: "g", packageSize: 500, packagePrice: 0.49, pantryDefault: true },
  { key: "pfeffer", match: /pfeffer/, category: S, baseUnit: "g", packageSize: 50, packagePrice: 1.49, pantryDefault: true },
  { key: "zucker", match: /zucker/, category: S, baseUnit: "g", packageSize: 1000, packagePrice: 0.99, pantryDefault: true },
  { key: "honig", match: /honig/, category: S, baseUnit: "g", packageSize: 500, packagePrice: 3.49, pantryDefault: true },
  { key: "essig", match: /(essig|balsamico)/, category: S, baseUnit: "ml", packageSize: 500, packagePrice: 1.49, pantryDefault: true },
  { key: "sesam", match: /sesam/, category: S, baseUnit: "g", packageSize: 100, packagePrice: 0.99, pantryDefault: true },

  // --- Milchprodukte (Reihenfolge: joghurt vor sahne, spezielle Käse vor "käse") ---
  { key: "kokosmilch", match: /(kokosmilch|kokosnussmilch)/, category: M, baseUnit: "ml", packageSize: 400, packagePrice: 1.19 },
  { key: "joghurt", match: /(joghurt|skyr|quark)/, category: M, baseUnit: "g", packageSize: 500, packagePrice: 0.69 },
  { key: "creme-fraiche", match: /(crème fraîche|creme fraiche|crème fraiche|saure sahne|schmand)/, category: M, baseUnit: "g", packageSize: 200, packagePrice: 0.69 },
  { key: "kraeuterbutter", match: /(kräuterbutter|kraeuterbutter)/, category: M, baseUnit: "g", packageSize: 125, packagePrice: 1.49 },
  { key: "butter", match: /butter/, category: M, baseUnit: "g", packageSize: 250, packagePrice: 1.99 },
  { key: "sahne", match: /(sahne|kochsahne|cremefine|rahm)/, category: M, baseUnit: "ml", packageSize: 200, packagePrice: 0.69 },
  { key: "milch", match: /milch/, category: M, baseUnit: "ml", packageSize: 1000, packagePrice: 0.99 },
  { key: "hartkaese", match: /(hartkäse|hartkaese|parmesan|grana|pecorino|bergkäse|bergkaese)/, category: M, baseUnit: "g", packageSize: 100, packagePrice: 1.49 },
  { key: "gouda", match: /(gouda|cheddar|emmentaler)/, category: M, baseUnit: "g", packageSize: 200, packagePrice: 1.99 },
  { key: "grillkaese", match: /(grillkäse|grillkaese|halloumi)/, category: M, baseUnit: "g", packageSize: 200, packagePrice: 1.99 },
  { key: "hirtenkaese", match: /(hirtenkäse|hirtenkaese|feta)/, category: M, baseUnit: "g", packageSize: 200, packagePrice: 1.29 },
  { key: "mozzarella", match: /mozzarella/, category: M, baseUnit: "g", packageSize: 125, packagePrice: 0.99 },
  { key: "frischkaese", match: /(frischkäse|frischkaese)/, category: M, baseUnit: "g", packageSize: 200, packagePrice: 0.99 },
  { key: "ricotta", match: /\bricotta\b/, category: M, baseUnit: "g", packageSize: 250, packagePrice: 1.49 },
  { key: "kaese", match: /(käse|kaese)/, category: M, baseUnit: "g", packageSize: 200, packagePrice: 1.99 },

  // --- Kohlenhydrate ---
  { key: "suesskartoffel", match: /(süßkartoffel|suesskartoffel|süsskartoffel)/, category: K, baseUnit: "g", packageSize: 1000, packagePrice: 2.49, gramsPerPiece: 250 },
  { key: "pommes", match: /(pommes|fritten)/, category: K, baseUnit: "g", packageSize: 1000, packagePrice: 1.79 },
  { key: "maisstaerke", match: /(maisstärke|maisstaerke|speisestärke|speisestaerke|stärke|staerke)/, category: K, baseUnit: "g", packageSize: 400, packagePrice: 0.69, pantryDefault: true },
  { key: "panko", match: /(panko|pankomehl|semmelbrösel|semmelbroesel|paniermehl)/, category: K, baseUnit: "g", packageSize: 400, packagePrice: 0.79 },
  { key: "mehl", match: /(\bmehl\b|weizenmehl)/, category: K, baseUnit: "g", packageSize: 1000, packagePrice: 0.69, pantryDefault: true },
  { key: "spaetzle", match: /(spätzle|spaetzle)/, category: K, baseUnit: "g", packageSize: 400, packagePrice: 1.99 },
  { key: "gnocchi", match: /gnocchi/, category: K, baseUnit: "g", packageSize: 400, packagePrice: 1.49 },
  { key: "tortellini", match: /tortellini/, category: K, baseUnit: "g", packageSize: 400, packagePrice: 2.49 },
  { key: "pasta", match: /(fettuccine|rigatoni|conchiglie|tagliatelle|spaghetti|penne|fusilli|farfalle|pasta|nudel)/, category: K, baseUnit: "g", packageSize: 500, packagePrice: 1.29 },
  { key: "maiskolben", match: /maiskolben/, category: K, baseUnit: "g", packageSize: 400, packagePrice: 1.49 },
  { key: "couscous", match: /(couscous|bulgur)/, category: K, baseUnit: "g", packageSize: 500, packagePrice: 1.49 },
  { key: "reis", match: /(basmati|jasminreis|wildreis|reis)/, category: K, baseUnit: "g", packageSize: 1000, packagePrice: 2.49 },
  { key: "ciabatta", match: /(ciabatta|baguette|sauerteig|toast|\bbrot\b)/, category: K, baseUnit: "g", packageSize: 250, packagePrice: 1.29 },
  { key: "brioche", match: /(brioche|burgerbrötchen|burgerbroetchen|\bbun\b|\bbroetchen\b)/, category: K, baseUnit: "Stück", packageSize: 4, packagePrice: 1.79, gramsPerPiece: 80 },
  { key: "tortilla", match: /(tortilla|wrap)/, category: K, baseUnit: "Stück", packageSize: 6, packagePrice: 1.49, gramsPerPiece: 50 },
  { key: "kartoffel", match: /(kartoffel|drilling)/, category: K, baseUnit: "g", packageSize: 1500, packagePrice: 1.99, gramsPerPiece: 150 },

  // --- Protein / Fleisch / Fisch ---
  { key: "bacon", match: /(bacon|speck)/, category: P, baseUnit: "g", packageSize: 200, packagePrice: 1.99 },
  { key: "prosciutto", match: /(prosciutto|serrano|parmaschinken|schinken|salami)/, category: P, baseUnit: "g", packageSize: 100, packagePrice: 2.49 },
  { key: "haehnchen", match: /(hähnchen|haehnchen|chicken|pollo|poulet|pute|hühnchen|huehnchen)/, category: P, baseUnit: "g", packageSize: 500, packagePrice: 5.49 },
  { key: "hackfleisch", match: /(rinderhack|hackfleisch|gemischtes hack|weiderind|\bhack\b)/, category: P, baseUnit: "g", packageSize: 500, packagePrice: 4.99 },
  { key: "rind", match: /(rindersteak|rindfleisch|rindersteak|bulgogi|\brind\b|\bsteak\b)/, category: P, baseUnit: "g", packageSize: 400, packagePrice: 6.49 },
  { key: "schwein", match: /(schweinefilet|schweinelachs|schweineschnitzel|schwein|schnitzel|kasseler)/, category: P, baseUnit: "g", packageSize: 400, packagePrice: 4.99 },
  { key: "bratwurst", match: /(rostbratwurst|bratwurst|\bwurst\b|chorizo)/, category: P, baseUnit: "g", packageSize: 200, packagePrice: 2.99 },
  { key: "ribs", match: /(spareribs|\bribs\b|rippchen)/, category: P, baseUnit: "g", packageSize: 500, packagePrice: 4.99 },
  { key: "garnelen", match: /(garnelen|großgarnelen|grossgarnelen|shrimp|gambas)/, category: P, baseUnit: "g", packageSize: 150, packagePrice: 3.99 },
  { key: "fisch", match: /(seelachs|lachs|fisch|kabeljau|dorsch|thunfisch|forelle)/, category: P, baseUnit: "g", packageSize: 250, packagePrice: 3.49 },
  { key: "tofu", match: /tofu/, category: P, baseUnit: "g", packageSize: 200, packagePrice: 1.49 },
  { key: "ei", match: /\b(ei|eier)\b/, category: P, baseUnit: "Stück", packageSize: 10, packagePrice: 2.49, gramsPerPiece: 60 },

  // --- Gemüse & Obst ---
  { key: "fruehlingszwiebel", match: /(frühlingszwiebel|fruehlingszwiebel|lauchzwiebel)/, category: G, baseUnit: "g", packageSize: 100, packagePrice: 0.69, gramsPerPiece: 15 },
  { key: "zwiebel", match: /(zwiebel|schalotte)/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.15, gramsPerPiece: 110 },
  { key: "knoblauch", match: /knoblauch/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.08, gramsPerPiece: 5 },
  { key: "porree", match: /(porree|\blauch\b)/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.79, gramsPerPiece: 200 },
  { key: "champignon", match: /(champignon|pilz)/, category: G, baseUnit: "g", packageSize: 250, packagePrice: 1.29 },
  { key: "paprika", match: /(paprika|spitzpaprika)/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.55, gramsPerPiece: 150 },
  { key: "gurke", match: /gurke/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.69, gramsPerPiece: 400 },
  { key: "avocado", match: /avocado/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 1.09, gramsPerPiece: 150 },
  { key: "karotte", match: /(karotte|möhre|moehre|mohrrübe)/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.12, gramsPerPiece: 80 },
  { key: "brokkoli", match: /brokkoli/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.99, gramsPerPiece: 350 },
  { key: "blumenkohl", match: /blumenkohl/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 1.29, gramsPerPiece: 600 },
  { key: "kohlrabi", match: /kohlrabi/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.69, gramsPerPiece: 250 },
  { key: "pakchoi", match: /(pak choi|pakchoi)/, category: G, baseUnit: "g", packageSize: 200, packagePrice: 1.49 },
  { key: "wirsing", match: /wirsing/, category: G, baseUnit: "g", packageSize: 1000, packagePrice: 1.49 },
  { key: "rotkohl", match: /(rotkohl|rotkraut|geraspelter rotkohl)/, category: G, baseUnit: "g", packageSize: 500, packagePrice: 0.99 },
  { key: "spinat", match: /spinat/, category: G, baseUnit: "g", packageSize: 100, packagePrice: 1.29 },
  { key: "rucola", match: /rucola/, category: G, baseUnit: "g", packageSize: 100, packagePrice: 1.29 },
  { key: "salat", match: /(blattsalat|salatherz|romana|salatmischung|kopfsalat|eisberg|feldsalat|\bsalat\b)/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.69, gramsPerPiece: 120 },
  { key: "buschbohnen", match: /(buschbohnen|prinzessbohnen|grüne bohnen|gruene bohnen)/, category: G, baseUnit: "g", packageSize: 250, packagePrice: 1.49 },
  { key: "bohnen", match: /(kidneybohnen|schwarze bohnen|bohnen)/, category: G, baseUnit: "g", packageSize: 400, packagePrice: 0.79 },
  { key: "linsen", match: /linsen/, category: G, baseUnit: "g", packageSize: 400, packagePrice: 0.99 },
  { key: "mais", match: /mais/, category: G, baseUnit: "g", packageSize: 150, packagePrice: 0.79 },
  { key: "birne", match: /birne/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.55, gramsPerPiece: 160 },
  { key: "zitrone", match: /\bzitrone\b/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.4, gramsPerPiece: 100 },
  { key: "limette", match: /limette/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.4, gramsPerPiece: 70 },
  { key: "chili", match: /(chilischote|chili|peperoni)/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.3, gramsPerPiece: 20 },
  { key: "ingwer", match: /ingwer/, category: G, baseUnit: "g", packageSize: 70, packagePrice: 1.49 },
  { key: "tomate", match: /tomate/, category: G, baseUnit: "Stück", packageSize: 1, packagePrice: 0.3, gramsPerPiece: 90 },
  { key: "aprikose", match: /aprikose/, category: G, baseUnit: "g", packageSize: 200, packagePrice: 1.99 },
  { key: "sultaninen", match: /(sultaninen|rosinen)/, category: G, baseUnit: "g", packageSize: 200, packagePrice: 1.29 },
  { key: "erdnuss", match: /(erdnüsse|erdnuss|erdnuesse)/, category: G, baseUnit: "g", packageSize: 200, packagePrice: 1.49 },
  { key: "sonnenblumenkerne", match: /(sonnenblumenkern|kürbiskern|kuerbiskern)/, category: G, baseUnit: "g", packageSize: 200, packagePrice: 1.19 },
  { key: "kraeuter", match: /(basilikum|petersilie|schnittlauch|\bdill\b|minze|rosmarin|thymian|salbei|koriander|kräuter|kraeuter)/, category: G, baseUnit: "g", packageSize: 50, packagePrice: 0.79 },

  // --- Shakes ---
  { key: "shake", match: /(esn|proteinpulver|whey|eiweißpulver|eiweisspulver|shake)/, category: SH, baseUnit: "g", packageSize: 1000, packagePrice: 24.99 },
];

export function normalizeIngredientName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[„“”"'*]/g, " ")
    .replace(/\bbio\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findIngredientPrice(name: string): IngredientPriceEntry | undefined {
  const normalized = normalizeIngredientName(name);
  return INGREDIENT_PRICES.find((entry) => entry.match.test(normalized));
}

type UnitKind = "weight" | "volume" | "count" | "package" | "spoonL" | "spoonS" | "pruefen";

function classifyUnit(unit: string): UnitKind {
  const u = String(unit || "").toLowerCase();
  if (u.includes("prüfen") || u.includes("pruefen")) return "pruefen";
  if (u === "ml" || u === "l") return "volume";
  if (u === "el") return "spoonL";
  if (u === "tl") return "spoonS";
  if (/(becher|packung|netz|glas|dose|bund|kopf)/.test(u)) return "package";
  if (/(stück|stk|zehe|scheibe|kugel)/.test(u)) return "count";
  // g, "g trocken" und alles andere als Gewicht behandeln
  return "weight";
}

// Menge in die Basiseinheit des Eintrags umrechnen.
function toBaseAmount(amount: number, kind: UnitKind, entry: IngredientPriceEntry): number {
  const perPiece = entry.gramsPerPiece || entry.packageSize;
  if (entry.baseUnit === "Stück") {
    switch (kind) {
      case "count":
      case "package":
        return amount;
      case "weight":
      case "volume":
        return entry.gramsPerPiece ? amount / entry.gramsPerPiece : Math.max(1, amount);
      case "spoonL":
      case "spoonS":
        return amount;
      default:
        return amount;
    }
  }
  // baseUnit g / ml
  switch (kind) {
    case "weight":
    case "volume":
      return amount;
    case "spoonL":
      return amount * 15;
    case "spoonS":
      return amount * 5;
    case "count":
      return amount * perPiece;
    case "package":
      return amount * entry.packageSize;
    default:
      return amount;
  }
}

export type ResolvedPrice = {
  estimatedCost: number;
  /** weighted | piece | pantry | pantry-default | fallback | home */
  priceType: string;
  fallback: boolean;
  pantryDefault: boolean;
  entryKey?: string;
  note?: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Realistischen Preis für eine Zutat bestimmen.
 * @param amount Menge in der angegebenen Einheit (bei Packungsoptimiert die Kaufmenge).
 */
export function resolveIngredientPrice(input: {
  name: string;
  amount: number;
  unit: string;
  category?: string;
  inPantry?: boolean;
}): ResolvedPrice {
  const { name, amount, unit, category, inPantry } = input;

  // Vom Nutzer als "Zuhause" markiert → nie in die Summe.
  if (inPantry) {
    return { estimatedCost: 0, priceType: "home", fallback: false, pantryDefault: false, note: "Zuhause – nicht eingerechnet" };
  }

  const kind = classifyUnit(unit);
  const entry = findIngredientPrice(name);

  // "Vorrat prüfen": typische Vorratszutat ohne konkrete Kaufmenge → 0 € in der Summe.
  if (kind === "pruefen") {
    return {
      estimatedCost: 0,
      priceType: "pantry-default",
      fallback: !entry,
      pantryDefault: true,
      entryKey: entry?.key,
      note: "Vorrat prüfen – nicht in Summe gerechnet",
    };
  }

  if (entry) {
    const base = toBaseAmount(amount, kind, entry);
    const unitPrice = entry.packagePrice / entry.packageSize;
    return {
      estimatedCost: round2(base * unitPrice),
      priceType: entry.pantryDefault ? "pantry" : entry.baseUnit === "Stück" ? "piece" : "weighted",
      fallback: false,
      pantryDefault: Boolean(entry.pantryDefault),
      entryKey: entry.key,
    };
  }

  // Kein Treffer → kategoriebasierter Fallback (kein pauschales 1,50 €).
  const fallbackUnitPrice = CATEGORY_FALLBACK[category || "Sonstiges"] ?? CATEGORY_FALLBACK.Sonstiges;
  let base: number;
  switch (kind) {
    case "spoonL":
      base = amount * 15;
      break;
    case "spoonS":
      base = amount * 5;
      break;
    case "count":
      base = amount * 100; // grobe Annahme: 100 g je Stück
      break;
    case "package":
      base = amount * 250; // grobe Annahme: 250 g je Packung
      break;
    default:
      base = amount;
  }
  return {
    estimatedCost: round2(base * fallbackUnitPrice),
    priceType: "fallback",
    fallback: true,
    pantryDefault: false,
    note: "geschätzt (Kategorie-Fallback)",
  };
}
