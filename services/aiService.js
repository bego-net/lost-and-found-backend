import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

/* ==========================================
   SIMPLE TEXT SIMILARITY (PRE-FILTER)
   This reduces AI cost dramatically
========================================== */

function quickSimilarity(text1, text2) {

  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const common = words1.filter((w) => words2.includes(w));

  return common.length / Math.max(words1.length, words2.length);
}

export async function compareItems(newItemText, items) {

  try {

    /* =====================================
       STEP 1: Pre-filter before AI
       Only send potentially similar items
    ===================================== */

    const filtered = items.filter((item) => {

      const itemText = `${item.title} ${item.description} ${item.location}`;

      const score = quickSimilarity(newItemText, itemText);

      return score > 0.1; // small threshold
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
          `${index}. Title: ${item.title}, Description: ${item.description}, Location: ${item.location}`
      )
      .join("\n");

    const prompt = `
You are an AI that compares lost-and-found items.

A new item was posted:

"${newItemText}"

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
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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