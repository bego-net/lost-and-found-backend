import Item from "../models/Item.js";
import Match from "../models/Match.js";
import { rankImageCandidates } from "./visionService.js";

/**
 * Text token similarity using Jaccard index
 */
function quickTextSimilarity(text1 = "", text2 = "") {
  const words1 = text1.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const words2 = text2.toLowerCase().split(/\s+/).filter((w) => w.length > 1);

  if (!words1.length || !words2.length) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersection = 0;

  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Haversine formula to compute distance in km between two geo points
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Compute location similarity score (0.0 to 1.0)
 */
function computeLocationScore(itemA, itemB) {
  if (
    itemA.latitude != null &&
    itemA.longitude != null &&
    itemB.latitude != null &&
    itemB.longitude != null
  ) {
    const distKm = haversineDistance(
      itemA.latitude,
      itemA.longitude,
      itemB.latitude,
      itemB.longitude
    );
    // 0km -> 1.0, 50km or more -> 0.0
    return Math.max(0, 1 - distKm / 50);
  }

  // Fallback to text matching on location string
  return quickTextSimilarity(itemA.location || "", itemB.location || "");
}

/**
 * Compute date proximity score (0.0 to 1.0)
 */
function computeDateScore(itemA, itemB) {
  const dateA = new Date(itemA.dateLostOrFound || itemA.createdAt).getTime();
  const dateB = new Date(itemB.dateLostOrFound || itemB.createdAt).getTime();

  if (isNaN(dateA) || isNaN(dateB)) return 0.5;

  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  // 0 days -> 1.0, 30 days or more -> 0.0
  return Math.max(0, 1 - diffDays / 30);
}

/**
 * Check if an item has valid CLIP embeddings stored
 */
function hasValidEmbeddings(item) {
  return (
    Array.isArray(item.imageEmbeddings) &&
    item.imageEmbeddings.length > 0 &&
    item.imageEmbeddings.some(
      (e) => Array.isArray(e.embedding) && e.embedding.length > 0
    )
  );
}

/**
 * Main Hybrid Matcher calculation engine
 *
 * Scoring weights when vision is available:
 *   Vision: 55%  (primary signal — identical images should dominate)
 *   Text:   20%  (title + description Jaccard similarity)
 *   Category: 10%
 *   Location: 10%
 *   Date:     5%
 *
 * Scoring weights without vision (text-only fallback):
 *   Text: 45%, Category: 25%, Location: 20%, Date: 10%
 *
 * @param {Object} newItem Target item
 * @param {Array<Object>} candidates Candidate items from database
 * @returns {Promise<Array>}
 */
export async function computeHybridMatches(newItem, candidates = []) {
  if (!candidates || candidates.length === 0) {
    return { matches: [], notifications: [] };
  }

  // Extract CLIP target embeddings
  const targetEmbeddings = (newItem.imageEmbeddings || [])
    .map((e) => e.embedding)
    .filter((emb) => Array.isArray(emb) && emb.length > 0);

  // Build candidate embedding list (track which candidates actually have embeddings)
  const candidateHasEmbeddings = new Set();
  const candidateEmbeddingsList = candidates.map((c) => {
    const embeddings = (c.imageEmbeddings || [])
      .map((e) => e.embedding)
      .filter((emb) => Array.isArray(emb) && emb.length > 0);

    if (embeddings.length > 0) {
      candidateHasEmbeddings.add(c._id.toString());
    }

    return {
      id: c._id.toString(),
      embeddings,
    };
  });

  // Perform Vision Vector Ranking (only if target has embeddings)
  let visionScoreMap = null;
  let visionServiceAvailable = false;

  if (targetEmbeddings.length > 0 && candidateHasEmbeddings.size > 0) {
    console.log(`[HybridMatcher] Target has ${targetEmbeddings.length} embeddings, ${candidateHasEmbeddings.size}/${candidates.length} candidates have embeddings`);
    visionScoreMap = await rankImageCandidates(targetEmbeddings, candidateEmbeddingsList);

    if (visionScoreMap !== null) {
      visionServiceAvailable = true;
      console.log(`[HybridMatcher] Vision service returned scores for ${visionScoreMap.size} candidates`);
    } else {
      console.warn("[HybridMatcher] Vision service UNAVAILABLE — falling back to text-only scoring");
    }
  } else {
    console.log(`[HybridMatcher] Vision ranking skipped: target has ${targetEmbeddings.length} embeddings, ${candidateHasEmbeddings.size} candidates have embeddings`);
  }

  const results = [];

  for (const candidate of candidates) {
    const candId = candidate._id.toString();

    // 1. Text Similarity Score (0 to 1)
    const titleScore = quickTextSimilarity(newItem.title, candidate.title);
    const descScore = quickTextSimilarity(newItem.description, candidate.description);
    const textScore = titleScore * 0.6 + descScore * 0.4;

    // 2. Category Score (0 to 1)
    const categoryScore =
      newItem.category?.toLowerCase() === candidate.category?.toLowerCase() ? 1.0 : 0.0;

    // 3. Location Score (0 to 1)
    const locationScore = computeLocationScore(newItem, candidate);

    // 4. Date Score (0 to 1)
    const dateScore = computeDateScore(newItem, candidate);

    // 5. Vision Score (0 to 1)
    //    Only consider vision if:
    //    a) The vision service responded successfully (visionScoreMap is not null)
    //    b) This specific candidate actually had stored embeddings
    //    c) The vision service returned a score for this candidate
    let visionScore = 0;
    let useVisionWeights = false;

    if (
      visionServiceAvailable &&
      candidateHasEmbeddings.has(candId) &&
      visionScoreMap.has(candId)
    ) {
      visionScore = visionScoreMap.get(candId);
      useVisionWeights = true;
    }

    // Dynamic Weighting Strategy
    let overallScore = 0;
    if (useVisionWeights) {
      // Vision-dominant weights: 55% Vision, 20% Text, 10% Category, 10% Location, 5% Date
      overallScore =
        visionScore * 0.55 +
        textScore * 0.20 +
        categoryScore * 0.10 +
        locationScore * 0.10 +
        dateScore * 0.05;
    } else {
      // Text-only fallback weights: 45% Text, 25% Category, 20% Location, 10% Date
      overallScore =
        textScore * 0.45 +
        categoryScore * 0.25 +
        locationScore * 0.20 +
        dateScore * 0.10;
    }

    const overallPercentage = Math.round(overallScore * 100);

    // Debug logging for each candidate match
    console.log(
      `[HybridMatcher] ${candId.slice(-6)} | ` +
      `Overall: ${overallPercentage}% | ` +
      `Vision: ${Math.round(visionScore * 100)}%${useVisionWeights ? "" : " (N/A)"} | ` +
      `Text: ${Math.round(textScore * 100)}% (title=${Math.round(titleScore * 100)}% desc=${Math.round(descScore * 100)}%) | ` +
      `Cat: ${Math.round(categoryScore * 100)}% | ` +
      `Loc: ${Math.round(locationScore * 100)}% | ` +
      `Date: ${Math.round(dateScore * 100)}% | ` +
      `Mode: ${useVisionWeights ? "VISION" : "TEXT-ONLY"}`
    );

    results.push({
      candidate,
      scores: {
        overallScore: overallPercentage,
        visionScore: Math.round(visionScore * 100),
        textScore: Math.round(textScore * 100),
        titleScore: Math.round(titleScore * 100),
        descriptionScore: Math.round(descScore * 100),
        categoryScore: Math.round(categoryScore * 100),
        locationScore: Math.round(locationScore * 100),
        dateScore: Math.round(dateScore * 100),
      },
    });
  }

  // Filter candidates with score >= 30%
  const filtered = results.filter((res) => res.scores.overallScore >= 30);

  // Sort descending by overallScore
  filtered.sort((a, b) => b.scores.overallScore - a.scores.overallScore);

  console.log(`[HybridMatcher] ${filtered.length}/${results.length} candidates above 30% threshold`);

  return filtered;
}

/**
 * Compute, store in DB, and build notification list for an item
 */
export async function computeAndStoreMatches(newItem) {
  try {
    const oppositeType = newItem.type === "lost" ? "found" : "lost";

    // Candidate Pre-Selection from MongoDB
    const candidateItems = await Item.find({
      type: oppositeType,
      status: { $ne: "returned" },
      user: { $ne: newItem.user },
    }).lean();

    console.log(`[HybridMatcher] Computing matches for "${newItem.title}" (${newItem.type}) against ${candidateItems.length} ${oppositeType} candidates`);

    const hybridResults = await computeHybridMatches(newItem, candidateItems);

    const matchesToReturn = [];
    const notificationsToReturn = [];

    // Store matches in Match collection
    for (const res of hybridResults) {
      const { candidate, scores } = res;

      // Upsert Match records bidirectionally
      await Match.findOneAndUpdate(
        { sourceItem: newItem._id, targetItem: candidate._id },
        {
          sourceItem: newItem._id,
          targetItem: candidate._id,
          overallScore: scores.overallScore,
          visionScore: scores.visionScore,
          textScore: scores.textScore,
          categoryScore: scores.categoryScore,
          locationScore: scores.locationScore,
          dateScore: scores.dateScore,
          createdAt: new Date(),
        },
        { upsert: true, new: true }
      );

      matchesToReturn.push({
        item: candidate,
        similarity: scores.overallScore,
        scores,
      });

      // Notification threshold (Score >= 70%)
      if (scores.overallScore >= 70) {
        notificationsToReturn.push({
          receiver: candidate.user,
          item: newItem._id,
          similarity: scores.overallScore,
        });
      }
    }

    return {
      matches: matchesToReturn.slice(0, 10),
      notifications: notificationsToReturn,
    };
  } catch (error) {
    console.error("[HybridMatcher] Error computing and storing matches:", error);
    return { matches: [], notifications: [] };
  }
}
