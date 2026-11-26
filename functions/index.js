// DiTect MVP 0.1 backend — one Cloud Function (2nd gen) serving two routes:
//   GET  /api/challenge  -> issues a random, short-lived challenge (gesture + spoken digits)
//   POST /api/verify     -> checks a live clip with Gemini and returns a verdict
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const { randomChallenge } = require("./challenges");

admin.initializeApp();
const db = admin.firestore();
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Pick the newest Flash model listed in AI Studio and put its exact name here.
const MODEL = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
const CHALLENGE_TTL_MS = 2 * 60 * 1000; // challenge valid for 2 minutes
// Model chain: tried in order until one answers.
const MODEL_CHAIN = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];
// Firebase Hosting cuts requests off at ~60s, so the whole chain must finish in 50s.
const TOTAL_BUDGET_MS = 50000;
const PER_CALL_MS = 15000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms)),
  ]);
}

async function callGemini(ai, req) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastErr = new Error("NO_MODEL_TRIED");

  for (const m of MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) throw lastErr; // out of time: give up cleanly

      try {
        const res = await withTimeout(
          ai.models.generateContent({ ...req, model: m }),
          Math.min(PER_CALL_MS, remaining)
        );
        return { res, modelUsed: m };
      } catch (e) {
        lastErr = e;
        console.warn(`Gemini fail model=${m} attempt=${attempt}:`, e?.message || e);
        const msg = String(e?.status || e?.message || e);
        // Only retry the same model if it was busy; otherwise jump to the next model.
        if (!/503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg)) break;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function manualReview(reason) {
  return { verdict: "MANUAL_REVIEW", reasons: [reason], ruleReasons: [reason], confidence: 0 };
}

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "system_prompt.md"), "utf8");
const JSON_SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, "response_schema.json"), "utf8"));

// Convert plain JSON Schema into the Gemini responseSchema format (types in upper case).
function toGeminiSchema(s) {
  const out = { type: String(s.type).toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toGeminiSchema(v);
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.required) out.required = s.required;
  if (s.enum) out.enum = s.enum;
  return out;
}
const RESPONSE_SCHEMA = toGeminiSchema(JSON_SCHEMA);

// Deterministic verdict on top of Gemini's observations, so judges can see the rules.
function decide(r, expectedDigits) {
  const heard = String(r.spoken_digits || "").replace(/\D/g, "");
  const codeMatches = heard === expectedDigits;
  const reasons = [];
  if (r.screen_recapture_suspected) reasons.push("Looks like a screen was filmed");
  if (r.ai_manipulation_suspected) reasons.push("Signs of AI generation or editing");
  if (!r.challenge_gesture_performed) reasons.push("Requested gesture not performed");
  if (!codeMatches) reasons.push(`Spoken code mismatch (expected ${expectedDigits}, heard ${heard || "nothing"})`);
  if (!r.damage_visible) reasons.push("No clear damage visible");
  if (r.damage_visible && !r.damage_consistent_across_frames) reasons.push("Damage changes between frames");

  let verdict = "VERIFIED";
  if (r.screen_recapture_suspected || r.ai_manipulation_suspected) verdict = "REJECTED";
  else if (reasons.length > 0) verdict = "SUSPICIOUS";
  return { verdict, codeMatches, ruleReasons: reasons };
}

async function issueChallenge(res) {
  const { gesture, digits } = randomChallenge();
  const ref = await db.collection("challenges").add({
    gesture,
    digits,
    used: false,
    createdAt: Date.now(),
  });
  res.json({ challengeId: ref.id, gesture, digits, ttlSeconds: CHALLENGE_TTL_MS / 1000 });
}

async function verifyClaim(req, res) {
  const { challengeId, video, mimeType, orderId } = req.body || {};
  if (!challengeId || !video || !mimeType) return res.status(400).json({ error: "challengeId, video and mimeType are required" });

  // 1. Challenge must exist, be fresh and unused (stops replaying an old recording).
  const chRef = db.collection("challenges").doc(challengeId);
  const ch = await db.runTransaction(async (tx) => {
    const snap = await tx.get(chRef);
    if (!snap.exists) return { error: "Unknown challenge" };
    const c = snap.data();
    if (c.used) return { error: "Challenge already used" };
    if (Date.now() - c.createdAt > CHALLENGE_TTL_MS) return { error: "Challenge expired" };
    tx.update(chRef, { used: true });
    return c;
  });
  if (ch.error) return res.status(409).json({ verdict: "REJECTED", error: ch.error });

  // 2. Hash the exact bytes received: tamper-evident fingerprint of the evidence.
  const bytes = Buffer.from(video, "base64");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  // 3. Ask Gemini to read the clip.
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
  const cleanMime = String(mimeType).split(";")[0]; // "video/webm;codecs=..." -> "video/webm"
  const userText =
    `Challenge shown to the customer during recording:\n` +
    `- Gesture: ${ch.gesture}\n` +
    `- Spoken code: the customer was asked to say three digits aloud.\n` +
    (orderId ? `Order ID on record: ${orderId}\n` : "") +
    `Assess the video now.`;

  const started = Date.now();
let result, modelUsed = null;
try {
  const out = await callGemini(ai, {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: cleanMime, data: video } }, { text: userText }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });
  result = out.res;
  modelUsed = out.modelUsed;
} catch (e) {
  console.error("All models failed:", e?.message || e);
  return res.json({
    ...manualReview("Automated check unavailable: " + String(e?.message || e).slice(0, 300)),
    modelUsed: null,
    latencyMs: Date.now() - started,
  });
}
  let gemini;
try {
  gemini = JSON.parse(result.text);
} catch {
  return res.json({
    ...manualReview("AI returned unreadable output. Routed to human review."),
    modelUsed,
    latencyMs: Date.now() - started,
  });
}
  const decision = decide(gemini, ch.digits);

  const labelMatchesOrder = orderId && gemini.label_text
    ? gemini.label_text.replace(/\s/g, "").toUpperCase().includes(String(orderId).replace(/\s/g, "").toUpperCase())
    : null;

  // 4. Store the claim record.
  const claim = {
    createdAt: Date.now(),
    orderId: orderId || null,
    challenge: { gesture: ch.gesture, digits: ch.digits },
    model: modelUsed,
    latencyMs: Date.now() - started,
    videoSha256: sha256,
    videoBytes: bytes.length,
    gemini,
    verdict: decision.verdict,
    codeMatches: decision.codeMatches,
    labelMatchesOrder,
    ruleReasons: decision.ruleReasons,
  };
  const claimRef = await db.collection("claims").add(claim);
  res.json({ claimId: claimRef.id, ...claim });
}

exports.api = onRequest(
  { secrets: [GEMINI_API_KEY], region: "asia-south1", memory: "1GiB", timeoutSeconds: 120, cors: true },
  async (req, res) => {
    try {
      if (req.method === "GET" && req.path.endsWith("/challenge")) return await issueChallenge(res);
      if (req.method === "POST" && req.path.endsWith("/verify")) return await verifyClaim(req, res);
      res.status(404).json({ error: "Not found" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: String(err.message || err) });
    }
  }
);
