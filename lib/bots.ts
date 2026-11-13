import { scores, validScore, validCheckout, type Game } from '@/lib/darts';

export const BOTS = [
  { id: 'novice', name: 'Novic', min: 35, max: 40 },
  { id: 'beginner', name: 'Začiatočník', min: 40, max: 45 },
  { id: 'amateur', name: 'Amatér', min: 45, max: 55 },
  { id: 'league-3', name: '3. Liga', min: 55, max: 65 },
  { id: 'league-2', name: '2. Liga', min: 65, max: 75 },
  { id: 'league-1', name: '1. Liga', min: 75, max: 90 },
  { id: 'pro', name: 'Profi', min: 90, max: 100 },
  { id: 'taylor', name: 'Phil Taylor', min: 101, max: 118 },
] as const;
export type BotId = (typeof BOTS)[number]['id'];
export type BotConfig = { id: BotId; target: number };

const PREFERRED_DOUBLES = [40, 32, 24, 20, 16, 8, 4];

/** Prefer doubles that can be split and avoid bogey numbers in the setup. */
function setupPenalty(remaining: number): number {
  if (remaining > 170) return 0;
  if (!validCheckout(remaining, 3, true)) return remaining < 40 ? 90 : 35;
  if (remaining === 2) return 120;
  // With three left, S1 then D1 is the only legal route; never stall on it.
  if (remaining === 3) return 150;
  if (PREFERRED_DOUBLES.includes(remaining)) return 0;
  if (validCheckout(remaining, 1, true)) return remaining === 50 ? 10 : 8;
  if (remaining < 40) return 45;
  return validCheckout(remaining, 2, true) ? 12 : 24;
}

/** Target is a three-dart average, not a fixed score for every visit. */
export function generateBotTurn(game: Game, random: () => number = Math.random) {
  if (!game.bot) throw new Error('Bot configuration is missing');
  const target = game.bot.target;
  const turns = game.turns.filter((turn) => turn.player === 1 && !turn.undone);
  const points = turns.reduce((sum, turn) => sum + (turn.bust ? 0 : turn.score), 0);
  const darts = turns.reduce((sum, turn) => sum + (turn.darts ?? 3), 0);
  // Recover points lost on doubles gradually, without making every visit identical.
  const deficit = (target * darts) / 3 - points;
  const desired = Math.max(0, Math.min(180, target + deficit * 0.35 + (random() - 0.5) * target));
  const remaining = scores(game)[1];
  const checkoutDarts = ([1, 2, 3] as const).filter((n) =>
    validCheckout(remaining, n, game.doubleOut),
  );
  const checkoutChance = 0.4 + ((target - 35) / (118 - 35)) * 0.5;
  if (remaining <= desired && checkoutDarts.length && random() < checkoutChance) {
    // Include the actual darts used in averages; never claim an impossible finish.
    const error = (n: number) => Math.abs(((points + remaining) * 3) / (darts + n) - target);
    const best = checkoutDarts.reduce((a, b) => (error(a) <= error(b) ? a : b));
    return { score: remaining, checkout: true, darts: best };
  }
  if (game.doubleOut && validCheckout(remaining, 1, true)) {
    // Missing outside the double leaves it intact; hitting the single halves it.
    // Do not deliberately score down to D1 after a failed checkout attempt.
    const score = random() < 0.3 && remaining > 2 ? remaining / 2 : 0;
    return { score, checkout: false, darts: 3 as const };
  }
  // Balance visit variation against a sensible next finish, not just maximum points.
  // Average recovery and the randomly sampled match target remain unchanged.
  const maxScore = Math.min(180, remaining - (game.doubleOut ? 2 : 1));
  const cost = (candidate: number) =>
    Math.abs(candidate - desired) + (game.doubleOut ? setupPenalty(remaining - candidate) : 0);
  let score = 0;
  let bestCost = cost(0);
  for (let candidate = 1; candidate <= maxScore; candidate++) {
    if (!validScore(candidate)) continue;
    const candidateCost = cost(candidate);
    if (candidateCost < bestCost) {
      score = candidate;
      bestCost = candidateCost;
    }
  }
  return { score, checkout: false, darts: 3 as const };
}
