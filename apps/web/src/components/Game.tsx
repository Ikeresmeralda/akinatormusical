import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Answer, Decision, Mode } from '@am/engine';
import { ANSWER_LABELS, ANSWER_OPTIONS, MODE_INFO } from '../config';
import type { LoggedAnswer } from '../game/useGame';
import { Mascot } from './Mascot';

const fmt = new Intl.NumberFormat('es-ES');

/** Número que se anima suavemente hacia su nuevo valor. */
function useTweened(value: number, ms = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      const v = a + (value - a) * eased;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return shown;
}

export function Game({
  mode,
  decision,
  log,
  pending,
  error,
  onAnswer,
  onUndo,
  onRetry,
  onHome,
  onSurrender,
}: {
  mode: Mode;
  decision: Decision | null;
  log: LoggedAnswer[];
  pending: boolean;
  error: string | null;
  onAnswer: (a: Answer) => void;
  onUndo: () => void;
  onRetry: () => void;
  onHome: () => void;
  onSurrender: () => void;
}) {
  const question = decision?.type === 'question' ? decision.question : null;
  const progress = decision?.progress;
  const candidates = useTweened(progress?.effectiveCandidates ?? progress?.poolSize ?? 0);
  const confidence = useTweened((progress?.topConfidence ?? 0) * 100);
  const asked = log.length;
  const maxQ = progress?.maxQuestions ?? 60;
  const [showLog, setShowLog] = useState(false);

  // Atajos: 1-5 para responder, retroceso para deshacer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const opt = ANSWER_OPTIONS.find((o) => o.key === e.key);
      if (opt) {
        e.preventDefault();
        onAnswer(opt.value);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer, onUndo]);

  return (
    <motion.main className="screen game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="game__bar">
        <button type="button" className="icon-btn" onClick={onHome} aria-label="Volver al inicio">
          ←
        </button>
        <span className="badge">
          {MODE_INFO[mode].emoji} {MODE_INFO[mode].name}
        </span>
        <span className="game__counter" aria-live="polite">
          Pregunta <strong>{asked + 1}</strong>
          {mode === 'challenge' && <span className="game__max"> / {maxQ}</span>}
        </span>
      </header>

      <section className="meter" aria-label="Progreso de la deducción">
        <div className="meter__row">
          <span className="meter__label">Canciones posibles</span>
          <span className="meter__value">≈ {fmt.format(Math.max(1, Math.round(candidates)))}</span>
        </div>
        <div className="meter__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(confidence)}>
          <div className="meter__fill" style={{ width: `${Math.max(2, confidence)}%` }} />
        </div>
        <div className="meter__row meter__row--small">
          <span>Certeza de mi mejor sospecha</span>
          <span>{confidence.toFixed(confidence < 10 ? 1 : 0)} %</span>
        </div>
        {mode === 'challenge' && (
          <div className="dots" aria-label={`Preguntas usadas: ${asked} de ${maxQ}`}>
            {Array.from({ length: maxQ }, (_, i) => (
              <span key={i} className={`dot ${i < asked ? 'dot--used' : ''}`} />
            ))}
          </div>
        )}
      </section>

      <div className="game__stage">
        <div className="game__mascot">
          <Mascot mood={pending ? 'thinking' : asked > 8 && (progress?.topConfidence ?? 0) > 0.3 ? 'smug' : 'idle'} size={92} />
        </div>
        <div className="card-stack">
          <div className="card-stack__ghost card-stack__ghost--2" />
          <div className="card-stack__ghost card-stack__ghost--1" />
          <AnimatePresence mode="wait">
            {question ? (
              <motion.article
                key={question.id + asked}
                data-question-id={question.id}
                className={`qcard ${pending ? 'qcard--pending' : ''}`}
                initial={{ opacity: 0, y: 40, rotate: 2, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, x: -80, rotate: -6, transition: { duration: 0.22 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <span className="chip">
                  <span aria-hidden="true">{question.icon}</span> {question.familyLabel}
                  {question.dynamic && <span className="chip__hint">pista nueva</span>}
                </span>
                <h2 className="qcard__text" aria-live="polite">
                  {question.text}
                </h2>
              </motion.article>
            ) : (
              <motion.article key="loading" className="qcard qcard--loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="eq" aria-label="Pensando">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
                <p>Pensando…</p>
              </motion.article>
            )}
          </AnimatePresence>
        </div>
      </div>

      {error ? (
        <div className="alert" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="answers" role="group" aria-label="Respuestas">
          {ANSWER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`answer answer--${o.value}`}
              disabled={pending || !question}
              onClick={() => onAnswer(o.value)}
            >
              <span className="answer__icon" aria-hidden="true">
                {o.icon}
              </span>
              <span className="answer__label">{o.label}</span>
              <kbd className="answer__key" aria-hidden="true">
                {o.key}
              </kbd>
            </button>
          ))}
        </div>
      )}

      <div className="game__footer">
        <button type="button" className="link" onClick={onUndo} disabled={!log.length || pending}>
          ↶ Corregir la última respuesta
        </button>
        {log.length > 0 && (
          <button type="button" className="link" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
            {showLog ? 'Ocultar' : 'Ver'} mis respuestas ({log.length})
          </button>
        )}
        {asked >= 10 && (
          <button type="button" className="link link--muted" onClick={onSurrender}>
            Revelar mi canción
          </button>
        )}
      </div>

      <AnimatePresence>
        {showLog && (
          <motion.ol className="history" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {log.map((l, i) => (
              <li key={i}>
                <span className="history__q">
                  {i + 1}. {l.question.text}
                </span>
                <span className={`history__a history__a--${l.answer}`}>{ANSWER_LABELS[l.answer]}</span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
