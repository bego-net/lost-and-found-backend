import { compareItems } from "../services/aiService.js";

export const findMatches = async (newItem, itemsToCompare) => {
  try {
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
    const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);

    if (!hasOpenAiKey && !hasOpenRouterKey) {
      console.log(
        "AI matching skipped: OPENAI_API_KEY/OPENROUTER_API_KEY not set."
      );
      return { matches: [], notifications: [] };
    }

    if (!itemsToCompare || !itemsToCompare.length) {
      return { matches: [], notifications: [] };
    }

    /* =====================================
       STEP 1: Filter by category first
       This reduces AI workload
    ===================================== */

    const filteredItems = itemsToCompare.filter(
      (item) =>
        item.category === newItem.category &&
        item.user.toString() !== newItem.user.toString()
    );

    if (!filteredItems.length) {
      return { matches: [], notifications: [] };
    }

    /* =====================================
       STEP 2: Build text for AI
    ===================================== */

    const newItemText = `${newItem.title} ${newItem.description} ${newItem.category} ${newItem.location}`;

    console.log("New Item Text:", newItemText);

    const aiResults = await compareItems(newItemText, filteredItems);

    console.log("AI Results:", aiResults);

    if (!Array.isArray(aiResults)) {
      return { matches: [], notifications: [] };
    }

    let matches = [];
    let notifications = [];

    /* =====================================
       STEP 3: Process AI similarity results
    ===================================== */

    aiResults.forEach((result) => {

      const matchedItem = filteredItems[result.index];

      if (!matchedItem) return;

      /* -------------------------
         Suggestion threshold
      ------------------------- */
      if (result.similarity >= 60) {

        matches.push({
          item: matchedItem,
          similarity: result.similarity,
        });

      }

      /* -------------------------
         Notification threshold
      ------------------------- */
      if (result.similarity >= 80) {

        notifications.push({
          receiver: matchedItem.user,
          item: newItem._id,
          similarity: result.similarity,
        });

      }

    });

    /* =====================================
       STEP 4: Sort best matches
    ===================================== */

    matches.sort((a, b) => b.similarity - a.similarity);

    /* =====================================
       STEP 5: Limit suggestions
    ===================================== */

    matches = matches.slice(0, 5);

    console.log("Matches Found:", matches);
    console.log("Notification Matches:", notifications);

    return { matches, notifications };

  } catch (error) {

    console.error("Match error:", error);

    return { matches: [], notifications: [] };

  }
};
