import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const seedPath = process.env.SEED_TERMS_PATH;
const seedUrl = process.env.SEED_TERMS_URL;
const seedUserId = process.env.SEED_USER_ID;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!seedPath && !seedUrl) {
  console.error("Provide SEED_TERMS_PATH or SEED_TERMS_URL");
  process.exit(1);
}

if (!seedUserId) {
  console.error("Provide SEED_USER_ID to import terms for a specific user");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function readSeedTerms(): Promise<string[]> {
  if (seedPath) {
    const absPath = path.resolve(seedPath);
    const raw = fs.readFileSync(absPath, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  if (seedUrl) {
    const res = await fetch(seedUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch seed terms: ${res.status}`);
    }
    const raw = await res.text();
    return raw
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return [];
}

async function main() {
  const terms = await readSeedTerms();
  console.log(`Loaded ${terms.length} seed terms`);

  const batches: string[][] = [];
  const size = 500;
  for (let i = 0; i < terms.length; i += size) {
    batches.push(terms.slice(i, i + size));
  }

  for (const batch of batches) {
    const payload = batch.map((term) => ({
      user_id: seedUserId,
      term,
      normalized_term: term.toLowerCase(),
      source: "seed",
    }));

    const { error } = await supabase.from("glossary_terms").upsert(payload, {
      onConflict: "user_id,term",
    });

    if (error) {
      console.error(error);
      process.exit(1);
    }
  }

  console.log("Seed terms import completed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

