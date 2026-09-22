import { Component } from 'react';
import Button from './ui/Button';

/**
 * Captura errores de render en el árbol hijo y muestra una pantalla de recuperación
 * en lugar de tumbar toda la app.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message =
      error?.message ||
      'Ocurrió un error inesperado al mostrar esta pantalla.';

    return (
      <div className="ui-login" role="alert">
        <div className="ui-login__card" style={{ textAlign: 'center', maxWidth: 440 }}>
          <h1 className="font-display ui-page-title" style={{ marginBottom: 8 }}>
            Algo salió mal
          </h1>
          <p className="ui-page-subtitle" style={{ marginBottom: 16 }}>
            {message}
          </p>
          <div className="ui-btn-row" style={{ justifyContent: 'center' }}>
            <Button variant="secondary" onClick={this.handleReset}>
              Reintentar
            </Button>
            <Button variant="primary" onClick={this.handleReload}>
              Recargar página
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
