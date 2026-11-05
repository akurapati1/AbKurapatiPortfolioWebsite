import { buildChunks, createIndex, answerOffline, assessFit, discoveryBrief } from "./shared/retrieval.js";

/** In-browser knowledge base: the same BM25 + rules used by the server's retrieval mode. */
export function createBrain(profile) {
  const chunks = buildChunks(profile);
  const index = createIndex(chunks);
  return {
    chunks,
    answer: (q) => answerOffline(q, profile, index),
    fit: (jd) => assessFit(jd, profile),
    discover: (text, industry = "") => discoveryBrief(`${industry} ${text}`, profile)
  };
}
