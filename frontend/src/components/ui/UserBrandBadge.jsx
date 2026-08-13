import { User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import peluEliLogo from '../../assets/logo-pelu-eli.png';
import goDigitalLogo from '../../assets/LogoGo-Digital.png';

/**
 * Badge de sesión: Pelu Eli · Go-Digital · email del usuario autenticado.
 * Se usa en el header global para que aparezca en todos los formularios/vistas.
 */
export default function UserBrandBadge() {
  const { user } = useAuth();
  const email = user?.email?.trim() || '';

  return (
    <div className="ui-user-badge" title={email || 'Sesión activa'}>
      <img
        src={peluEliLogo}
        alt="Pelu Eli"
        className="ui-user-badge__logo ui-user-badge__logo--client"
      />
      <span className="ui-user-badge__divider" aria-hidden="true" />
      <img
        src={goDigitalLogo}
        alt="Go-Digital"
        className="ui-user-badge__logo ui-user-badge__logo--provider"
      />
      {email ? (
        <>
          <span className="ui-user-badge__divider" aria-hidden="true" />
          <span className="ui-user-badge__identity">
            <User size={13} strokeWidth={2.25} className="ui-user-badge__icon" aria-hidden="true" />
            <span className="ui-user-badge__email">{email}</span>
          </span>
        </>
      ) : null}
    </div>
  );
}
