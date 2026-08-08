import { Banknote, CalendarDays, Heart } from 'lucide-react';

const TABS = [
  { id: 'financieros', label: 'Financieros', Icon: Banknote },
  { id: 'agendas', label: 'Agendas', Icon: CalendarDays },
  { id: 'fidelizacion', label: 'Fidelización', Icon: Heart },
];

export default function InformesTabs({ activeTab, onChange }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label="Secciones de informes">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ui-tabs__btn${active ? ' ui-tabs__btn--active' : ''}`}
            onClick={() => onChange(id)}
          >
            <Icon size={16} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export { TABS as INFORMES_TAB_OPTIONS };
