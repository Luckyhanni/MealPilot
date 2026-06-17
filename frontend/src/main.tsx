import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RefreshCw,
  Printer,
  ShoppingBasket,
  Sparkles,
  History,
  Utensils,
  Home,
  BookOpen,
  DownloadCloud,
  Layout,
  LockKeyhole,
} from "lucide-react";
import "./styles.css";

type RecipeStep = { title?: string; text: string; imageUrl?: string };
type Recipe = {
  id: string;
  name: string;
  tier: string;
  kcal: number;
  protein: number;
  durationMinutes: number;
  imageUrl: string;
  sourceUrl?: string;
  tags: string[];
  ingredients: string[];
  instructions?: RecipeStep[];
  estimatedCost?: number;
  priceNote?: string;
  importedAt?: string | null;
};

type MealSlot = { day: string; mealIndex: 1 | 2; recipe: Recipe };
type DayPlan = {
  day: string;
  meals: MealSlot[];
  mealKcal: number;
  mealProtein: number;
  shakes: string[];
  totalKcalWithShakes: number;
  totalProteinWithShakes: number;
};
type WeekPlan = { id: string; createdAt: string; days: DayPlan[]; remixMemory?: Record<string, string[]> };
type ShoppingItem = {
  key: string;
  name: string;
  amount: number;
  amountText?: string;
  unit: string;
  recipes: string[];
  category?: string;
  checked?: boolean;
  inPantry?: boolean;
  estimatedCost?: number;
  priceNote?: string;
  source?: string;
};
type ShoppingRange = "all" | "mon-thu" | "fri-sun";
type AuthState = "checking" | "locked" | "open";
type ShoppingPayload = {
  factor: number;
  range: ShoppingRange;
  rangeLabel: string;
  totalEstimatedCost: number;
  pantryItems?: Record<string, boolean>;
  pantryCatalog?: { key: string; name: string; category?: string; inPantry: boolean }[];
  items: ShoppingItem[];
};

type ArchiveEntry = {
  id: string;
  createdAt: string;
  recipeCount: number;
  days: { day: string; meals: { mealIndex: 1 | 2; name: string; kcal: number; protein: number }[] }[];
};
type PrintOrientation = "portrait" | "landscape";
type View = "home" | "plan" | "shopping" | "print" | "recipe" | "history";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  return res.json() as Promise<T>;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [pinInput, setPinInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Lädt...");
  const [error, setError] = useState<string | null>(null);
  const [shoppingData, setShoppingData] = useState<Record<
    ShoppingRange,
    ShoppingPayload
  > | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [changeTarget, setChangeTarget] = useState<MealSlot | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [draggingSlot, setDraggingSlot] = useState<{ day: string; mealIndex: 1 | 2 } | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (authState !== "open") return;
    api<WeekPlan>("/api/plans/latest")
      .then((p) => setPlan(p))
      .catch(() => undefined);
    loadRecipes();
  }, [authState]);

  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/auth/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 401) {
        setAuthState(
          localStorage.getItem("mealpilot_pin_ok") === "true"
            ? "open"
            : "locked",
        );
        return;
      }
      const data = (await res.json()) as { enabled: boolean; ok: boolean };
      if (!data.enabled) localStorage.removeItem("mealpilot_pin_ok");
      setAuthState(data.ok ? "open" : "locked");
    } catch {
      setAuthError("PIN-Status konnte nicht geprüft werden.");
      setAuthState("locked");
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (!res.ok) {
        setAuthError("PIN ist falsch.");
        return;
      }
      localStorage.setItem("mealpilot_pin_ok", "true");
      setAuthState("open");
    } catch {
      setAuthError("PIN konnte nicht geprüft werden.");
    }
  }

  async function loadRecipes() {
    try {
      const recipes = await api<Recipe[]>("/api/recipes");
      setAllRecipes(recipes);
    } catch {
      // Die Rezeptliste wird spätestens beim gezielten Ändern erneut geladen.
    }
  }

  async function openHistory() {
    setLoading(true);
    setLoadingText("Verlauf wird geladen...");
    setError(null);
    try {
      const data = await api<ArchiveEntry[]>("/api/plans/archive");
      setArchive(data);
      setView("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verlauf konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    setLoading(true);
    setLoadingText("Wochenplan wird erstellt...");
    setError(null);
    try {
      const next = await api<WeekPlan>("/api/plans/generate", {
        method: "POST",
        body: "{}",
      });
      setPlan(next);
      setView("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function remix(day: string, mealIndex: 1 | 2) {
    if (!plan) return;
    setLoading(true);
    setLoadingText("Gericht wird zufällig ersetzt...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/plans/${plan.id}/remix`, {
        method: "POST",
        body: JSON.stringify({ day, mealIndex }),
      });
      setPlan(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remix fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function replaceMeal(day: string, mealIndex: 1 | 2, recipeId: string) {
    if (!plan) return;
    setLoading(true);
    setLoadingText("Gericht wird gezielt geändert...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/plans/${plan.id}/replace`, {
        method: "POST",
        body: JSON.stringify({ day, mealIndex, recipeId }),
      });
      setPlan(next);
      setChangeTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ändern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function moveMeal(
    fromDay: string,
    fromMealIndex: 1 | 2,
    toDay: string,
    toMealIndex: 1 | 2,
  ) {
    if (!plan) return;
    if (fromDay === toDay && fromMealIndex === toMealIndex) return;
    setLoading(true);
    setLoadingText("Gerichte werden verschoben...");
    setError(null);
    try {
      const next = await api<WeekPlan>(`/api/plans/${plan.id}/move-meal`, {
        method: "POST",
        body: JSON.stringify({ fromDay, fromMealIndex, toDay, toMealIndex }),
      });
      setPlan(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verschieben fehlgeschlagen");
    } finally {
      setDraggingSlot(null);
      setLoading(false);
    }
  }

  async function openChange(slot: MealSlot) {
    if (allRecipes.length === 0) await loadRecipes();
    setChangeTarget(slot);
  }

  async function loadShoppingData(showLoading = true) {
    if (!plan) return null;
    if (showLoading) {
      setLoading(true);
      setLoadingText("Einkaufsliste wird berechnet...");
    }
    setError(null);
    try {
      const [all, first, second] = await Promise.all([
        api<ShoppingPayload>(`/api/plans/${plan.id}/shopping-list?range=all`),
        api<ShoppingPayload>(
          `/api/plans/${plan.id}/shopping-list?range=mon-thu`,
        ),
        api<ShoppingPayload>(
          `/api/plans/${plan.id}/shopping-list?range=fri-sun`,
        ),
      ]);
      const data = { all, "mon-thu": first, "fri-sun": second };
      setShoppingData(data);
      return data;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Einkaufsliste konnte nicht geladen werden",
      );
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function openShopping() {
    const data = await loadShoppingData(true);
    if (data) setView("shopping");
  }

  async function setShoppingChecked(range: ShoppingRange, itemKey: string, checked: boolean) {
    if (!plan) return;
    setShoppingData((current) => {
      if (!current) return current;
      return {
        ...current,
        [range]: {
          ...current[range],
          items: current[range].items.map((item) =>
            item.key === itemKey ? { ...item, checked } : item,
          ),
        },
      };
    });
    try {
      await api(`/api/plans/${plan.id}/shopping-check`, {
        method: "POST",
        body: JSON.stringify({ range, itemKey, checked }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkbox konnte nicht gespeichert werden");
      await loadShoppingData(false);
    }
  }

  async function setPantryItem(itemKey: string, inPantry: boolean, name?: string, category?: string) {
    setShoppingData((current) => {
      if (!current) return current;
      const next = { ...current };
      for (const range of Object.keys(next) as ShoppingRange[]) {
        const existingCatalog = next[range].pantryCatalog || [];
        const hasCatalogItem = existingCatalog.some((entry) => entry.key === itemKey);
        next[range] = {
          ...next[range],
          pantryItems: { ...(next[range].pantryItems || {}), [itemKey]: inPantry },
          pantryCatalog: hasCatalogItem
            ? existingCatalog.map((entry) =>
                entry.key === itemKey ? { ...entry, inPantry, name: name || entry.name, category: category || entry.category } : entry,
              )
            : [...existingCatalog, { key: itemKey, name: name || itemKey, category, inPantry }],
          items: next[range].items.map((item) =>
            item.key === itemKey ? { ...item, inPantry } : item,
          ),
        };
      }
      return next;
    });
    try {
      await api("/api/pantry", {
        method: "POST",
        body: JSON.stringify({ itemKey, inPantry, name, category }),
      });
      await loadShoppingData(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zuhause-Liste konnte nicht gespeichert werden");
    }
  }

  async function openRecipe(recipe: Recipe) {
    setLoading(true);
    setLoadingText("Rezept wird geöffnet...");
    setError(null);
    try {
      const full = await api<Recipe>(`/api/recipes/${recipe.id}`);
      setSelectedRecipe(full);
      setView("recipe");
    } catch (e) {
      setSelectedRecipe(recipe);
      setView("recipe");
      setError(
        e instanceof Error
          ? e.message
          : "Rezept konnte nicht vollständig geladen werden",
      );
    } finally {
      setLoading(false);
    }
  }

  async function importRecipe(recipe: Recipe) {
    setLoading(true);
    setLoadingText("HelloFresh-Bilder und Anleitung werden importiert...");
    setError(null);
    try {
      const imported = await api<Recipe>(
        `/api/recipes/${recipe.id}/import-source`,
        { method: "POST", body: "{}" },
      );
      setSelectedRecipe(imported);
      if (plan) setPlan(replaceRecipeEverywhere(plan, imported));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import fehlgeschlagen. Tipp: Prüfe im Serverfenster, ob HelloFresh den Zugriff blockiert hat.");
    } finally {
      setLoading(false);
    }
  }

  async function importAll() {
    setLoading(true);
    setLoadingText(
      "Alle HelloFresh-Bilder werden importiert. Das kann dauern...",
    );
    setError(null);
    try {
      const result = await api<{
        imported: number;
        errors: { id: string; message: string }[];
      }>("/api/recipes/import-all", { method: "POST", body: "{}" });
      setError(
        result.errors.length
          ? `${result.imported} Rezepte importiert, ${result.errors.length} Fehler. Details stehen in der Konsole vom Server.`
          : `${result.imported} Rezepte importiert.`,
      );
      if (plan) {
        const latest = await api<WeekPlan>("/api/plans/latest");
        setPlan(latest);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Import aller Rezepte fehlgeschlagen",
      );
    } finally {
      setLoading(false);
    }
  }

  if (authState !== "open") {
    return (
      <PinGate
        checking={authState === "checking"}
        pin={pinInput}
        error={authError}
        onPinChange={setPinInput}
        onSubmit={submitPin}
      />
    );
  }

  return (
    <div className={`app view-${view}`}>
      {view !== "print" && (
        <header className="topbar">
          <button className="brand" onClick={() => setView("home")}>
            <Utensils size={24} />
            <span>MealPilot</span>
          </button>
          <nav>
            <button onClick={() => setView("home")}>
              <Home size={18} /> Start
            </button>
            <button disabled={!plan} onClick={() => setView("plan")}>
              <History size={18} /> Wochenplan
            </button>
            <button disabled={!plan} onClick={openShopping}>
              <ShoppingBasket size={18} /> Einkauf
            </button>
            <button onClick={openHistory}>
              <History size={18} /> Verlauf
            </button>
            <button disabled={!plan} onClick={() => setView("print")}>
              <Printer size={18} /> Druckansicht
            </button>
          </nav>
        </header>
      )}

      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {loading && <div className="loading">{loadingText}</div>}

      {view === "home" && (
        <HomeView
          plan={plan}
          generatePlan={generatePlan}
          openPlan={() => setView("plan")}
          importAll={importAll}
        />
      )}
      {view === "plan" && plan && (
        <PlanView
          plan={plan}
          remix={remix}
          openRecipe={openRecipe}
          openChange={openChange}
          openPrint={() => setView("print")}
          openShopping={openShopping}
          draggingSlot={draggingSlot}
          setDraggingSlot={setDraggingSlot}
          moveMeal={moveMeal}
        />
      )}
      {view === "shopping" && plan && shoppingData && (
        <ShoppingView
          data={shoppingData}
          onCheckedChange={setShoppingChecked}
          onPantryChange={setPantryItem}
        />
      )}
      {view === "history" && <HistoryView archive={archive} />}
      {view === "recipe" && selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          back={() => setView("plan")}
          importRecipe={importRecipe}
        />
      )}
      {view === "print" && plan && (
        <PrintView plan={plan} back={() => setView("plan")} />
      )}

      {changeTarget && plan && (
        <ChangeRecipeModal
          target={changeTarget}
          recipes={allRecipes}
          usedRecipeIds={new Set(
            plan.days
              .flatMap((day) => day.meals)
              .filter(
                (slot) =>
                  !(
                    slot.day === changeTarget.day &&
                    slot.mealIndex === changeTarget.mealIndex
                  ),
              )
              .map((slot) => slot.recipe.id),
          )}
          onClose={() => setChangeTarget(null)}
          onSelect={(recipeId) =>
            replaceMeal(changeTarget.day, changeTarget.mealIndex, recipeId)
          }
        />
      )}
    </div>
  );
}

function PinGate({
  checking,
  pin,
  error,
  onPinChange,
  onSubmit,
}: {
  checking: boolean;
  pin: string;
  error: string | null;
  onPinChange: (pin: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <main className="pin-screen">
      <form className="pin-panel" onSubmit={onSubmit}>
        <div className="pin-icon">
          <LockKeyhole size={28} />
        </div>
        <p className="eyebrow">MealPilot</p>
        <h1>PIN</h1>
        {checking ? (
          <p className="hint">Zugriff wird geprüft...</p>
        ) : (
          <>
            <input
              value={pin}
              onChange={(e) => onPinChange(e.target.value)}
              inputMode="numeric"
              type="password"
              placeholder="PIN eingeben"
              autoFocus
            />
            {error && <p className="pin-error">{error}</p>}
            <button className="primary" type="submit">
              <LockKeyhole size={18} /> Öffnen
            </button>
          </>
        )}
      </form>
    </main>
  );
}

function replaceRecipeEverywhere(plan: WeekPlan, recipe: Recipe): WeekPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: day.meals.map((slot) =>
        slot.recipe.id === recipe.id ? { ...slot, recipe } : slot,
      ),
    })),
  };
}

function HomeView({
  plan,
  generatePlan,
  openPlan,
  importAll,
}: {
  plan: WeekPlan | null;
  generatePlan: () => void;
  openPlan: () => void;
  importAll: () => void;
}) {
  return (
    <main className="home hero">
      <section className="hero-card">
        <p className="eyebrow">Lokale Wochenplanung</p>
        <h1>MealPilot</h1>
        <p className="lead">
          Erstellt dir aus deiner Rezeptliste einen Wochenplan mit 2 Mahlzeiten
          pro Tag, Shake-Vorschlägen, Remix-Funktion, Kochansicht und
          Druckansicht für den Kühlschrank.
        </p>
        <div className="hero-actions">
          <button className="primary" onClick={generatePlan}>
            <Sparkles size={20} /> Neuen Wochenplan erstellen
          </button>
          <button className="secondary" disabled={!plan} onClick={openPlan}>
            Letzten Wochenplan öffnen
          </button>
          <button className="secondary" onClick={importAll}>
            <DownloadCloud size={18} /> HelloFresh-Bilder importieren
          </button>
        </div>
        <div className="mini-info">
          <span>Kein Login</span>
          <span>Lokal</span>
          <span>Handy/iPad im WLAN</span>
          <span>Druckbar</span>
          <span>Kochmodus</span>
        </div>
        <p className="hint">
          Der Import lädt Bilder und, falls auf der Rezeptseite auslesbar,
          Kochschritte aus den gespeicherten HelloFresh-Links lokal in deine
          App.
        </p>
      </section>
    </main>
  );
}

function PlanView({
  plan,
  remix,
  openRecipe,
  openChange,
  openPrint,
  openShopping,
  draggingSlot,
  setDraggingSlot,
  moveMeal,
}: {
  plan: WeekPlan;
  remix: (day: string, mealIndex: 1 | 2) => void;
  openRecipe: (recipe: Recipe) => void;
  openChange: (slot: MealSlot) => void;
  openPrint: () => void;
  openShopping: () => void;
  draggingSlot: { day: string; mealIndex: 1 | 2 } | null;
  setDraggingSlot: (slot: { day: string; mealIndex: 1 | 2 } | null) => void;
  moveMeal: (fromDay: string, fromMealIndex: 1 | 2, toDay: string, toMealIndex: 1 | 2) => void;
}) {
  const avg = useMemo(() => {
    const kcal = Math.round(
      plan.days.reduce((s, d) => s + d.totalKcalWithShakes, 0) /
        plan.days.length,
    );
    const protein = Math.round(
      plan.days.reduce((s, d) => s + d.totalProteinWithShakes, 0) /
        plan.days.length,
    );
    return { kcal, protein };
  }, [plan]);

  return (
    <main className="page-wrap compact-plan">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Aktueller Plan</p>
          <h1>Dein Wochenplan</h1>
          <p>
            Ø ca. {avg.kcal} kcal / {avg.protein} g Protein pro Tag inklusive
            Shakes.
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={openShopping}>
            <ShoppingBasket size={18} /> Einkaufsliste
          </button>
          <button className="primary" onClick={openPrint}>
            <Printer size={18} /> Druckansicht
          </button>
        </div>
      </section>

      <p className="drag-hint">Tipp: Gerichte gedrückt halten und auf einen anderen Slot ziehen, um sie zu tauschen.</p>

      <section className="week-grid compact-week">
        {plan.days.map((day) => (
          <DayCard
            key={day.day}
            day={day}
            remix={remix}
            openRecipe={openRecipe}
            openChange={openChange}
            draggingSlot={draggingSlot}
            setDraggingSlot={setDraggingSlot}
            moveMeal={moveMeal}
          />
        ))}
      </section>
    </main>
  );
}

function DayCard({
  day,
  remix,
  openRecipe,
  openChange,
  draggingSlot,
  setDraggingSlot,
  moveMeal,
}: {
  day: DayPlan;
  remix: (day: string, mealIndex: 1 | 2) => void;
  openRecipe: (recipe: Recipe) => void;
  openChange: (slot: MealSlot) => void;
  draggingSlot: { day: string; mealIndex: 1 | 2 } | null;
  setDraggingSlot: (slot: { day: string; mealIndex: 1 | 2 } | null) => void;
  moveMeal: (fromDay: string, fromMealIndex: 1 | 2, toDay: string, toMealIndex: 1 | 2) => void;
}) {
  return (
    <article className="day-card">
      <div className="day-label">{day.day}</div>
      <div className="meals">
        {day.meals.map((slot) => (
          <MealCard
            key={`${day.day}-${slot.mealIndex}`}
            slot={slot}
            onOpen={() => openRecipe(slot.recipe)}
            onRemix={() => remix(day.day, slot.mealIndex)}
            onChange={() => openChange(slot)}
            draggingSlot={draggingSlot}
            setDraggingSlot={setDraggingSlot}
            moveMeal={moveMeal}
          />
        ))}
      </div>
      <aside className="day-stats">
        <strong>{day.totalKcalWithShakes} kcal</strong>
        <span>{day.totalProteinWithShakes} g Protein</span>
        <small>
          Shakes: {day.shakes.length ? day.shakes.join(" + ") : "keine"}
        </small>
      </aside>
    </article>
  );
}

function MealCard({
  slot,
  onOpen,
  onRemix,
  onChange,
  draggingSlot,
  setDraggingSlot,
  moveMeal,
}: {
  slot: MealSlot;
  onOpen: () => void;
  onRemix: () => void;
  onChange: () => void;
  draggingSlot: { day: string; mealIndex: 1 | 2 } | null;
  setDraggingSlot: (slot: { day: string; mealIndex: 1 | 2 } | null) => void;
  moveMeal: (fromDay: string, fromMealIndex: 1 | 2, toDay: string, toMealIndex: 1 | 2) => void;
}) {
  const r = slot.recipe;
  const isDragging =
    draggingSlot?.day === slot.day && draggingSlot?.mealIndex === slot.mealIndex;

  function handleDrop() {
    if (!draggingSlot) return;
    moveMeal(draggingSlot.day, draggingSlot.mealIndex, slot.day, slot.mealIndex);
  }

  return (
    <article
      className={`meal-card draggable-meal ${isDragging ? "is-dragging" : ""}`}
      title="Kochansicht öffnen oder Gericht ziehen"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ day: slot.day, mealIndex: slot.mealIndex }),
        );
        setDraggingSlot({ day: slot.day, mealIndex: slot.mealIndex });
      }}
      onDragEnd={() => setDraggingSlot(null)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        handleDrop();
      }}
    >
      <button
        className="meal-open-area"
        onClick={onOpen}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      >
        <img src={r.imageUrl} alt={r.name} draggable={false} />
        <div className="meal-content">
          <div className="tier">{r.tier}</div>
          <h3>{r.name}</h3>
          <p>
            {r.kcal} kcal • {r.protein} g Protein • {r.durationMinutes} Min.
          </p>
          <span className="price-pill">
            ≈ {formatEuro(r.estimatedCost)} für dich
          </span>
          <span className="open-recipe">
            <BookOpen size={14} /> Anleitung öffnen
          </span>
        </div>
      </button>
      <div className="meal-actions">
        <button className="remix" onClick={onRemix}>
          <RefreshCw size={15} /> Remix
        </button>
        <button className="change-meal" onClick={onChange}>
          Ändern
        </button>
      </div>
    </article>
  );
}

function ChangeRecipeModal({
  target,
  recipes,
  usedRecipeIds,
  onClose,
  onSelect,
}: {
  target: MealSlot;
  recipes: Recipe[];
  usedRecipeIds: Set<string>;
  onClose: () => void;
  onSelect: (recipeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("alle");

  const tiers = useMemo(() => {
    return [
      "alle",
      ...Array.from(new Set(recipes.map((recipe) => recipe.tier))).sort(),
    ];
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((recipe) => recipe.id !== target.recipe.id)
      .filter((recipe) => tierFilter === "alle" || recipe.tier === tierFilter)
      .filter((recipe) => {
        if (!q) return true;
        const haystack = [
          recipe.name,
          recipe.tier,
          ...(recipe.tags || []),
          ...(recipe.ingredients || []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const usedA = usedRecipeIds.has(a.id) ? 1 : 0;
        const usedB = usedRecipeIds.has(b.id) ? 1 : 0;
        if (usedA !== usedB) return usedA - usedB;
        return b.tier.localeCompare(a.tier, "de");
      });
  }, [query, recipes, target.recipe.id, tierFilter, usedRecipeIds]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="change-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Gezielt ändern</p>
            <h2>Gericht ersetzen</h2>
            <p>
              {target.day}, Mahlzeit {target.mealIndex}: aktuell „
              {target.recipe.name}“
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="recipe-filters">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nach Gericht, Zutat oder Tag suchen …"
            autoFocus
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            {tiers.map((tier) => (
              <option key={tier} value={tier}>
                {tier === "alle" ? "Alle Kategorien" : tier}
              </option>
            ))}
          </select>
        </div>

        <div className="recipe-picker-list">
          {filtered.map((recipe) => {
            const used = usedRecipeIds.has(recipe.id);
            return (
              <article className={`recipe-picker-item ${used ? "used" : ""}`} key={recipe.id}>
                <img src={recipe.imageUrl} alt={recipe.name} />
                <div>
                  <span>{recipe.tier}</span>
                  <h3>{recipe.name}</h3>
                  <p>
                    {recipe.kcal} kcal • {recipe.protein} g Protein • {recipe.durationMinutes} Min. • ≈ {formatEuro(recipe.estimatedCost)}
                  </p>
                  {used && <small>Schon in dieser Woche eingeplant</small>}
                </div>
                <button
                  className="primary"
                  disabled={used}
                  onClick={() => onSelect(recipe.id)}
                >
                  Einsetzen
                </button>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-picker">Kein passendes Rezept gefunden.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatEuro(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "– €";
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function ShoppingView({
  data,
  onCheckedChange,
  onPantryChange,
}: {
  data: Record<ShoppingRange, ShoppingPayload>;
  onCheckedChange: (range: ShoppingRange, itemKey: string, checked: boolean) => void;
  onPantryChange: (itemKey: string, inPantry: boolean, name?: string, category?: string) => void;
}) {
  const [activeRange, setActiveRange] = useState<ShoppingRange>("all");
  const [tab, setTab] = useState<"shopping" | "pantry">("shopping");
  const current = data[activeRange];
  const items = current.items;
  const factor = current.factor;
  const grouped = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const item of items) {
      const key = item.category || "Sonstiges";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const order = [
      "Protein",
      "Kohlenhydrate",
      "Gemüse & Obst",
      "Gemüse",
      "Milchprodukte",
      "Saucen, Gewürze & Vorrat",
      "Saucen & Vorrat",
      "Shakes",
      "Sonstiges",
    ];
    return [...map.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    );
  }, [items]);

  const allVisibleItems = useMemo(() => {
    const map = new Map<string, ShoppingItem>();
    for (const payload of Object.values(data)) {
      for (const item of payload.items) {
        if (!map.has(item.key)) map.set(item.key, item);
      }
      for (const pantryItem of payload.pantryCatalog || []) {
        if (!map.has(pantryItem.key)) {
          map.set(pantryItem.key, {
            key: pantryItem.key,
            name: pantryItem.name,
            amount: 1,
            amountText: "zuhause",
            unit: "prüfen",
            recipes: [],
            category: pantryItem.category,
            inPantry: pantryItem.inPantry,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [data]);

  const pantryItems = current.pantryItems || {};

  const ranges: { key: ShoppingRange; label: string; sub: string }[] = [
    { key: "all", label: "Woche", sub: "alles" },
    { key: "mon-thu", label: "Mo–Do", sub: "Einkauf 1" },
    { key: "fri-sun", label: "Fr–So", sub: "Einkauf 2" },
  ];

  return (
    <main className="page-wrap shopping-wrap">
      <section className="page-head shopping-head">
        <div>
          <p className="eyebrow">Für die Woche</p>
          <h1>Einkaufsliste</h1>
          <p>
            Berechnet für ca. {factor.toFixed(1).replace(".", ",")} Portionen
            pro Mahlzeit. Fleischkosten sind auf 0 € gesetzt. Haken und
            Zuhause-Liste werden auf dem Server gespeichert.
          </p>
        </div>
        <div className="shopping-summary">
          <strong>{formatEuro(current.totalEstimatedCost)}</strong>
          <span>geschätzt für {current.rangeLabel}</span>
        </div>
      </section>

      <div className="range-tabs two-level">
        <button className={tab === "shopping" ? "active" : ""} onClick={() => setTab("shopping")}>
          Einkauf
        </button>
        <button className={tab === "pantry" ? "active" : ""} onClick={() => setTab("pantry")}>
          Habe ich zuhause
        </button>
      </div>

      {tab === "shopping" && (
        <>
          <div className="range-tabs">
            {ranges.map((range) => (
              <button
                key={range.key}
                className={activeRange === range.key ? "active" : ""}
                onClick={() => setActiveRange(range.key)}
              >
                <strong>{range.label}</strong>
                <small>{range.sub}</small>
              </button>
            ))}
          </div>

          <section className="shopping-board pretty-shopping">
            {grouped.map(([category, categoryItems]) => (
              <article className="shopping-category" key={category}>
                <div className="shopping-category-title">
                  <h2>{category}</h2>
                  <span>{categoryItems.length} Positionen</span>
                </div>
                <div className="shopping-category-list">
                  {categoryItems.map((item) => (
                    <div className={`shopping-row ${item.checked ? "is-checked" : ""} ${item.inPantry ? "is-pantry" : ""}`} key={item.key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(item.checked)}
                          onChange={(e) => onCheckedChange(activeRange, item.key, e.target.checked)}
                        />
                        <strong>{item.name}</strong>
                      </label>
                      <span>{item.amountText || `${item.amount} ${item.unit}`}</span>
                      <em>{formatEuro(item.estimatedCost)}</em>
                      <div className="shopping-row-actions">
                        <button
                          type="button"
                          className="tiny"
                          onClick={() => onPantryChange(item.key, !item.inPantry, item.name, item.category)}
                          title={item.inPantry ? "Nicht mehr als zuhause markieren" : "Dauerhaft als zuhause vorhanden merken"}
                        >
                          {item.inPantry ? "Zuhause ✓" : "Zuhause"}
                        </button>
                      </div>
                      <small>
                        {item.source ? `${item.source} · ` : ""}
                        {item.recipes.join(", ")}
                      </small>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {tab === "pantry" && (
        <section className="pantry-board">
          <p className="hint">
            Alles, was hier aktiviert ist, wird künftig nicht mehr auf die
            Einkaufsliste gesetzt. Praktisch für Honig, Öl, Salz, Pfeffer,
            Sojasauce, Reis-Vorrat usw.
          </p>
          <div className="pantry-grid">
            {allVisibleItems.map((item) => (
              <label className="pantry-item" key={item.key}>
                <input
                  type="checkbox"
                  checked={Boolean(pantryItems[item.key])}
                  onChange={(e) => onPantryChange(item.key, e.target.checked, item.name, item.category)}
                />
                <span>{item.name}</span>
                <small>{item.category}</small>
              </label>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function HistoryView({ archive }: { archive: ArchiveEntry[] }) {
  return (
    <main className="page-wrap history-wrap">
      <section className="page-head">
        <div>
          <p className="eyebrow">Gespeicherte Wochen</p>
          <h1>Verlauf</h1>
          <p>Hier siehst du, welche Wochenpläne bisher erstellt wurden.</p>
        </div>
      </section>

      <section className="history-list">
        {archive.length === 0 && <p>Noch kein Verlauf vorhanden.</p>}
        {archive.map((entry) => (
          <article className="history-card" key={entry.id}>
            <div>
              <h2>
                Woche vom{" "}
                {new Date(entry.createdAt).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </h2>
              <p>{entry.recipeCount} Mahlzeiten</p>
            </div>
            <div className="history-days">
              {entry.days.map((day) => (
                <div key={day.day}>
                  <strong>{day.day}</strong>
                  <span>{day.meals.map((meal) => meal.name).join(" · ")}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function RecipeDetail({
  recipe,
  back,
  importRecipe,
}: {
  recipe: Recipe;
  back: () => void;
  importRecipe: (recipe: Recipe) => void;
}) {
  return (
    <main className="recipe-detail-wrap">
      <section className="recipe-hero">
        <div className="recipe-hero-image">
          <img src={recipe.imageUrl} alt={recipe.name} />
        </div>
        <div className="recipe-hero-card">
          <p className="eyebrow">Kochansicht</p>
          <h1>{recipe.name}</h1>
          <p>
            {recipe.kcal} kcal • {recipe.protein} g Protein •{" "}
            {recipe.durationMinutes} Min. • {recipe.tier}
          </p>
          <div className="recipe-actions">
            <button className="secondary" onClick={back}>
              Zurück
            </button>
            {recipe.sourceUrl && (
              <a
                className="secondary link-button"
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Original öffnen
              </a>
            )}
            {recipe.sourceUrl && (
              <button className="primary" onClick={() => importRecipe(recipe)}>
                <DownloadCloud size={18} /> Bilder/Zutaten/Anleitung neu importieren
              </button>
            )}
          </div>
          {recipe.importedAt && (
            <small className="import-note">
              Zuletzt importiert:{" "}
              {new Date(recipe.importedAt).toLocaleString("de-DE")}
            </small>
          )}
        </div>
      </section>

      <section className="recipe-two-col">
        <article className="ingredients-card">
          <h2>Zutaten</h2>
          <ul>
            {(recipe.ingredients || []).slice(0, 28).map((ingredient, i) => (
              <li key={`${ingredient}-${i}`}>{ingredient}</li>
            ))}
          </ul>
        </article>
        <article className="nutrition-card">
          <h2>Nährwerte</h2>
          <dl>
            <div>
              <dt>Kalorien</dt>
              <dd>{recipe.kcal} kcal</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{recipe.protein} g</dd>
            </div>
            <div>
              <dt>Dauer</dt>
              <dd>{recipe.durationMinutes} Min.</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="steps-section">
        <h2>Zubereitung</h2>
        {recipe.instructions && recipe.instructions.length > 0 ? (
          <div className="steps-list">
            {recipe.instructions.map((step, index) => (
              <article className="step-card" key={`${step.title}-${index}`}>
                {step.imageUrl ? (
                  <img src={step.imageUrl} alt="" />
                ) : (
                  <div className="step-placeholder">{index + 1}</div>
                )}
                <div className="step-text">
                  <span>{index + 1}</span>
                  <p>{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-steps">
            <p>
              Für dieses Rezept ist noch keine lokale
              Schritt-für-Schritt-Anleitung importiert.
            </p>
            {recipe.sourceUrl && (
              <button className="primary" onClick={() => importRecipe(recipe)}>
                <DownloadCloud size={18} /> Von HelloFresh importieren
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function PrintView({ plan, back }: { plan: WeekPlan; back: () => void }) {
  const [orientation, setOrientation] = useState<PrintOrientation>("portrait");
  return (
    <main className={`print-shell print-${orientation}`}>
      <style>{`@media print { @page { size: A4 ${orientation}; margin: 0; } }`}</style>
      <div className="print-actions">
        <button onClick={back}>Zurück</button>
        <button
          onClick={() =>
            setOrientation(
              orientation === "portrait" ? "landscape" : "portrait",
            )
          }
        >
          <Layout size={18} />{" "}
          {orientation === "portrait" ? "Querformat" : "Hochkant"}
        </button>
        <button className="primary" onClick={() => window.print()}>
          <Printer size={18} /> Jetzt drucken
        </button>
      </div>
      <section className="print-page">
        <div className="leaf left">✦</div>
        <div className="leaf right">✦</div>
        <h1>Wochenplan</h1>
        <p className="print-subtitle">
          2 Mahlzeiten pro Tag • Ziel: ca. 2300 kcal / 180 g Protein •
          zusätzlich täglich ESN-Shakes
        </p>
        <p className="print-note">Mahlzeitenwerte ohne Shakes</p>
        <div className="print-week">
          {plan.days.map((day) => (
            <div className="print-row" key={day.day}>
              <div className="print-day">{day.day}</div>
              {day.meals.map((slot) => (
                <div
                  className="print-meal"
                  key={`${day.day}-${slot.mealIndex}`}
                >
                  <img src={slot.recipe.imageUrl} alt="" />
                  <div>
                    <h2>{slot.recipe.name}</h2>
                    <p>
                      {slot.recipe.kcal} kcal • {slot.recipe.protein} g Protein
                      • {slot.recipe.durationMinutes} Min.
                    </p>
                  </div>
                </div>
              ))}
              <div className="print-shake">
                <span>🥤</span>
                <strong>Shakes:</strong>
                <small>
                  {day.shakes.length ? day.shakes.join(" + ") : "keine"}
                </small>
              </div>
            </div>
          ))}
        </div>
        <footer>♡ Guten Appetit ♡</footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
