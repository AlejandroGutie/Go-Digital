import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatMoneda, formatMesLabel } from '../../utils/exportInformes';
import { formatFecha } from '../../utils/format';

const COLORS = ['#4f41b7', '#8D78A2', '#B74192', '#64748b', '#0ea5e9', '#14b8a6', '#f59e0b'];

function ChartCard({ title, children }) {
  return (
    <div
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-purple-light)',
        borderRadius: 12,
        padding: 16,
        minHeight: 280,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>{title}</div>
      <div style={{ width: '100%', height: 220 }}>{children}</div>
    </div>
  );
}

function labelPeriodo(periodo, agruparPor) {
  if (!periodo) return '';
  if (agruparPor === 'mes' || String(periodo).length === 7) return formatMesLabel(periodo);
  return formatFecha(periodo);
}

export function ChartTendencia({ serie, agruparPor }) {
  const data = (serie || []).map((s) => ({
    ...s,
    label: labelPeriodo(s.periodo, agruparPor),
    ingresos: Number(s.ingresos) || 0,
    atenciones: Number(s.atenciones) || 0,
  }));

  return (
    <ChartCard title="Tendencia de ingresos y atenciones">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              formatter={(value, name) =>
                name === 'ingresos' ? formatMoneda(value) : value
              }
            />
            <Legend />
            <Bar yAxisId="left" dataKey="ingresos" name="Ingresos" fill="#4f41b7" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="atenciones"
              name="Atenciones"
              stroke="#B74192"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function ChartPorProfesional({ rows }) {
  const data = (rows || [])
    .filter((r) => Number(r.ingresos) > 0)
    .map((r) => ({
      nombre: r.nombre,
      ingresos: Number(r.ingresos) || 0,
    }))
    .sort((a, b) => a.ingresos - b.ingresos);

  return (
    <ChartCard title="Ingresos por profesional">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="nombre" width={90} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => formatMoneda(v)} />
            <Bar dataKey="ingresos" name="Ingresos" fill="#8D78A2" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function ChartPorTarifa({ rows }) {
  const data = (rows || [])
    .filter((r) => Number(r.ingresos) > 0)
    .map((r) => ({
      name: r.descripcion,
      value: Number(r.ingresos) || 0,
    }));

  return (
    <ChartCard title="Distribución por tarifas">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={75}
              label={({ name }) => name}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatMoneda(v)} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function ChartPagadoVsPendiente({ kpis }) {
  const data = [
    { name: 'Pagado', value: Number(kpis?.total_pagado) || 0 },
    { name: 'Pendiente', value: Number(kpis?.total_pendiente) || 0 },
  ].filter((d) => d.value > 0);

  return (
    <ChartCard title="Pagado vs pendiente">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              label
            >
              <Cell fill="#14b8a6" />
              <Cell fill="#f59e0b" />
            </Pie>
            <Tooltip formatter={(v) => formatMoneda(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** Volumen de citas en el tiempo (informe de agendas). */
export function ChartTendenciaCitas({ serie, agruparPor }) {
  const data = (serie || []).map((s) => ({
    ...s,
    label: labelPeriodo(s.periodo, agruparPor),
    citas: Number(s.citas) || 0,
  }));

  return (
    <ChartCard title="Tendencia de citas programadas">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="citas" name="Citas" fill="#4f41b7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function ChartCitasPorProfesional({ rows }) {
  const data = (rows || [])
    .filter((r) => Number(r.citas) > 0)
    .map((r) => ({
      nombre: r.nombre,
      citas: Number(r.citas) || 0,
    }))
    .sort((a, b) => a.citas - b.citas);

  return (
    <ChartCard title="Citas por profesional">
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="nombre" width={90} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="citas" name="Citas" fill="#8D78A2" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function EmptyChart() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-purple-light)',
        fontSize: 13,
      }}
    >
      Sin datos para el periodo
    </div>
  );
}
