import { matchCache } from "../services/cacheService.js";
import { computeHybridMatches } from "../services/hybridMatcher.js";

async function runTests() {
  console.log("=== Starting AI System & Caching Tests ===");
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Test 1: Memory Cache SET and GET
  matchCache.set("test_key", { data: "sample_matches" }, 5000);
  const cachedVal = matchCache.get("test_key");
  assert(cachedVal && cachedVal.data === "sample_matches", "Memory cache set/get operates correctly");

  // Test 2: Memory Cache Invalidation
  matchCache.delete("test_key");
  assert(matchCache.get("test_key") === null, "Memory cache deletion operates correctly");

  // Test 3: Hybrid Matcher calculation without Vision (Fallback mode)
  const targetItem = {
    _id: "target_123",
    title: "Black Leather iPhone 14 Pro",
    description: "Lost a black iPhone with leather case near library",
    category: "Electronics",
    location: "Main Library",
    type: "lost",
    dateLostOrFound: new Date(),
  };

  const candidates = [
    {
      _id: "cand_1",
      title: "Found Black iPhone 14",
      description: "iPhone with black leather case found on table",
      category: "Electronics",
      location: "Main Library 2nd Floor",
      type: "found",
      dateLostOrFound: new Date(),
    },
    {
      _id: "cand_2",
      title: "Blue Water Bottle",
      description: "Hydro flask left at gym",
      category: "Personal Items",
      location: "Sports Complex",
      type: "found",
      dateLostOrFound: new Date(),
    },
  ];

  const results = await computeHybridMatches(targetItem, candidates);
  assert(Array.isArray(results), "Hybrid matcher returns array of results");
  assert(results.length > 0, "High-confidence candidates are preserved");
  assert(results[0].candidate._id === "cand_1", "Relevant candidate receives highest overall rank");
  assert(results[0].scores.overallScore >= 50, `Relevant match gets high score (${results[0].scores.overallScore}%)`);

  console.log(`\n=== Test Summary: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
