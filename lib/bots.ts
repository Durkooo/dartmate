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

/** Target is a three-dart average, not a fixed score for every visit. */
export function generateBotTurn(game: Game, random: () => number = Math.random) {
  if (!game.bot) throw new Error('Bot configuration is missing');
  const target = game.bot.target;
  const turns = game.turns.filter((turn) => turn.player === 1);
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
  // A missed checkout may score some setup points or zero, but cannot accidentally finish.
  const maxScore = Math.min(180, remaining - (game.doubleOut ? 2 : 1));
  let score = 0;
  for (let candidate = 1; candidate <= maxScore; candidate++) {
    if (validScore(candidate) && Math.abs(candidate - desired) < Math.abs(score - desired)) {
      score = candidate;
    }
  }
  return { score, checkout: false, darts: 3 as const };
}
