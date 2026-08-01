import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatFecha, formatHora, hoyLocalISO } from './format';

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

export function exportDashboardPDF(dashboard, filtros) {
  const doc = new jsPDF();
  const k = dashboard?.kpis || {};
  let y = 14;

  doc.setFontSize(16);
  doc.text('Informe financiero', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(`Generado: ${hoyLocalISO()}`, 14, y);
  y += 5;
  doc.text(
    `Periodo: ${filtros.fecha_desde || '—'} a ${filtros.fecha_hasta || '—'}`,
    14,
    y
  );
  y += 5;
  doc.text(
    `Profesional: ${filtros.id_profesional || 'Todos'} | Estado: ${filtros.estado || 'Todos'}`,
    14,
    y
  );
  y += 8;

  autoTable(doc, {
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
    styles: { fontSize: 9 },
    headStyles: { fillColor: [79, 65, 183] },
  });

  autoTable(doc, {
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
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 65, 183] },
  });

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || y) + 8,
    head: [['Mes', 'Atenciones', 'Ingresos', 'Pagado', 'Pendiente']],
    body: (dashboard?.por_mes || []).map((m) => [
      formatMesLabel(m.mes),
      m.atenciones,
      formatMoneda(m.ingresos),
      formatMoneda(m.pagado),
      formatMoneda(m.pendiente),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 65, 183] },
  });

  doc.save(`informe_financiero_${hoyLocalISO()}.pdf`);
}

export function exportAgendaPDF(rows, filtros) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Informe de agendas', 14, 14);
  doc.setFontSize(10);
  doc.text(
    `Periodo: ${filtros.fecha_desde || '—'} a ${filtros.fecha_hasta || '—'} | Generado: ${hoyLocalISO()}`,
    14,
    22
  );

  autoTable(doc, {
    startY: 28,
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
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 65, 183] },
  });

  const suffix = filtros.id_profesional ? `_prof${filtros.id_profesional}` : '';
  doc.save(
    `agenda_${filtros.fecha_desde || 'inicio'}_${filtros.fecha_hasta || 'fin'}${suffix}.pdf`
  );
}
