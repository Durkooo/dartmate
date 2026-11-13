import { average, type Friend, type Game } from '@/lib/darts';
import { computeMatchStats, type OnlineMatch, type OnlineTurn } from '@/lib/online';
import { formatResult, formatSoloResult } from '@/lib/matchResult';
import { onlineVisits, renderResultImage, x01Rows, x01Stats } from '@/lib/resultImage';

/* Spoločné zostavenie výsledku na poslanie do chatu (text + obrázok tabuľky)
 * pre koniec zápasu aj pre históriu zápasov. */

export type GameShare = {
  /** Súper-priateľ z appky → pošle sa rovno jemu; inak výber priateľa. */
  peerId?: string;
  peerName?: string;
  body: string;
  image: () => Promise<Blob | null>;
};

/** Lokálny zápas 301/501 (s priateľom, botom, dočasným súperom alebo sólo). */
export function localGameShare(game: Game, myNick: string, friends: Friend[]): GameShare {
  const friendOpponent =
    !game.solo && !game.bot && friends.some((f) => !f.demo && f.id === game.opponentId);
  const legs: [number, number] = game.legs ?? [
    game.winner === 0 ? 1 : 0,
    game.winner === 1 ? 1 : 0,
  ];
  const legsToWin = game.legsToWin ?? 1;
  const myDarts = game.turns
    .filter((t) => t.player === 0 && !t.undone)
    .reduce((sum, t) => sum + (t.darts ?? 3), 0);
  const score: [number, number] =
    legsToWin > 1 ? [legs[0], legs[1]] : game.winner === 0 ? [1, 0] : [0, 1];
  const body = game.solo
    ? formatSoloResult({
        me: myNick,
        starting: game.starting,
        doubleOut: game.doubleOut,
        legs: legs[0],
        darts: myDarts,
        avg: Number.parseFloat(average(game, 0)) || null,
      })
    : formatResult({
        me: myNick,
        opponent: game.opponentName,
        opponentTagged: friendOpponent,
        score,
        won: game.winner === 0,
        starting: game.starting,
        doubleOut: game.doubleOut,
        avg: [
          Number.parseFloat(average(game, 0)) || null,
          Number.parseFloat(average(game, 1)) || null,
        ],
      });
  const image = () => {
    const sides = game.solo ? ([0] as const) : ([0, 1] as const);
    const stats = sides.map((p) =>
      x01Stats(
        game.turns
          .filter((t) => t.player === p && !t.undone)
          .map((t) => ({
            points: t.score,
            darts: t.darts ?? 3,
            remaining: t.remaining,
            bust: t.bust,
            leg: t.leg ?? 0,
          })),
      ),
    );
    return renderResultImage({
      subtitle: `${game.starting}${game.doubleOut ? ' · double out' : ''}${legsToWin > 1 ? ` · na ${legsToWin} legy` : ''}`,
      players: game.solo
        ? [{ name: `@${myNick}`, score: `${myDarts} šípok` }]
        : [
            { name: `@${myNick}`, score: String(score[0]) },
            {
              name: friendOpponent ? `@${game.opponentName}` : game.opponentName,
              score: String(score[1]),
            },
          ],
      winner: game.solo ? null : game.winner,
      rows: x01Rows(stats),
    });
  };
  return {
    peerId: friendOpponent ? game.opponentId : undefined,
    peerName: friendOpponent ? game.opponentName : undefined,
    body,
    image,
  };
}

/** Dohraný online zápas (súper je vždy hráč z appky). */
export function onlineMatchShare(
  m: OnlineMatch,
  turns: OnlineTurn[],
  userId: string,
  myNick: string,
): GameShare {
  const host = m.host_id === userId;
  const peerId = host ? m.guest_id : m.host_id;
  const peerName = host ? m.guest_nickname : m.host_nickname;
  const won = m.winner_id === userId;
  const score: [number, number] =
    m.legs_to_win > 1
      ? host
        ? [m.host_legs, m.guest_legs]
        : [m.guest_legs, m.host_legs]
      : won
        ? [1, 0]
        : [0, 1];
  return {
    peerId,
    peerName,
    body: formatResult({
      me: myNick,
      opponent: peerName,
      score,
      won,
      starting: m.starting,
      doubleOut: m.double_out,
      avg: [computeMatchStats(turns, userId).avg3, computeMatchStats(turns, peerId).avg3],
    }),
    image: () =>
      renderResultImage({
        subtitle: `Online ${m.starting}${m.double_out ? ' · double out' : ''}${m.legs_to_win > 1 ? ` · na ${m.legs_to_win} legy` : ''}`,
        players: [
          { name: `@${myNick}`, score: String(score[0]) },
          { name: `@${peerName}`, score: String(score[1]) },
        ],
        winner: won ? 0 : m.winner_id ? 1 : null,
        rows: x01Rows([
          x01Stats(onlineVisits(turns, userId)),
          x01Stats(onlineVisits(turns, peerId)),
        ]),
      }),
  };
}
