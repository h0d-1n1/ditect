# DiTect: setup and the Google stack

## 1. Which Google product does which job

| Job | Use this | Status |
|---|---|---|
| Test prompts and pick a model | **Google AI Studio** (aistudio.google.com) | Do on the way |
| Video and audio understanding, verdict JSON | **Gemini API, Flash model** via `@google/genai` | Brought in (v0.1) |
| Cheap pre-screen before Flash | **Gemini Flash-Lite** | Build on site |
| Second look at borderline cases | **Gemini Pro** | Build on site |
| Hosting for the capture page | **Firebase Hosting** | Brought in |
| Backend API | **Cloud Functions for Firebase (2nd gen, runs on Cloud Run)** | Brought in |
| Challenges and claim records | **Cloud Firestore** | Brought in |
| Keeping the API key secret | **Secret Manager** (`defineSecret`) | Brought in |
| Storing raw evidence clips | **Cloud Storage** with a retention lock | Build on site |
| Catching the same photo reused across claims | **Vertex AI multimodal embeddings** + **Firestore vector search** (Vector Search if there's time) | Build on site, **your best demo moment** |
| Flagging AI-generated media | **SynthID Detector / AI content detection** if mentors give you access; otherwise lean on Gemini's own checks | Ask a mentor on day 1 |
| Signed verdicts that can't be edited | **Cloud KMS** (asymmetric sign) | Build on site |
| Making fake claims to test against | **Nano Banana** (Gemini image model) / **Veo** | Build on site |
| Analytics for the dashboard | **BigQuery** (Firestore export) or a Firestore query | Stretch |
| Writing code faster | **Gemini Code Assist / Antigravity / Gemini CLI** | Use the whole time |
| Region | **asia-south1 (Mumbai)** for everything | Set |

Not Google products, so don't make them part of the scored build: OpenAI, Claude, Vercel, Supabase or AWS. Git and GitHub are fine.

## 2. On the way there (phone or laptop, about 45 minutes)

1. **AI Studio:** get an API key (Get API key → Create). Write down the exact name of the newest Flash model in the model dropdown.
2. **AI Studio prompt test:**
   - Paste `prompts/system_prompt.md` into System instructions.
   - Turn on Structured output and paste `prompts/response_schema.json`.
   - Set temperature to 0.
   - Upload a real 8-second phone clip in which you show a damaged item, do a gesture and say 3 digits.
   - Check the JSON. Fix the prompt now, not on site.
3. **Shoot your test set** (this is the most valuable 20 minutes):
   - 5 genuine clips covering different items and gestures
   - 3 clips of you filming a laptop screen that's playing a damage photo, to test screen recapture
   - 2 clips where you say the wrong digits
   - 2 clips with no damage
   - 5 Nano Banana edited "damaged" images, played on a screen and filmed
4. **Firebase console:** create project `ditect-<something>`, choose region asia-south1 and switch to the **Blaze plan**. Blaze needs a card. Ask the organisers on day 1 whether credits cover it, since the free tier covers this demo anyway.
5. **Laptop:**
   ```bash
   npm i -g firebase-tools
   firebase login
   cd ditect-mvp
   # put your project id in .firebaserc
   firebase functions:secrets:set GEMINI_API_KEY   # paste the AI Studio key
   cd functions && npm install && cd ..
   firebase deploy
   ```
   Open the Hosting URL on **iPhone Safari and Android Chrome**. Run the full flow on each. Camera access only works over HTTPS, which Firebase Hosting gives you.
6. If the model alias fails, edit `MODEL` in `functions/index.js` to the exact name from step 1.
7. Commit and tag:
   ```bash
   git add -A && git commit -m "Pre-buildathon foundation"
   git tag pre-buildathon
   ```
   Push to a GitHub repo now so the timestamp is public.

Prompts are read from `functions/system_prompt.md` and `functions/response_schema.json`. The copies in `prompts/` are the reference versions, so keep both in sync.

## 3. Day 2 build order (stop at whatever step you reach by the build freeze)

1. **Duplicate detection** (2–3 hours):
   - Extract 3 frames (or use the best frame Gemini names) → Vertex multimodal embedding → store in Firestore with a vector index.
   - Look up nearest neighbours on every claim, with a distance threshold, and flag "seen before in claim X".
   - Demo: submit the same damage twice from two "customers".
2. **Tiered models** (1 hour): Flash-Lite answers "is there an item and a person and audio?" first, and only then calls Flash. Pro runs when confidence is under 0.6. Show cost per claim.
3. **Merchant dashboard** (1–2 hours): a second page that lists `claims`, with verdict, reasons and frames.
4. **KMS-signed verdict** (1 hour): sign `{claimId, sha256, verdict, ts}` and show "verify signature".
5. **Red-team scoreboard** (30 minutes): run your test set and show the catch rate as a number on a slide.
6. Stretch: Cloud Storage retention lock, BigQuery, Gemini Live for live guidance.

**Freeze the build 2 hours before judging.** After that, only rehearse the demo and fix bugs.

## 4. Things that will bite you

- **iPhone Safari** records `video/mp4`, and the code handles it. Test it anyway.
- **Request size:** 8 seconds at 1 Mbps is about 1 MB, or about 1.4 MB as base64. That's fine. Don't raise the bitrate or the length much, because the Cloud Functions body limit is about 10 MB. For longer clips, upload to Cloud Storage and pass the URI.
- **Venue Wi-Fi:** keep a phone hotspot ready, and record a backup screen video of the full flow working.
- **Model name errors:** if you get a 404 on the model, the alias changed. Use the exact name from AI Studio.
- **Gemini sometimes misses digits.** Tell users to say them slowly. The verdict marks a miss as SUSPICIOUS, not REJECTED, by design.
