import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const VISION_SERVICE_URL = process.env.VISION_SERVICE_URL || "http://localhost:8000";
const VISION_SERVICE_TIMEOUT = parseInt(process.env.VISION_SERVICE_TIMEOUT || "10000", 10);
const RANKING_TIMEOUT = parseInt(process.env.VISION_RANKING_TIMEOUT || "30000", 10);
const DEFAULT_MODEL_NAME = process.env.CLIP_MODEL_NAME || "openai/clip-vit-base-patch32";
const DEFAULT_MODEL_VERSION = process.env.CLIP_MODEL_VERSION || "v1";

/**
 * Resolve image path or URL into a File/Buffer/Stream payload.
 */
function resolveLocalPath(imagePath) {
  if (!imagePath) return null;
  const sanitized = imagePath.replace(/\\/g, "/");
  if (sanitized.startsWith("/")) {
    return path.join(process.cwd(), sanitized.replace(/^\/+/, ""));
  }
  return path.join(process.cwd(), sanitized);
}

/**
 * Generate a CLIP embedding for a single image by sending it to the Vision AI FastAPI service.
 * Handles both local disk files and remote Cloudinary URLs.
 * Gracefully returns null if the Vision Service is unavailable or errors out.
 *
 * @param {string} imagePathOrUrl
 * @returns {Promise<{ imageUrl: string, embedding: number[], modelName: string, modelVersion: string, createdAt: Date } | null>}
 */
export async function generateEmbeddingForImage(imagePathOrUrl) {
  if (!imagePathOrUrl || typeof imagePathOrUrl !== "string") {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_SERVICE_TIMEOUT);

  try {
    const formData = new FormData();
    const isRemote = /^https?:\/\//i.test(imagePathOrUrl);

    if (isRemote) {
      // Remote image (e.g. Cloudinary)
      const imageRes = await fetch(imagePathOrUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to download remote image from ${imagePathOrUrl}: HTTP ${imageRes.status}`);
      }
      const arrayBuffer = await imageRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filename = path.basename(new URL(imagePathOrUrl).pathname) || "image.png";
      const blob = new Blob([buffer], { type: imageRes.headers.get("content-type") || "image/png" });
      formData.append("file", blob, filename);
    } else {
      // Local disk image
      const absolutePath = resolveLocalPath(imagePathOrUrl);
      if (!fs.existsSync(absolutePath)) {
        console.warn(`[VisionService] Local image file not found at: ${absolutePath}`);
        return null;
      }
      const fileBuffer = await fs.promises.readFile(absolutePath);
      const filename = path.basename(absolutePath);
      const blob = new Blob([fileBuffer], { type: "image/png" });
      formData.append("file", blob, filename);
    }

    const response = await fetch(`${VISION_SERVICE_URL}/embed`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision service HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.embedding)) {
      throw new Error("Invalid embedding response structure received from vision service");
    }

    return {
      imageUrl: imagePathOrUrl,
      embedding: data.embedding,
      modelName: data.model_name || DEFAULT_MODEL_NAME,
      modelVersion: data.model_version || DEFAULT_MODEL_VERSION,
      createdAt: data.created_at ? new Date(data.created_at) : new Date(),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn(`[VisionService] Timeout (${VISION_SERVICE_TIMEOUT}ms) requesting embedding for image: ${imagePathOrUrl}`);
    } else {
      console.warn(`[VisionService] Embedding generation skipped/failed for ${imagePathOrUrl}:`, error.message);
    }
    return null;
  }
}

/**
 * Batch process an array of image URLs/paths and return array of embedding objects.
 *
 * @param {string[]} imageUrls
 * @returns {Promise<Array<{ imageUrl: string, embedding: number[], modelName: string, modelVersion: string, createdAt: Date }>>}
 */
export async function processItemImages(imageUrls = []) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }

  const results = await Promise.all(
    imageUrls.map((url) => generateEmbeddingForImage(url))
  );

  return results.filter((res) => res !== null);
}

/**
 * Send candidate embeddings and target embeddings to FastAPI Vision Service for matrix cosine ranking.
 *
 * @param {Array<number[]>} targetEmbeddings
 * @param {Array<{ id: string, embeddings: Array<number[]> }>} candidates
 * @returns {Promise<Map<string, number> | null>} Map of candidateId -> similarity score (0.0 to 1.0)
 */
export async function rankImageCandidates(targetEmbeddings = [], candidates = []) {
  // Filter out candidates with no embeddings before sending to vision service
  const validCandidates = candidates.filter((c) => c.embeddings && c.embeddings.length > 0);

  if (!targetEmbeddings.length || !validCandidates.length) {
    console.log(`[VisionService] Ranking skipped: ${targetEmbeddings.length} target embeddings, ${validCandidates.length}/${candidates.length} candidates with embeddings`);
    return new Map();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RANKING_TIMEOUT);

  try {
    console.log(`[VisionService] Ranking ${validCandidates.length} candidates (${candidates.length - validCandidates.length} skipped - no embeddings) against ${targetEmbeddings.length} target embeddings`);

    const payload = {
      target_embeddings: targetEmbeddings,
      candidates: validCandidates.map((c) => ({
        id: c.id.toString(),
        embeddings: c.embeddings,
      })),
    };

    const response = await fetch(`${VISION_SERVICE_URL}/rank-candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vision ranking service HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const scoreMap = new Map();

    if (data && Array.isArray(data.scores)) {
      for (const item of data.scores) {
        scoreMap.set(item.id, item.similarity);
      }
      console.log(`[VisionService] Ranking complete: ${data.scores.length} scores returned`);
    }

    return scoreMap;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.error(`[VisionService] Ranking TIMED OUT after ${RANKING_TIMEOUT}ms with ${validCandidates.length} candidates`);
    } else {
      console.error("[VisionService] Vector ranking FAILED:", error.message);
    }
    return null;
  }
}
