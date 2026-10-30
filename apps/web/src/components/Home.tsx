import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Mode } from '@am/engine';
import { api, type Meta } from '../api';
import { APP_NAME, APP_TAGLINE, MODE_INFO } from '../config';
import { hasSavedGame } from '../game/useGame';
import { Mascot } from './Mascot';

const fmt = new Intl.NumberFormat('es-ES');

export function Home({
  onStart,
  onResume,
  onStats,
  onAbout,
}: {
  onStart: (mode: Mode) => void;
  onResume: () => void;
  onStats: () => void;
  onAbout: () => void;
}) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return (localStorage.getItem('oido-absoluto:mode') as Mode) || 'normal';
    } catch {
      return 'normal';
    }
  });
  const [meta, setMeta] = useState<Meta | null>(null);
  const [canResume] = useState(hasSavedGame);

  useEffect(() => {
    api.meta().then(setMeta, () => setMeta(null));
  }, []);

  const start = () => {
    try {
      localStorage.setItem('oido-absoluto:mode', mode);
    } catch {
      // preferencia opcional
    }
    onStart(mode);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <motion.main className="screen home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }}>
      <div className="home__hero">
        <Mascot mood="idle" size={190} />
        <h1 className="home__title">
          {APP_NAME}
          <span>{APP_TAGLINE}</span>
        </h1>
        <p className="home__prompt">Piensa en una canción y trataré de adivinarla.</p>
      </div>

      <div className="modes" role="radiogroup" aria-label="Modo de juego">
        {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`mode ${mode === m ? 'mode--active' : ''}`}
            onClick={() => setMode(m)}
          >
            <span className="mode__emoji" aria-hidden="true">
              {MODE_INFO[m].emoji}
            </span>
            <span className="mode__name">{MODE_INFO[m].name}</span>
            <span className="mode__blurb">{MODE_INFO[m].blurb}</span>
            {meta && <span className="mode__count">{fmt.format(meta.pools[m])} canciones</span>}
          </button>
        ))}
      </div>

      <div className="home__actions">
        <button type="button" className="btn btn--primary btn--xl" onClick={start}>
          Empezar
        </button>
        {canResume && (
          <button type="button" className="btn btn--ghost" onClick={onResume}>
            Continuar la partida anterior
          </button>
        )}
      </div>

      <nav className="home__links">
        <button type="button" className="link" onClick={onStats}>
          📊 Estadísticas
        </button>
        <button type="button" className="link" onClick={onAbout}>
          🔍 Cómo funciona
        </button>
      </nav>

      <footer className="home__footer">
        {meta ? (
          <>
            {fmt.format(meta.songs)} canciones reales de fuentes verificables (Billboard Hot 100, Spotify, Eurovisión…). Nunca me invento
            canciones.
          </>
        ) : (
          'Conectando con el catálogo…'
        )}
      </footer>
    </motion.main>
  );
}
