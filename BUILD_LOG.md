# DiTect build log

The organisers allow prior work as a foundation but require that pre-built work be clearly distinguished from what was built on site. Git tag `pre-buildathon` marks the boundary.

## Brought in (before 20 Nov 2026), tag `pre-buildathon`
- Mobile capture page: camera only, no gallery upload, 8-second recording
- Random challenge (gesture + 3 spoken digits), single use, expires after 2 minutes
- One Gemini Flash call that returns structured JSON, plus a rule-based verdict
- SHA-256 fingerprint of each clip, with claims stored in Firestore
- Prompt, response schema and test clip set
- Customer interviews and quotes

## Built on site (20–21 Nov 2026)
| Time | What | Google product | Commit |
|---|---|---|---|
| | | | |

## Pitch slide: "What we built in 36 hours"
**Before:** a capture page plus one Gemini call.
**At Buildathon:**
- Three-tier Gemini pipeline (Flash-Lite → Flash → Pro), cost per claim ₹__
- Cross-claim duplicate catch with Vertex AI embeddings and vector search
- KMS-signed, tamper-evident verdicts
- Merchant dashboard
- Red-team result: caught __ of __ AI and screen fakes, with __ false flags on __ genuine clips
