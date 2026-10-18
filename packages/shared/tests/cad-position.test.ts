import { describe, expect, it } from 'vitest';
import { applyCallCalibration, fitCallCalibration, onErlcMap, poiForPlace } from '../src';

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
});
