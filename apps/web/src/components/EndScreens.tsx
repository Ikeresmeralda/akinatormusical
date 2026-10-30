import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Answer, AnswerRecord, Mode, PublicQuestion, SongView } from '@am/engine';
import { api, type FinishResult } from '../api';
import { ANSWER_LABELS, APP_NAME } from '../config';
import { challengePoints, computeStats, loadGames } from '../game/localStats';
import type { GameResult } from '../game/useGame';
import { Confetti } from './Confetti';
import { CoverArt } from './CoverArt';
import { Mascot } from './Mascot';

function SongSummary({ song }: { song: SongView }) {
  return (
    <div className="song-summary">
      <CoverArt id={song.id} title={song.title} size={76} />
      <div>
        <p className="song-summary__title">{song.title}</p>
        <p className="song-summary__artist">
          {song.credit} · {song.year ?? '—'}
        </p>
        <div className="songcard__links">
          {song.links.map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="pill pill--small">
              {l.label} ↗
            </a>
          ))}
        </div>
        {song.sources.length > 0 && (
          <details className="sources">
            <summary>De dónde sale este dato</summary>
            <ul>
              {song.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/** Respuestas que no cuadraban con los datos + preguntas para rellenar huecos. */
function LearnPanel({ finish, song }: { finish: FinishResult | null; song: SongView }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sent, setSent] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  if (!finish) return <p className="muted small">Guardando la partida…</p>;
  const questions: PublicQuestion[] = finish.learningQuestions;
  const submit = async () => {
    const list: AnswerRecord[] = Object.entries(answers).map(([q, a]) => ({ q, a }));
    if (!list.length) return;
    setSent('sending');
    try {
      await api.learn(finish.gameId, list);
      setSent('done');
    } catch {
      setSent('error');
    }
  };
  return (
    <div className="learn">
      {finish.insights.length > 0 && (
        <div className="insights">
          <p className="insights__title">Algunas respuestas no cuadraban con mis datos</p>
          <ul>
            {finish.insights.map((m) => (
              <li key={m.questionId}>
                «{m.question}» → dijiste <strong>{ANSWER_LABELS[m.answer]}</strong>; mis datos dicen <strong>{m.dataSaysYes ? 'sí' : 'no'}</strong>.
              </li>
            ))}
          </ul>
          <p className="muted small">No pasa nada: cuento con que se puede dudar. Tus respuestas quedan registradas y, si más gente coincide, corregiré el dato.</p>
        </div>
      )}
      {questions.length > 0 && sent !== 'done' && (
        <div className="teachme">
          <p className="teachme__title">¿Me ayudas a aprender? Sobre «{song.title}»:</p>
          {questions.map((q) => (
            <div key={q.id} className="teachme__q">
              <span>{q.text}</span>
              <div className="teachme__opts">
                {(['yes', 'no', 'unknown'] as Answer[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`chipbtn ${answers[q.id] === a ? 'chipbtn--on' : ''}`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
                  >
                    {ANSWER_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="btn btn--ghost" disabled={!Object.keys(answers).length || sent === 'sending'} onClick={submit}>
            {sent === 'sending' ? 'Enviando…' : 'Enseñar'}
          </button>
          {sent === 'error' && <p className="muted small">No se pudo enviar. Inténtalo más tarde.</p>}
        </div>
      )}
      {sent === 'done' && <p className="thanks">¡Gracias! Lo tendré en cuenta en las próximas partidas.</p>}
    </div>
  );
}

function shareText(result: GameResult): string {
  if (!result.song) return `He jugado a ${APP_NAME}, el detective musical.`;
  return result.winner === 'ai'
    ? `🎧 ${APP_NAME} adivinó «${result.song.title}» de ${result.song.credit} en ${result.questions} preguntas. ¿Le ganas?`
    : `🏆 He ganado a ${APP_NAME} con «${result.song.title}» de ${result.song.credit}. ¿Le ganas tú?`;
}

function ShareButton({ result }: { result: GameResult }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = shareText(result);
    try {
      if (navigator.share) await navigator.share({ text, url: location.origin });
      else {
        await navigator.clipboard.writeText(`${text} ${location.origin}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // El usuario canceló el diálogo de compartir.
    }
  };
  return (
    <button type="button" className="btn btn--ghost" onClick={share}>
      {copied ? '¡Copiado!' : 'Compartir'}
    </button>
  );
}

export function Victory({ mode, result, onAgain, onHome }: { mode: Mode; result: GameResult; onAgain: () => void; onHome: () => void }) {
  const song = result.song!;
  // Récord: comparar con las partidas anteriores (la actual ya está guardada)
  const record = useMemo(() => {
    const previous = loadGames().filter((g) => g.winner === 'ai' && g.song?.id !== undefined).slice(1);
    const best = computeStats(previous).bestQuestions;
    return best !== null && result.questions < best;
  }, [result.questions]);
  return (
    <motion.main className="screen end end--won" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Confetti active />
      <Mascot mood="happy" size={150} />
      <h1 className="end__title">{mode === 'challenge' ? '¡Esta ronda es mía!' : '¡Lo sabía!'}</h1>
      <p className="end__subtitle">
        Adivinada en <strong>{result.questions}</strong> {result.questions === 1 ? 'pregunta' : 'preguntas'}
        {result.guesses > 1 && <> y {result.guesses} intentos</>}
        {result.confidence !== undefined && <> · {Math.round(result.confidence * 100)} % de confianza</>}
      </p>
      {record && result.questions > 0 && <p className="record">⭐ ¡Mi mejor marca contigo!</p>}
      {mode === 'challenge' && <p className="record">+{challengePoints({ winner: 'ai', questions: result.questions, guesses: result.guesses })} puntos para la IA</p>}
      <SongSummary song={song} />
      <LearnPanel finish={result.finish} song={song} />
      <div className="end__actions">
        <button type="button" className="btn btn--primary btn--xl" onClick={onAgain}>
          Jugar otra vez
        </button>
        <ShareButton result={result} />
        <button type="button" className="link" onClick={onHome}>
          Inicio
        </button>
      </div>
    </motion.main>
  );
}

function SongSearch({ onPick, onMissing }: { onPick: (song: SongView) => void; onMissing: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SongView[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .search(q)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="search">
      <input
        ref={input}
        className="search__input"
        type="search"
        placeholder="Escribe el título o el artista…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar canción"
      />
      <ul className="search__results" aria-live="polite">
        {results.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s)}>
              <CoverArt id={s.id} title={s.title} size={40} />
              <span>
                <strong>{s.title}</strong>
                <small>
                  {s.credit} · {s.year ?? '—'}
                </small>
              </span>
            </button>
          </li>
        ))}
        {!loading && q.trim().length >= 2 && results.length === 0 && <li className="muted small">Sin resultados en el catálogo.</li>}
      </ul>
      <button type="button" className="link" onClick={onMissing}>
        No está en tu catálogo
      </button>
    </div>
  );
}

function MissingSongForm({ gameId, onDone }: { gameId?: number; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  if (state === 'sent') {
    return (
      <p className="thanks">
        Gracias. La anoto como sugerencia, pero no la añadiré al juego hasta poder verificarla en una fuente musical fiable.
      </p>
    );
  }
  return (
    <form
      className="missing"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.missing(title, artist, gameId);
          setState('sent');
        } catch {
          setState('error');
        }
      }}
    >
      <input className="search__input" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
      <input className="search__input" placeholder="Artista" value={artist} onChange={(e) => setArtist(e.target.value)} required maxLength={160} />
      <div className="missing__actions">
        <button type="submit" className="btn btn--ghost">
          Enviar sugerencia
        </button>
        <button type="button" className="link" onClick={onDone}>
          Volver a buscar
        </button>
      </div>
      {state === 'error' && <p className="muted small">No se pudo enviar.</p>}
    </form>
  );
}

export function Defeat({
  mode,
  result,
  onReveal,
  onAgain,
  onHome,
}: {
  mode: Mode;
  result: GameResult;
  onReveal: (song: SongView | null) => Promise<FinishResult | null>;
  onAgain: () => void;
  onHome: () => void;
}) {
  const [missing, setMissing] = useState(false);
  const song = result.song;
  return (
    <motion.main className="screen end end--lost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Mascot mood={song ? 'smug' : 'sad'} size={140} />
      <h1 className="end__title">{mode === 'challenge' ? '¡Me has ganado!' : 'Me rindo… esta vez'}</h1>
      {!song ? (
        <>
          <p className="end__subtitle">
            {result.questions} preguntas y {result.guesses} {result.guesses === 1 ? 'intento' : 'intentos'}. ¿En qué canción pensabas?
          </p>
          {result.candidates && result.candidates.length > 0 && (
            <p className="muted small">Dudaba entre: {result.candidates.map((c) => `«${c.song.title}» (${c.song.credit})`).join(', ')}.</p>
          )}
          {missing ? <MissingSongForm gameId={undefined} onDone={() => setMissing(false)} /> : <SongSearch onPick={(s) => void onReveal(s)} onMissing={() => setMissing(true)} />}
        </>
      ) : (
        <>
          <p className="end__subtitle">¡Era esta! La recordaré para la próxima.</p>
          {mode === 'challenge' && <p className="record">+{challengePoints({ winner: 'player', questions: result.questions, guesses: result.guesses })} puntos para ti</p>}
          <SongSummary song={song} />
          <LearnPanel finish={result.finish} song={song} />
        </>
      )}
      <div className="end__actions">
        <button type="button" className="btn btn--primary btn--xl" onClick={onAgain}>
          Jugar otra vez
        </button>
        {song && <ShareButton result={result} />}
        <button type="button" className="link" onClick={onHome}>
          Inicio
        </button>
      </div>
    </motion.main>
  );
}
