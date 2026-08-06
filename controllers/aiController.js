import Item from "../models/Item.js";
import Match from "../models/Match.js";
import { computeAndStoreMatches } from "../services/hybridMatcher.js";
import { matchCache } from "../services/cacheService.js";

/**
 * Perform hybrid vision + metadata matching on a new item and persist candidate matches
 */
export const findMatches = async (newItem) => {
  try {
    const result = await computeAndStoreMatches(newItem);
    matchCache.delete(`matches_${newItem._id}`);
    return result;
  } catch (error) {
    console.error("[AiController] findMatches Error:", error);
    return { matches: [], notifications: [] };
  }
};

/**
 * Controller: GET /api/items/:id/matches
 * Retrieves stored AI-suggested matches for an item (utilizes Memory Cache)
 */
export const getItemMatches = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `matches_${id}`;

    // Check memory cache first
    const cachedResponse = matchCache.get(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const item = await Item.findById(id).lean();
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Fetch stored matches from Match collection
    let matches = await Match.find({ sourceItem: id })
      .populate({
        path: "targetItem",
        populate: { path: "user", select: "name profileImage email" },
      })
      .sort({ overallScore: -1 })
      .limit(10)
      .lean();

    // If no stored matches exist yet, run on-demand calculation
    if (!matches || matches.length === 0) {
      await computeAndStoreMatches(item);
      matches = await Match.find({ sourceItem: id })
        .populate({
          path: "targetItem",
          populate: { path: "user", select: "name profileImage email" },
        })
        .sort({ overallScore: -1 })
        .limit(10)
        .lean();
    }

    // Format response
    const formattedMatches = matches
      .filter((m) => m.targetItem != null)
      .map((m) => ({
        _id: m._id,
        item: m.targetItem,
        similarity: m.overallScore,
        scores: {
          overallScore: m.overallScore,
          visionScore: m.visionScore,
          textScore: m.textScore,
          categoryScore: m.categoryScore,
          locationScore: m.locationScore,
          dateScore: m.dateScore,
        },
        matchedAt: m.createdAt,
      }));

    const responsePayload = {
      itemId: id,
      totalMatches: formattedMatches.length,
      matches: formattedMatches,
    };

    // Store in cache for 10 minutes
    matchCache.set(cacheKey, responsePayload, 600000);

    res.json(responsePayload);
  } catch (error) {
    console.error("[AiController] getItemMatches Error:", error);
    res.status(500).json({ message: "Failed to retrieve matches", error: error.message });
  }
};

/**
 * Controller: POST /api/items/:id/refresh-matches
 * Re-computes hybrid AI matches for an item on demand and flushes cache
 */
export const refreshItemMatches = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const { matches } = await computeAndStoreMatches(item);

    // Invalidate cache
    matchCache.delete(`matches_${id}`);

    res.json({
      message: "Matches recalculated successfully",
      itemId: id,
      totalMatches: matches.length,
      matches,
    });
  } catch (error) {
    console.error("[AiController] refreshItemMatches Error:", error);
    res.status(500).json({ message: "Failed to refresh matches", error: error.message });
  }
};
