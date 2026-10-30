import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Decision } from '@am/engine';
import { ANSWER_LABELS } from '../config';
import { CoverArt } from './CoverArt';
import { Mascot } from './Mascot';

type GuessDecision = Extract<Decision, { type: 'guess' }>;

function ConfidenceRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" aria-label={`Confianza: ${Math.round(value * 100)} %`}>
      <svg viewBox="0 0 80 80" width="88" height="88">
        <circle cx="40" cy="40" r={r} className="ring__track" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          className="ring__value"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <span className="ring__label">
        {Math.round(value * 100)}
        <small>%</small>
      </span>
    </div>
  );
}

export function GuessReveal({
  decision,
  pending,
  onConfirm,
  onUndo,
}: {
  decision: GuessDecision;
  pending: boolean;
  onConfirm: (correct: boolean) => void;
  onUndo: () => void;
}) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [revealed, setRevealed] = useState(reduced);
  const { song, confidence, clues, progress } = decision;
  const attempt = progress.guesses + 1;

  useEffect(() => {
    setRevealed(reduced);
    if (reduced) return;
    const t = setTimeout(() => setRevealed(true), 1300);
    return () => clearTimeout(t);
  }, [song.id, reduced]);

  return (
    <motion.main className="screen guess" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="spotlight" aria-hidden="true" />
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div key="drumroll" className="drumroll" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}>
            <Mascot mood="excited" size={170} />
            <p className="drumroll__text">Creo que ya lo tengo…</p>
            <div className="eq eq--big" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="reveal" className="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="reveal__kicker">
              {attempt === 1 ? '¿Estás pensando en…' : `Intento ${attempt} de ${progress.maxGuesses}: ¿es…`}
            </p>
            <motion.article
              className="songcard"
              initial={{ rotateY: reduced ? 0 : 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
            >
              <CoverArt id={song.id} title={song.title} size={150} />
              <div className="songcard__info">
                <h2 className="songcard__title">{song.title}</h2>
                <p className="songcard__artist">{song.credit}</p>
                <p className="songcard__meta">
                  {song.year ?? 'Año desconocido'}
                  {song.work && <> · de «{song.work}»</>}
                </p>
                <div className="songcard__links">
                  {song.links.map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="pill">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </div>
              <ConfidenceRing value={confidence} />
            </motion.article>

            {clues.length > 0 && (
              <motion.div className="clues" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <p className="clues__title">Lo he deducido porque:</p>
                <ul>
                  {clues.map((c, i) => (
                    <li key={i}>
                      <span>{c.question}</span>
                      <strong>{ANSWER_LABELS[c.answer]}</strong>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            <div className="reveal__actions">
              <button type="button" className="btn btn--yes btn--xl" disabled={pending} onClick={() => onConfirm(true)}>
                ¡Sí, es esa!
              </button>
              <button type="button" className="btn btn--no btn--xl" disabled={pending} onClick={() => onConfirm(false)}>
                No, no es esa
              </button>
            </div>
            <button type="button" className="link" onClick={onUndo} disabled={pending}>
              ↶ Me equivoqué en la última respuesta
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
