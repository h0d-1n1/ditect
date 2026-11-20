// Gestures the customer must perform while recording. Paired with 3 random spoken digits,
// so a pre-made or AI-generated video cannot match the challenge.
const GESTURES = [
  "Hold up 3 fingers right next to the damage",
  "Hold up 2 fingers right next to the damage",
  "Make a thumbs-up beside the damage",
  "Point at the damage with one finger, then show your open palm",
  "Tap the item twice near the damage",
  "Show the damage, then turn the item to show its other side",
  "Move the camera closer to the damage, then show the shipping label",
  "Place a coin or key next to the damage",
  "Show the damage, then make an OK sign beside it",
  "Show the damage from the left side, then from the right side",
  "Cover half the damage with your hand, then uncover it",
  "Show the shipping label first, then the damage"
];

function randomChallenge() {
  const gesture = GESTURES[Math.floor(Math.random() * GESTURES.length)];
  const digits = String(Math.floor(100 + Math.random() * 900)); // 100–999
  return { gesture, digits };
}

module.exports = { GESTURES, randomChallenge };
