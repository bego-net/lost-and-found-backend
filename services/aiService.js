import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

/* ==========================================
   SIMPLE TEXT SIMILARITY (PRE-FILTER)
   This reduces AI cost dramatically
========================================== */

function quickSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\s+/).filter(Boolean);
  const words2 = text2.toLowerCase().split(/\s+/).filter(Boolean);

  if (!words1.length || !words2.length) return 0;

  const set2 = new Set(words2);
  const common = words1.filter((w) => set2.has(w));

  return common.length / Math.max(words1.length, words2.length);
}

function computeSimilarityScore(newItem, item) {
  const titleDesc1 = `${newItem.title} ${newItem.description}`.trim();
  const titleDesc2 = `${item.title} ${item.description}`.trim();
  const location1 = `${newItem.location || ""}`.trim();
  const location2 = `${item.location || ""}`.trim();

  const titleDescScore = quickSimilarity(titleDesc1, titleDesc2);
  const locationScore = quickSimilarity(location1, location2);
  const categoryScore = newItem.category === item.category ? 1 : 0;
  const typeScore = newItem.type !== item.type ? 1 : 0;

  const weighted =
    titleDescScore * 0.5 +
    locationScore * 0.2 +
    categoryScore * 0.2 +
    typeScore * 0.1;

  return Math.round(weighted * 100);
}

export async function compareItems(newItem, items) {

  try {
    const apiKey =
      process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const scored = items
        .map((item, index) => ({
          index,
          similarity: computeSimilarityScore(newItem, item),
        }))
        .filter((result) => result.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);

      return scored;
    }

    /* =====================================
       STEP 1: Pre-filter before AI
       Only send potentially similar items
    ===================================== */

    const filtered = items.filter((item) => {
      const itemText = `${item.title} ${item.description} ${item.category} ${item.location} ${item.type}`;
      const newItemText = `${newItem.title} ${newItem.description} ${newItem.category} ${newItem.location} ${newItem.type}`;

      const score = quickSimilarity(newItemText, itemText);

      return score > 0.1;
    });

    /* Limit items sent to AI */
    const itemsToSend = filtered.slice(0, 15);

    if (!itemsToSend.length) {
      return [];
    }

    /* =====================================
       STEP 2: Format items for AI
    ===================================== */

    const formattedItems = itemsToSend
      .map(
        (item, index) =>
          `${index}. Title: ${item.title}, Description: ${item.description}, Category: ${item.category}, Location: ${item.location}, Type: ${item.type}`
      )
      .join("\n");

    const prompt = `
You are an AI that compares lost-and-found items.

A new item was posted:

"${newItem.title} ${newItem.description} ${newItem.category} ${newItem.location} ${newItem.type}"

Compare it with the following items and estimate similarity.

Similarity rules:
0-40 = different items
40-60 = somewhat similar
60-80 = likely match
80-100 = very strong match

Items:
${formattedItems}

Return ONLY JSON array like this:

[
 { "index": 0, "similarity": 92 },
 { "index": 3, "similarity": 75 }
]
`;

    /* =====================================
       STEP 3: Call OpenRouter
    ===================================== */

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      console.error("OpenRouter API error");
      return [];
    }

    const data = await response.json();

    const content = data?.choices?.[0]?.message?.content;

    if (!content) return [];

    /* =====================================
       STEP 4: Extract JSON safely
    ===================================== */

    let parsed;

    try {

      const jsonMatch = content.match(/\[.*\]/s);

      if (!jsonMatch) {

        console.log("AI returned non JSON:", content);

        return [];
      }

      parsed = JSON.parse(jsonMatch[0]);

    } catch (err) {

      console.log("AI returned invalid JSON:", content);

      return [];

    }

    return parsed;

  } catch (error) {

    console.error("AI Error:", error);

    return [];

  }
}
