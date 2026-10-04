import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const session = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

/** Praxistest Phase 40: Widgets hinzufügen, ziehen, bearbeiten, duplizieren, entfernen – wirksam auf der Übersicht. */
test('Widgets: Standard-Übersicht, Editor (Text, Link, Ziehen, Duplizieren, Entfernen) → Übersicht', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);

  // 1) Standard-Übersicht: echte Zahlen (Besitzer sieht alles), Konfigurations-Check
  await page.goto(`/guilds/${E2E.guildId}`);
  const main = page.locator('.content');
  await expect(main.getByRole('region', { name: 'Offene Tickets' })).toContainText('1'); // das Testticket (Seed)
  await expect(main.getByRole('region', { name: 'Konfigurations-Check' })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Tickets', exact: true })).toContainText(
    '#4711 Einzigartiger Suchbegriff Zebra',
  );

  // 2) Editor
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.locator('fieldset').first()).toBeVisible();
  const copy = page.getByRole('button', { name: 'Eigene Kopie zum Bearbeiten anlegen' });
  if (await copy.isVisible()) await copy.click();
  await expect(page.getByText('ist eine Vorlage')).toHaveCount(0);
  await page.getByRole('tab', { name: /Widgets/ }).click();
  await expect(page.getByLabel('Widget-Leinwand').locator('.we-item')).toHaveCount(7);

  // Text-Widget hinzufügen und befüllen
  await page.getByRole('button', { name: 'Text hinzufügen' }).click();
  const insp = page.locator('.we-insp');
  await expect(insp).toBeVisible();
  await insp.getByLabel('Titel (leer = Standard)').fill('Willkommen');
  await insp
    .locator('textarea')
    .fill(
      '# Hallo Team\nDas ist **wichtig** und *kursiv*.\n- Punkt eins\n- Punkt zwei\n[Handbuch](https://example.org/h) <b>kein html</b>',
    );

  // Link-Widget mit Button (nur https wird akzeptiert)
  await page.getByRole('button', { name: 'Link hinzufügen' }).click();
  await insp.getByLabel('Titel (leer = Standard)').fill('Diensthandbuch');
  await insp.getByLabel('Aktion').selectOption({ label: 'Externe Adresse (https)' });
  await insp.getByRole('textbox', { name: /^Adresse \(https\)/ }).fill('javascript:alert(1)');
  await insp.getByLabel('Text', { exact: true }).fill('Öffnen');
  await insp
    .getByRole('textbox', { name: /^Adresse \(https\)/ })
    .fill('https://example.org/handbuch');

  // Ziehen: das Link-Widget an der Titelzeile nach oben links ziehen
  const item = page.locator('.we-item', { hasText: 'Diensthandbuch' });
  const readPos = async () => ({
    x: Number(await insp.getByLabel('Spalte', { exact: true }).inputValue()),
    y: Number(await insp.getByLabel('Zeile', { exact: true }).inputValue()),
  });
  const before = await readPos();
  const grip = item.locator('.we-grip');
  await grip.scrollIntoViewIfNeeded();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 30 + 160, box.y + 8 - 120, { steps: 8 });
  await page.mouse.up();
  const after = await readPos();
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeLessThan(before.y);

  // Tastatur: eine Zeile nach unten, dann Größe 2x1
  await insp.getByRole('button', { name: 'Nach unten' }).click();
  expect((await readPos()).y).toBe(after.y + 1);
  await insp.getByRole('button', { name: '2x1' }).click();
  await expect(insp.getByLabel('Breite (Spalten)')).toHaveValue('6');

  // Nichts überlappt: Raster-Positionen aller Widgets sind eindeutig belegt
  const rects = await page.locator('.we-item').evaluateAll((els) =>
    els.map((e) => {
      const s = (e as HTMLElement).style;
      return { c: s.gridColumn, r: s.gridRow };
    }),
  );
  expect(rects.length).toBe(9);

  // Duplizieren und Entfernen
  await insp.getByRole('button', { name: 'Duplizieren' }).click();
  await expect(page.getByLabel('Widget-Leinwand').locator('.we-item')).toHaveCount(10);
  await insp.getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByLabel('Widget-Leinwand').locator('.we-item')).toHaveCount(9);
  // Standard-Widget „Konfigurations-Check“ entfernen
  await page.getByRole('button', { name: 'Konfigurations-Check auswählen' }).click();
  await page.locator('.we-insp').getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByLabel('Widget-Leinwand').locator('.we-item')).toHaveCount(8);

  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();

  // 3) Auf der Übersicht
  await page.goto(`/guilds/${E2E.guildId}`);
  const text = main.getByRole('region', { name: 'Willkommen' });
  await expect(text.getByRole('heading', { name: 'Hallo Team' })).toBeVisible();
  await expect(text.locator('strong')).toHaveText('wichtig');
  await expect(text.locator('em')).toHaveText('kursiv');
  await expect(text.locator('li')).toHaveCount(2);
  await expect(text.getByRole('link', { name: 'Handbuch' })).toHaveAttribute(
    'href',
    'https://example.org/h',
  );
  await expect(text.locator('b')).toHaveCount(0); // HTML aus der Eingabe wird nie ausgeführt
  await expect(text).toContainText('<b>kein html</b>');
  const link = main
    .getByRole('region', { name: 'Diensthandbuch' })
    .getByRole('link', { name: 'Öffnen' });
  await expect(link).toHaveAttribute('href', 'https://example.org/handbuch');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(main.getByRole('region', { name: 'Konfigurations-Check' })).toHaveCount(0);
  await expect(main.getByRole('region', { name: 'Offene Tickets' })).toBeVisible();
});
