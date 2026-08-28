import { useEffect, useState } from 'react';
import { listProfesionales } from '../api/profesionalesApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import PageHeader from '../components/ui/PageHeader';
import InformesTabs from '../components/informes/InformesTabs';
import InformesFinancierosTab from '../components/informes/InformesFinancierosTab';
import InformesAgendasTab from '../components/informes/InformesAgendasTab';
import InformesFidelizacionTab from '../components/informes/InformesFidelizacionTab';
import '../index.css';

const TAB_STORAGE_KEY = 'informes.activeTab';
const VALID_TABS = new Set(['financieros', 'agendas', 'fidelizacion']);

function readStoredTab() {
  try {
    const v = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (VALID_TABS.has(v)) return v;
  } catch {
    /* ignore */
  }
  return 'financieros';
}

export default function InformesPage() {
  const [activeTab, setActiveTab] = useState(readStoredTab);
  const [profesionales, setProfesionales] = useState([]);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listProfesionales(1, 100);
        if (cancelled) return;
        setProfesionales(normalizeListPayload(res));
      } catch (e) {
        if (cancelled) return;
        setProfesionales([]);
        addToast(e?.message || 'Error al cargar profesionales', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  function handleTabChange(tabId) {
    setActiveTab(tabId);
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tabId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Informes"
        subtitle="Financieros, agendas y fidelización con exportación a CSV y PDF"
      />

      <hr className="ui-divider" />

      <InformesTabs activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === 'financieros' && (
        <InformesFinancierosTab profesionales={profesionales} addToast={addToast} />
      )}
      {activeTab === 'agendas' && (
        <InformesAgendasTab profesionales={profesionales} addToast={addToast} />
      )}
      {activeTab === 'fidelizacion' && (
        <InformesFidelizacionTab profesionales={profesionales} addToast={addToast} />
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
