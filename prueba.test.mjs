import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { porSemana, expandir, generarIcs } from './generar.mjs';

const plan = JSON.parse(readFileSync(new URL('./plan.json', import.meta.url), 'utf8'));
const dias = expandir(plan);

test('porSemana resuelve rangos y valores sueltos', () => {
  assert.equal(porSemana({ '1-3': 'a', '7': 'b', '8-12': 'c' }, 2), 'a');
  assert.equal(porSemana({ '1-3': 'a', '7': 'b', '8-12': 'c' }, 7), 'b');
  assert.equal(porSemana('fijo', 5), 'fijo');
});

test('12 semanas que parten un lunes, 5 gimnasios y 3 natación por semana', () => {
  assert.equal(dias.length, 84);
  assert.equal(dias[0].diaSemana, 'Lunes');
  for (let s = 1; s <= 12; s++) {
    const de = dias.filter((d) => d.semana === s).flatMap((d) => d.sesiones);
    assert.equal(de.filter((x) => x.tipo === 'gimnasio').length, 5);
    assert.equal(de.filter((x) => x.tipo === 'natacion').length, 3);
  }
});

test('la semana 7 es la pausa y todas sus sesiones lo dicen', () => {
  const s7 = dias.filter((d) => d.semana === 7);
  assert.ok(s7.every((d) => d.pausa));
  assert.ok(s7.flatMap((d) => d.sesiones).every((x) => x.metros == null || x.metros <= 1800));
});

test('el .ics no publica datos privados y respeta el largo de línea', () => {
  const ics = generarIcs(plan, dias, new Date('2026-10-25T00:00:00Z'));
  assert.ok(!/kcal|calor[ií]a|peso:|\bkg\b/i.test(ics));
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 96 + 12 + 9);
});
