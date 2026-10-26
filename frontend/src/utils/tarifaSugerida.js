/**
 * Sugerencia de tarifa "Servicio integral" según especie, tamaño y
 * tipo de pelo inferido por raza (tabla interna; default: medio).
 */

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Raza normalizada → corto | medio | largo */
const RAZA_PELO = {
  // Corto
  pomerania: 'corto',
  pincher: 'corto',
  pinscher: 'corto',
  'bulldog frances': 'corto',
  bulldog: 'corto',
  beagle: 'corto',
  boxer: 'corto',
  dalmata: 'corto',
  labrador: 'corto',
  'labrador retriever': 'corto',
  weimaraner: 'corto',
  'american bully': 'corto',
  pitbull: 'corto',
  'pit bull': 'corto',
  chihuahua: 'corto',
  pug: 'corto',
  'french bulldog': 'corto',
  doberman: 'corto',
  'gran danes': 'corto',
  pointer: 'corto',
  'jack russell': 'corto',
  criollo: 'corto',
  criolla: 'corto',
  // Medio
  chizu: 'medio',
  shih: 'medio',
  'shih tzu': 'medio',
  snauzer: 'medio',
  schnauzer: 'medio',
  shauzer: 'medio',
  coker: 'medio',
  'cocker spaniel': 'medio',
  cocker: 'medio',
  'border collie': 'medio',
  collie: 'medio',
  siberiano: 'medio',
  husky: 'medio',
  'husky siberiano': 'medio',
  maltipoo: 'medio',
  maltipooo: 'medio',
  frespuder: 'medio',
  'french poodle': 'medio',
  poodle: 'medio',
  caniche: 'medio',
  yorkie: 'medio',
  'yorkshire terrier': 'medio',
  yorkshire: 'medio',
  salchicha: 'medio',
  dachshund: 'medio',
  'basset hound': 'medio',
  // Largo
  golden: 'largo',
  'golden retriever': 'largo',
  'bernez de la montana': 'largo',
  'boyero de berna': 'largo',
  'bernese mountain dog': 'largo',
  hovawart: 'largo',
  samoyedo: 'largo',
  'pastor aleman': 'largo',
  'pastor belga': 'largo',
  maltes: 'largo',
  afghan: 'largo',
  afgano: 'largo',
  // Gatos
  persa: 'largo',
  siames: 'corto',
  'maine coon': 'largo',
  angora: 'largo',
  'british shorthair': 'corto',
  'pelo corto': 'corto',
  'pelo medio': 'medio',
  'pelo largo': 'largo',
};

const TAMANO_ALIASES = {
  miniatura: 'pequeno',
  pequeno: 'pequeno',
  pequenio: 'pequeno',
  mediano: 'mediano',
  grande: 'grande',
  gigante: 'gigante',
};

const PELO_LABEL = {
  corto: 'pelo corto',
  medio: 'pelo medio',
  largo: 'pelo largo',
};

const TAMANO_LABEL = {
  pequeno: 'pequeno',
  mediano: 'mediano',
  grande: 'grande',
  gigante: 'gigante',
};

export function resolverPeloDesdeRaza(raza) {
  const key = normalizarTexto(raza);
  if (!key) return 'medio';
  if (RAZA_PELO[key]) return RAZA_PELO[key];
  // Match parcial: "Golden Retriever" → golden
  for (const [razaKey, pelo] of Object.entries(RAZA_PELO)) {
    if (key.includes(razaKey) || razaKey.includes(key)) return pelo;
  }
  return 'medio';
}

export function resolverTamanoClave(tamano) {
  const key = normalizarTexto(tamano);
  if (!key) return null;
  if (TAMANO_ALIASES[key]) return TAMANO_ALIASES[key];
  for (const [alias, canon] of Object.entries(TAMANO_ALIASES)) {
    if (key.includes(alias)) return canon;
  }
  return null;
}

function esGato(especie) {
  const e = normalizarTexto(especie);
  return e === 'gato' || e === 'felino' || e.includes('gato');
}

function descripcionTarifa(t) {
  return normalizarTexto(t?.descripcion || t?.tarifa_descripcion || '');
}

/**
 * @param {Array} tarifas
 * @param {{ especie?: string, raza?: string, tamano?: string } | null} mascota
 * @returns {string|null} id de tarifa sugerida (string) o null
 */
export function sugerirIdTarifaIntegral(tarifas = [], mascota = null) {
  if (!mascota || !Array.isArray(tarifas) || tarifas.length === 0) return null;

  const activas = tarifas.filter((t) => t?.activo !== false && t?.id != null);
  if (activas.length === 0) return null;

  const integrales = activas.filter((t) =>
    descripcionTarifa(t).includes('servicio integral')
  );
  if (integrales.length === 0) return null;

  if (esGato(mascota.especie)) {
    const gato = integrales.find((t) => {
      const d = descripcionTarifa(t);
      return d.includes('gato') && !d.includes('perro');
    });
    return gato ? String(gato.id) : null;
  }

  const tamanoKey = resolverTamanoClave(mascota.tamano);
  const pelo = resolverPeloDesdeRaza(mascota.raza);
  if (!tamanoKey) return null;

  const tamanoLabel = TAMANO_LABEL[tamanoKey];
  const peloLabel = PELO_LABEL[pelo];

  const match = integrales.find((t) => {
    const d = descripcionTarifa(t);
    if (!d.includes('perro')) return false;
    if (!d.includes(tamanoLabel)) return false;
    if (!d.includes(peloLabel)) return false;
    return true;
  });

  return match ? String(match.id) : null;
}

/**
 * Si hay sugerencia, devuelve [sugerida]; si no, [].
 * No mezcla con selección previa: el caller decide cuándo aplicar.
 */
export function idsTarifaSugeridaIntegral(tarifas, mascota) {
  const id = sugerirIdTarifaIntegral(tarifas, mascota);
  return id ? [id] : [];
}
