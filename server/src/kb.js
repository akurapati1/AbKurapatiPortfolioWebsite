import fs from "node:fs";
import path from "node:path";
import { buildChunks, createIndex } from "../../assets/js/shared/retrieval.js";

/** Load data/profile.json once and build the BM25 index shared with the browser. */
export function loadKnowledgeBase(siteRoot) {
  const profile = JSON.parse(fs.readFileSync(path.join(siteRoot, "data", "profile.json"), "utf8"));
  const chunks = buildChunks(profile);
  return { profile, chunks, index: createIndex(chunks) };
}
