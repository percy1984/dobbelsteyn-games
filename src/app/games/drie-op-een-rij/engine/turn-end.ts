/**
 * Beurteinde: de vaste fase waarin spelelementen met een beurtregel hun actie doen, één keer per zet.
 * Wordt bij stilstand uitgevoerd, per zet in de volgorde van de zetten, in deze vaste volgorde:
 *  1. altaren ontploffen,
 *  2. persen en waterklokken legen,
 *  3. reizigers stappen,
 *  4. lopende banden schuiven,
 *  5. klimmers klimmen,
 *  6. olie verspreidt (met oliebron),
 *  7. stekelbollen draaien,
 *  8. tijdbommen tellen af; klimmers en tijdbommen worden gecontroleerd op verlies.
 * Matches die hierdoor ontstaan, vormen een nieuwe systeemreeks die begint met cascadediepte 1.
 * Bij gelijktijdige acties van hetzelfde type: rij van boven naar beneden, dan kolom van links naar rechts.
 */
import { newResolution, type Ctx } from './context';
import { moduleFor } from './mechanics';
import type { MechanicId } from './types';

export const TURN_END_ORDER: readonly MechanicId[] = [
  'altaar',
  'pers',
  'waterklok',
  'reiziger',
  'lopendeBand',
  'klimmer',
  'olie',
  'oliebron',
  'stekelbol',
  'tijdbom',
];

export function runTurnEnd(ctx: Ctx, res: number): void {
  const { s } = ctx;
  ctx.ev.push({ type: 'TurnEndStarted', res });
  let systemRes = 0;
  const getSystemRes = () => {
    if (systemRes === 0) {
      systemRes = newResolution(s, 'systeem').id;
    }
    return systemRes;
  };
  for (const id of TURN_END_ORDER) {
    if (s.mechanics.includes(id)) {
      moduleFor(id)?.onTurnEnd?.(ctx, res, getSystemRes);
    }
  }
  ctx.ev.push({ type: 'TurnEndFinished', res });
}
