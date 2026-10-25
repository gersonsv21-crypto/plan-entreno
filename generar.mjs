#!/usr/bin/env node
// Genera la página pública del plan (docs/index.html), el calendario descargable
// (docs/plan-entreno.ics) y el plan expandido día por día (docs/plan-dias.json)
// a partir de plan.json. Sin dependencias: solo Node 18+.
//   node generar.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(RAIZ, 'docs');
const DOMINIO = 'gersonsv21-crypto.github.io';
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// --- utilidades de fecha (siempre en UTC para no depender de la zona del PC) ---
const aFecha = (iso) => new Date(`${iso}T00:00:00Z`);
const sumarDias = (d, n) => new Date(d.getTime() + n * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const compacta = (d) => iso(d).replaceAll('-', '');

// Busca el valor de un mapa por rango de semanas: { "1-3": x, "7": y }.
export function porSemana(valor, semana) {
  if (valor == null || typeof valor !== 'object') return valor;
  for (const [rango, v] of Object.entries(valor)) {
    const [a, b = a] = rango.split('-').map(Number);
    if (semana >= a && semana <= b) return v;
  }
  return undefined;
}

export function expandir(plan) {
  const inicio = aFecha(plan.inicio);
  const dias = [];
  for (let i = 0; i < plan.semanas * 7; i++) {
    const fecha = sumarDias(inicio, i);
    const semana = Math.floor(i / 7) + 1;
    const dow = i % 7; // 0 = lunes (el bloque parte un lunes)
    const fase = plan.fases.find((f) => f.semanas.includes(semana));
    const pausa = fase.id === 'pausa';
    const sesiones = [];

    const nado = { 1: 'martes', 3: 'jueves', 5: 'sabado' }[dow];
    if (nado) {
      const s = plan.natacion.sesiones[nado];
      sesiones.push({
        tipo: 'natacion',
        nombre: s.nombre,
        hora: s.hora ?? plan.natacion.hora,
        duracionMin: plan.natacion.duracionMin,
        metros: porSemana(s.metros, semana),
        detalle: porSemana(s.detalle, semana),
        opcional: nado === 'sabado',
      });
    }
    if (dow <= 4) {
      const g = plan.gimnasio;
      sesiones.push({
        tipo: 'gimnasio',
        nombre: `Gimnasio — ${g.grupos[dow]}`,
        hora: g.hora,
        duracionMin: g.duracionMin,
        detalle: pausa ? g.notaPausa : g.nota,
      });
    }

    const tipoDia = dow === 1 || dow === 3 ? 'doble' : dow <= 4 ? 'gimnasio' : 'descanso';
    const notas = [
      ...plan.hitos.filter((h) => h.semana === semana && h.dia === dow).map((h) => h.texto),
      ...plan.diasEspeciales.filter((e) => e.fecha === iso(fecha)).map((e) => e.texto),
    ];
    if (dow === 5) notas.push('Si nadas, come como día de gimnasio.');
    if (dow === 6) notas.push('Revisión semanal en el panel (19:00).');

    dias.push({ fecha: iso(fecha), semana, diaSemana: DIAS_SEMANA[dow], fase: fase.nombre, pausa, tipoDia, sesiones, notas });
  }
  return dias;
}

// --- iCalendar (RFC 5545) ---
const escapar = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function plegar(linea) {
  // Líneas de máximo 75 octetos; las continuaciones empiezan con un espacio.
  const bytes = Buffer.from(linea, 'utf8');
  if (bytes.length <= 75) return linea;
  const partes = [];
  let actual = '';
  for (const ch of linea) {
    const limite = partes.length === 0 ? 75 : 74;
    if (Buffer.byteLength(actual + ch, 'utf8') > limite) { partes.push(actual); actual = ''; }
    actual += ch;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}
const horaLocal = (fechaIso, hhmm, sumaMin = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + sumaMin;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${fechaIso.replaceAll('-', '')}T${hh}${mm}00`;
};

export function generarIcs(plan, dias, ahora = new Date()) {
  const tz = plan.zonaHoraria;
  const stamp = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//plan-entreno//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(plan.titulo)}`, `X-WR-TIMEZONE:${tz}`];
  for (const d of dias) {
    for (const s of d.sesiones) {
      const titulo = `${s.opcional ? '(Opcional) ' : ''}${s.nombre}${s.metros ? ` · ${s.metros} m` : ''}`;
      const desc = [s.detalle, d.pausa ? 'Semana de pausa.' : '', `Semana ${d.semana} · ${d.fase}`].filter(Boolean).join('\n');
      l.push('BEGIN:VEVENT', `UID:${compacta(aFecha(d.fecha))}-${s.tipo}@${DOMINIO}`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${tz}:${horaLocal(d.fecha, s.hora)}`, `DTEND;TZID=${tz}:${horaLocal(d.fecha, s.hora, s.duracionMin)}`,
        `SUMMARY:${escapar(titulo)}`, `DESCRIPTION:${escapar(desc)}`,
        `CATEGORIES:${s.tipo === 'natacion' ? 'Natación' : 'Gimnasio'}`, 'END:VEVENT');
    }
    if (d.notas.length && d.notas.some((n) => !n.startsWith('Si nadas') && !n.startsWith('Revisión'))) {
      const fin = iso(sumarDias(aFecha(d.fecha), 1)).replaceAll('-', '');
      const texto = d.notas.filter((n) => !n.startsWith('Si nadas') && !n.startsWith('Revisión')).join(' · ');
      l.push('BEGIN:VEVENT', `UID:${compacta(aFecha(d.fecha))}-hito@${DOMINIO}`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d.fecha.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${fin}`,
        `SUMMARY:${escapar(texto)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    if (d.diaSemana === 'Domingo') {
      l.push('BEGIN:VEVENT', `UID:${compacta(aFecha(d.fecha))}-revision@${DOMINIO}`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${tz}:${horaLocal(d.fecha, '19:00')}`, `DTEND;TZID=${tz}:${horaLocal(d.fecha, '19:15')}`,
        `SUMMARY:Revisión semanal (semana ${d.semana})`, `DESCRIPTION:${escapar('Peso promedio, sesiones y menú cumplidos. El panel propone 0 a 2 ajustes.')}`,
        'END:VEVENT');
    }
  }
  l.push('END:VCALENDAR');
  return l.map(plegar).join('\r\n') + '\r\n';
}

function generarHtml(plan, dias) {
  const datos = JSON.stringify({ plan: { titulo: plan.titulo, tiposDia: plan.tiposDia, pausaComidas: plan.pausaComidas, reglasDelDia: plan.reglasDelDia, semanas: plan.semanas }, dias })
    .replace(/</g, '\\u003c');
  return readFileSync(join(RAIZ, 'plantilla.html'), 'utf8').replace('/*DATOS*/null', datos);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const plan = JSON.parse(readFileSync(join(RAIZ, 'plan.json'), 'utf8'));
  const dias = expandir(plan);
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, 'plan-dias.json'), JSON.stringify({ titulo: plan.titulo, inicio: plan.inicio, dias }, null, 2));
  writeFileSync(join(SALIDA, 'plan-entreno.ics'), generarIcs(plan, dias));
  writeFileSync(join(SALIDA, 'index.html'), generarHtml(plan, dias));
  const n = dias.reduce((a, d) => a + d.sesiones.length, 0);
  console.log(`Listo: ${dias.length} días, ${n} sesiones → docs/index.html, docs/plan-entreno.ics, docs/plan-dias.json`);
}
