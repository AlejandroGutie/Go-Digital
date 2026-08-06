import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFecha, formatHora, hoyLocalISO } from './format';
import clientLogoUrl from '../assets/logo-pelu-eli.png';
import goDigitalLogoUrl from '../assets/LogoGo-Digital.png';

/** Color primario de marca (--color-entorno), fallback Pelu Eli magenta. */
const COLOR_ENTORNO_FALLBACK = [183, 65, 146]; // #B74192

export const formatMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(valor || 0);

export function formatMesLabel(mes) {
  if (!mes) return '—';
  const [year, month] = String(mes).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '').trim();
  if (!h) return null;
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function getBrandColor() {
  if (typeof document === 'undefined') return COLOR_ENTORNO_FALLBACK;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-entorno')
    .trim();
  if (!raw) return COLOR_ENTORNO_FALLBACK;
  if (raw.startsWith('#')) return hexToRgb(raw) || COLOR_ENTORNO_FALLBACK;
  const parts = raw.match(/(\d+)/g);
  if (parts && parts.length >= 3) {
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  }
  return COLOR_ENTORNO_FALLBACK;
}

let logoDataUrlCache = null;
let goDigitalLogoDataUrlCache = null;

async function loadImageAsDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function getLogoDataUrl() {
  if (logoDataUrlCache) return logoDataUrlCache;
  logoDataUrlCache = await loadImageAsDataUrl(clientLogoUrl);
  return logoDataUrlCache;
}

async function getGoDigitalLogoDataUrl() {
  if (goDigitalLogoDataUrlCache) return goDigitalLogoDataUrlCache;
  goDigitalLogoDataUrlCache = await loadImageAsDataUrl(goDigitalLogoUrl);
  return goDigitalLogoDataUrlCache;
}

/** Alto del membrete (logo + franja) reservado en cada página. */
const LETTERHEAD_HEIGHT = 30;

function drawLetterhead(doc, logoDataUrl) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const brand = getBrandColor();

  if (logoDataUrl) {
    // Relación landscape ~2:1; tamaño a la mitad, alineado a la derecha
    const logoW = 21;
    const logoH = 9;
    doc.addImage(logoDataUrl, 'PNG', pageWidth - 14 - logoW, 8, logoW, logoH);
  }

  // Línea decorativa con color de entorno
  doc.setFillColor(...brand);
  doc.rect(0, 26, pageWidth, 2.2, 'F');
}

function drawFooter(doc, goDigitalLogoDataUrl) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brand = getBrandColor();

  doc.setDrawColor(...brand);
  doc.setLineWidth(0.6);
  doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  // Dimensiones nativas del logo Go-Digital (1219×1245 ≈ 1:1)
  const LOGO_NATURAL_W = 1219;
  const LOGO_NATURAL_H = 1245;
  const logoH = 5.5;
  const logoW = logoH * (LOGO_NATURAL_W / LOGO_NATURAL_H);
  const gap = 3;
  const leftX = 14;
  const baselineY = pageHeight - 7;
  const logoY = baselineY - logoH / 2 - 1.1;

  if (goDigitalLogoDataUrl) {
    doc.addImage(goDigitalLogoDataUrl, 'PNG', leftX, logoY, logoW, logoH);
  }

  const copyright = `© ${new Date().getFullYear()} Go-Digital · Pelu Eli`;
  const textX = leftX + (goDigitalLogoDataUrl ? logoW + gap : 0);
  doc.setFontSize(8);
  doc.setTextColor(...brand);
  // Alineación vertical centrada con el logo (baseline ≈ centro del icono)
  doc.text(copyright, textX, baselineY);

  try {
    const n = doc.internal.getCurrentPageInfo().pageNumber;
    doc.text(`Pág. ${n}`, pageWidth - 14, baselineY, { align: 'right' });
  } catch {
    /* ignore */
  }

  doc.setTextColor(0, 0, 0);
}

function applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl) {
  drawLetterhead(doc, logoDataUrl);
  drawFooter(doc, goDigitalLogoDataUrl);
}

const tableBaseStyles = {
  fontSize: 8,
  cellPadding: 2.5,
  lineColor: [220, 220, 225],
  lineWidth: 0.1,
};

function headStylesFromBrand() {
  return {
    fillColor: getBrandColor(),
    textColor: [255, 255, 255],
    fontStyle: 'bold',
    halign: 'left',
  };
}

export function exportDashboardCSV(dashboard, filtros) {
  const lines = [];
  lines.push('INFORME FINANCIERO');
  lines.push(`Generado,${hoyLocalISO()}`);
  lines.push(`Desde,${filtros.fecha_desde || ''}`);
  lines.push(`Hasta,${filtros.fecha_hasta || ''}`);
  lines.push(`Profesional,${filtros.id_profesional || 'Todos'}`);
  lines.push(`Estado,${filtros.estado || 'Todos'}`);
  lines.push('');

  const k = dashboard?.kpis || {};
  lines.push('KPIs');
  lines.push('Metrica,Valor');
  lines.push(`Ingresos totales,${k.total_ingresos ?? 0}`);
  lines.push(`Pagado,${k.total_pagado ?? 0}`);
  lines.push(`Pendiente,${k.total_pendiente ?? 0}`);
  lines.push(`Atenciones,${k.total_atenciones ?? 0}`);
  lines.push(`Ticket promedio,${k.ticket_promedio ?? 0}`);
  lines.push(`Citas agenda,${k.total_citas_agenda ?? 0}`);
  lines.push('');

  lines.push('Por profesional');
  lines.push('Profesional,Atenciones,Citas agenda,Ingresos,Pagado,Pendiente');
  for (const p of dashboard?.por_profesional || []) {
    lines.push(
      [
        csvEscape(p.nombre),
        p.atenciones,
        p.citas_agenda ?? 0,
        p.ingresos,
        p.pagado,
        p.pendiente,
      ].join(',')
    );
  }
  lines.push('');

  lines.push('Por mes');
  lines.push('Mes,Atenciones,Ingresos,Pagado,Pendiente');
  for (const m of dashboard?.por_mes || []) {
    lines.push([m.mes, m.atenciones, m.ingresos, m.pagado, m.pendiente].join(','));
  }
  lines.push('');

  lines.push('Por tarifa');
  lines.push('Tarifa,Cantidad,Ingresos');
  for (const t of dashboard?.por_tarifa || []) {
    lines.push([csvEscape(t.descripcion), t.cantidad, t.ingresos].join(','));
  }

  downloadBlob(
    '\uFEFF' + lines.join('\n'),
    `informe_financiero_${hoyLocalISO()}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export function exportAgendaCSV(rows, filtros) {
  const lines = ['Fecha,Inicio,Fin,Profesional,Mascota,Especie,Raza,Tamaño'];
  for (const r of rows || []) {
    lines.push(
      [
        toCsvDate(r.fecha),
        r.hora_inicio,
        r.hora_fin,
        csvEscape(r.profesional_nombre),
        csvEscape(r.mascota_nombre),
        csvEscape(r.especie),
        csvEscape(r.raza),
        csvEscape(r.tamano),
      ].join(',')
    );
  }
  const suffix = filtros.id_profesional ? `_prof${filtros.id_profesional}` : '';
  downloadBlob(
    '\uFEFF' + lines.join('\n'),
    `agenda_${filtros.fecha_desde || 'inicio'}_${filtros.fecha_hasta || 'fin'}${suffix}.csv`,
    'text/csv;charset=utf-8;'
  );
}

function toCsvDate(f) {
  return f || '';
}

function drawReportTitle(doc, title, subtitleLines, startY) {
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...getBrandColor());
  doc.text(title, 14, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 90);
  for (const line of subtitleLines) {
    doc.text(line, 14, y);
    y += 5;
  }
  doc.setTextColor(0, 0, 0);
  return y + 2;
}

export async function exportDashboardPDF(dashboard, filtros) {
  const doc = new jsPDF();
  const logoDataUrl = await getLogoDataUrl();
  const goDigitalLogoDataUrl = await getGoDigitalLogoDataUrl();
  const k = dashboard?.kpis || {};

  applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl);

  const y = drawReportTitle(
    doc,
    'Informe financiero',
    [
      `Generado: ${hoyLocalISO()}`,
      `Periodo: ${filtros.fecha_desde || '—'} a ${filtros.fecha_hasta || '—'}`,
      `Profesional: ${filtros.id_profesional || 'Todos'} | Estado: ${filtros.estado || 'Todos'}`,
    ],
    LETTERHEAD_HEIGHT + 8
  );

  const sharedTableOpts = {
    styles: tableBaseStyles,
    headStyles: headStylesFromBrand(),
    alternateRowStyles: { fillColor: [252, 248, 251] },
    margin: { top: LETTERHEAD_HEIGHT + 6, left: 14, right: 14, bottom: 18 },
    didDrawPage: () => applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl),
  };

  autoTable(doc, {
    ...sharedTableOpts,
    startY: y,
    head: [['KPI', 'Valor']],
    body: [
      ['Ingresos totales', formatMoneda(k.total_ingresos)],
      ['Pagado', formatMoneda(k.total_pagado)],
      ['Pendiente', formatMoneda(k.total_pendiente)],
      ['Atenciones', String(k.total_atenciones ?? 0)],
      ['Ticket promedio', formatMoneda(k.ticket_promedio)],
      ['Citas agenda', String(k.total_citas_agenda ?? 0)],
    ],
    styles: { ...tableBaseStyles, fontSize: 9 },
  });

  autoTable(doc, {
    ...sharedTableOpts,
    startY: (doc.lastAutoTable?.finalY || y) + 8,
    head: [['Profesional', 'Atenciones', 'Citas', 'Ingresos', 'Pagado', 'Pendiente']],
    body: (dashboard?.por_profesional || []).map((p) => [
      p.nombre,
      p.atenciones,
      p.citas_agenda ?? 0,
      formatMoneda(p.ingresos),
      formatMoneda(p.pagado),
      formatMoneda(p.pendiente),
    ]),
  });

  autoTable(doc, {
    ...sharedTableOpts,
    startY: (doc.lastAutoTable?.finalY || y) + 8,
    head: [['Mes', 'Atenciones', 'Ingresos', 'Pagado', 'Pendiente']],
    body: (dashboard?.por_mes || []).map((m) => [
      formatMesLabel(m.mes),
      m.atenciones,
      formatMoneda(m.ingresos),
      formatMoneda(m.pagado),
      formatMoneda(m.pendiente),
    ]),
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl);
  }

  doc.save(`informe_financiero_${hoyLocalISO()}.pdf`);
}

export async function exportAgendaPDF(rows, filtros) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const logoDataUrl = await getLogoDataUrl();
  const goDigitalLogoDataUrl = await getGoDigitalLogoDataUrl();

  applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl);

  const y = drawReportTitle(
    doc,
    'Informe de agendas',
    [
      `Periodo: ${filtros.fecha_desde || '—'} a ${filtros.fecha_hasta || '—'} | Generado: ${hoyLocalISO()}`,
      `Profesional: ${filtros.id_profesional || 'Todos'}`,
    ],
    LETTERHEAD_HEIGHT + 8
  );

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Inicio', 'Fin', 'Profesional', 'Mascota', 'Especie', 'Raza']],
    body: (rows || []).map((r) => [
      formatFecha(r.fecha),
      formatHora(r.hora_inicio),
      formatHora(r.hora_fin),
      r.profesional_nombre || '—',
      r.mascota_nombre || '—',
      r.especie || '—',
      r.raza || '—',
    ]),
    styles: tableBaseStyles,
    headStyles: headStylesFromBrand(),
    alternateRowStyles: { fillColor: [252, 248, 251] },
    margin: { top: LETTERHEAD_HEIGHT + 6, left: 14, right: 14, bottom: 18 },
    didDrawPage: () => applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl),
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    applyPageChrome(doc, logoDataUrl, goDigitalLogoDataUrl);
  }

  const suffix = filtros.id_profesional ? `_prof${filtros.id_profesional}` : '';
  doc.save(
    `agenda_${filtros.fecha_desde || 'inicio'}_${filtros.fecha_hasta || 'fin'}${suffix}.pdf`
  );
}
