// Gestures the customer must perform while recording. Paired with 3 random spoken digits,
// so a pre-made or AI-generated video cannot match the challenge.
const GESTURES = [
  "Hold up 1 fingers right next to the damage",
  "Make a thumbs-up beside the damage",
  "Point at the damage with one finger, then show your open palm",
  "Tap the item twice near the damage",
];

function randomChallenge() {
  const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
  const digits = String(Math.floor(100 + Math.random() * 900)); // 100–999
  return { gesture, digits };
}

module.exports = { GESTURES, randomChallenge };
