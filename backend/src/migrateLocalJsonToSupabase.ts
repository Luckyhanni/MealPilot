import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { isSupabaseEnabled, writeStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "..", "data");

const files = [
  "recipes.json",
  "history.json",
  "settings.json",
  "pantry.json",
  "shoppingState.json",
];

async function main() {
  if (!isSupabaseEnabled()) {
    throw new Error(
      "SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.",
    );
  }

  for (const file of files) {
    const raw = await fs.readFile(path.join(dataDir, file), "utf-8");
    await writeStore(file, JSON.parse(raw));
    console.log(`${file} hochgeladen`);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? `Migration abgebrochen: ${error.message}`
      : "Migration abgebrochen.",
  );
  process.exit(1);
});
