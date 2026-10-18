import { describe, expect, it } from 'vitest';
import { ERLC_POSTALS, applyCallCalibration, fitCallCalibration, fitPostalCalibration, postalMatchRate, type PostalSample, onErlcMap, poiForPlace, postalPosition } from '../src';

describe('Notruf-Positionen', () => {
  it('onErlcMap: nur Koordinaten innerhalb der offiziellen Karte', () => {
    expect(onErlcMap(0, 0)).toBe(true);
    expect(onErlcMap(2677, -2677)).toBe(true);
    expect(onErlcMap(3000, 0)).toBe(false);
    expect(onErlcMap(null, 0)).toBe(false);
  });
  it('poiForPlace: exakter Name zuerst, dann enthalten; zu kurze Orte zählen nicht', () => {
    const pois = [{ name: 'Bank', x: 1, z: 2 }, { name: 'Jewelry Store', x: 3, z: 4 }, { name: 'Ohne Position', x: null, z: null }];
    expect(poiForPlace('Bank', pois)?.x).toBe(1);
    expect(poiForPlace('BANK!', pois)?.x).toBe(1);
    expect(poiForPlace('Robbery at the Jewelry Store', pois)?.x).toBe(3);
    expect(poiForPlace('ab', pois)).toBeNull();
    expect(poiForPlace('Ohne Position', pois)).toBeNull();
    expect(poiForPlace(null, pois)).toBeNull();
  });
  it('fitCallCalibration: erkennt Maßstab und Verschiebung, verweigert unsichere Fälle', () => {
    const truth = (x: number, z: number) => ({ cx: 0.5 * x - 300, cz: 0.5 * z + 100 });
    const pairs = [[1000, 2000], [-2000, 500], [3000, -1500], [400, 4000]].map(([px, pz]) => ({ px: px!, pz: pz!, ...truth(px!, pz!) }));
    const c = fitCallCalibration(pairs)!;
    expect(c).toMatchObject({ n: 4 });
    const p = applyCallCalibration(c, 1600, -800);
    expect(p.x).toBeCloseTo(500);
    expect(p.z).toBeCloseTo(-300);
    expect(fitCallCalibration(pairs.slice(0, 2))).toBeNull(); // zu wenige Paare
    expect(fitCallCalibration(pairs.map((x) => ({ ...x, px: 5 })))).toBeNull(); // kein Abstand
    // ein Ausreißer unter vielen wird verworfen; zu viele Ausreißer → lieber keine Umrechnung
    expect(applyCallCalibration(fitCallCalibration([...pairs, { px: 0, pz: 0, cx: 900, cz: 900 }])!, 1600, -800).x).toBeCloseTo(500);
    expect(fitCallCalibration([...pairs.slice(0, 3), { px: 0, pz: 0, cx: 900, cz: 900 }, { px: 100, pz: 100, cx: -900, cz: 800 }])).toBeNull();
    // gleiche Koordinaten (Position ist schon im Kartensystem) → Einheitsumrechnung
    const same = fitCallCalibration(pairs.map((x) => ({ px: x.px, pz: x.pz, cx: x.px, cz: x.pz })))!;
    expect(same.ax).toBeCloseTo(1);
    expect(same.bx).toBeCloseTo(0);
  });
  it('postalPosition: PLZ aus der Ortsangabe → Position der Beschriftung auf der offiziellen Karte', () => {
    expect(postalPosition('Freedom Avenue · PLZ 321')).toEqual({ postal: '321', x: ERLC_POSTALS['321']![0], z: ERLC_POSTALS['321']![1] });
    expect(postalPosition('Postal 1102')?.postal).toBe('1102');
    expect(postalPosition('P-218')?.postal).toBe('218');
    expect(postalPosition('Überfall 404 Pineview Circle')?.postal).toBe('404');
    expect(postalPosition('PLZ 9999')).toBeNull(); // unbekannt → keine geratene Position
    expect(postalPosition('Shop 12, 3,5 km')).toBeNull();
    expect(postalPosition(null)).toBeNull();
  });
  it('ERLC_POSTALS: alle Postleitzahlen liegen auf der Karte, Stadtgebiet unten (positives Z)', () => {
    expect(Object.keys(ERLC_POSTALS).length).toBeGreaterThan(140);
    for (const [x, z] of Object.values(ERLC_POSTALS)) expect(onErlcMap(x, z)).toBe(true);
    expect(ERLC_POSTALS['201']![1]).toBeGreaterThan(ERLC_POSTALS['907']![1]); // Strand (201) liegt südlich vom Nordsee-Ufer (907)
  });
  it('fitPostalCalibration: findet Maßstab und Ursprung aus Spieler-Positionen mit PLZ; zu wenig Daten → null', () => {
    // Spieler stehen im Umkreis ihrer PLZ-Beschriftung; echte Karte mit Maßstab 0,8 und verschobenem Ursprung
    const truth = { scale: 0.8, originX: 2700, originY: 2650 };
    const keys = Object.keys(ERLC_POSTALS);
    const samples: PostalSample[] = Array.from({ length: 120 }, (_, i) => {
      const k = keys[(i * 7) % keys.length]!, [lx, lz] = ERLC_POSTALS[k]!;
      const px = lx + 2677.5 + ((i * 37) % 81) - 40, py = lz + 2677.5 + ((i * 53) % 81) - 40;
      return [(px - truth.originX) / truth.scale, (py - truth.originY) / truth.scale, k];
    });
    const c = fitPostalCalibration(samples)!;
    expect(c.scale).toBeCloseTo(0.8, 2);
    expect(Math.abs(c.originX - 2700)).toBeLessThan(10);
    expect(Math.abs(c.originY - 2650)).toBeLessThan(10);
    expect(c.match).toBeGreaterThan(0.8);
    expect(postalMatchRate({ width: 5355, height: 5355, originX: 2677.5, originY: 2677.5, scale: 1 }, samples)).toBeLessThan(c.match);
    expect(fitPostalCalibration(samples.slice(0, 5))).toBeNull();
  });
});
