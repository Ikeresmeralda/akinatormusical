import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { Mode } from '@am/engine';
import { api, type GlobalStats } from '../api';
import { MODE_INFO } from '../config';
import { computeStats, loadGames } from '../game/localStats';

const pct = (x: number) => `${Math.round(x * 100)} %`;
const num = (x: number | null) => (x === null ? '—' : x.toFixed(1).replace('.', ','));

function Histogram({ data }: { data: Array<{ bucket: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="histogram" role="img" aria-label="Preguntas necesarias para acertar">
      {data.map((d) => (
        <div key={d.bucket} className="histogram__col">
          <span className="histogram__count">{d.count || ''}</span>
          <div className="histogram__bar" style={{ height: `${(d.count / max) * 100}%` }} />
          <span className="histogram__label">{d.bucket}</span>
        </div>
      ))}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <span className="tile__value">{value}</span>
      <span className="tile__label">{label}</span>
      {hint && <span className="tile__hint">{hint}</span>}
    </div>
  );
}

export function Stats({ onBack }: { onBack: () => void }) {
  const games = useMemo(loadGames, []);
  const mine = useMemo(() => computeStats(games), [games]);
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [tab, setTab] = useState<'mine' | 'global'>('mine');

  useEffect(() => {
    api.stats().then(setGlobal, () => setGlobal(null));
  }, []);

  return (
    <motion.main className="screen stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="game__bar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          ←
        </button>
        <h1 className="stats__title">Estadísticas</h1>
        <span />
      </header>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={`tab ${tab === 'mine' ? 'tab--on' : ''}`} onClick={() => setTab('mine')}>
          Tus partidas
        </button>
        <button type="button" role="tab" aria-selected={tab === 'global'} className={`tab ${tab === 'global' ? 'tab--on' : ''}`} onClick={() => setTab('global')}>
          Todos los jugadores
        </button>
      </div>

      {tab === 'mine' ? (
        mine.total === 0 ? (
          <p className="empty">Aún no has jugado ninguna partida en este navegador.</p>
        ) : (
          <>
            <div className="tiles">
              <Tile label="Partidas" value={String(mine.total)} />
              <Tile label="La IA acertó" value={pct(mine.aiWinRate)} hint={`${mine.aiWins} de ${mine.total}`} />
              <Tile label="Preguntas de media" value={num(mine.avgQuestions)} hint="cuando acierta" />
              <Tile label="Récord" value={mine.bestQuestions === null ? '—' : String(mine.bestQuestions)} hint="menos preguntas" />
            </div>
            <h2 className="section-title">¿Cuántas preguntas necesitó?</h2>
            <Histogram data={mine.histogram} />

            <h2 className="section-title">Reto 20</h2>
            <div className="scoreboard">
              <div>
                <span className="scoreboard__who">Tú</span>
                <span className="scoreboard__wins">{mine.challenge.player}</span>
                <span className="scoreboard__pts">{mine.challenge.playerPoints} pts</span>
              </div>
              <span className="scoreboard__vs">vs</span>
              <div>
                <span className="scoreboard__who">IA</span>
                <span className="scoreboard__wins">{mine.challenge.ai}</span>
                <span className="scoreboard__pts">{mine.challenge.aiPoints} pts</span>
              </div>
            </div>
            <p className="muted small">La IA suma más puntos cuanto antes acierta; tú ganas 15 cada vez que no la encuentra en 20 preguntas.</p>

            <h2 className="section-title">Por modo</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Modo</th>
                  <th>Partidas</th>
                  <th>Acierto IA</th>
                  <th>Media</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
                  <tr key={m}>
                    <td>
                      {MODE_INFO[m].emoji} {MODE_INFO[m].name}
                    </td>
                    <td>{mine.byMode[m].total}</td>
                    <td>{mine.byMode[m].total ? pct(mine.byMode[m].aiWins / mine.byMode[m].total) : '—'}</td>
                    <td>{num(mine.byMode[m].avgQuestions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="section-title">Últimas partidas</h2>
            <ul className="recent">
              {games.slice(0, 10).map((g) => (
                <li key={g.id}>
                  <span className={`recent__badge recent__badge--${g.winner}`}>{g.winner === 'ai' ? 'IA' : 'Tú'}</span>
                  <span className="recent__song">{g.song ? `${g.song.title} — ${g.song.credit}` : 'Canción sin revelar'}</span>
                  <span className="recent__q">{g.questions} preg.</span>
                </li>
              ))}
            </ul>
          </>
        )
      ) : !global ? (
        <p className="empty">Cargando estadísticas globales…</p>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Partidas jugadas" value={String(global.games)} />
            <Tile label="La IA acertó" value={pct(global.winRate)} />
            <Tile label="Preguntas de media" value={num(global.avgQuestionsWon)} hint="cuando acierta" />
            <Tile label="Datos aprendidos" value={String(global.learnedFacts)} hint="canción × pregunta" />
          </div>
          <h2 className="section-title">¿Cuántas preguntas necesitó?</h2>
          <Histogram data={global.questionsHistogram} />
          {global.topSongs.length > 0 && (
            <>
              <h2 className="section-title">Las canciones más pensadas</h2>
              <ol className="recent">
                {global.topSongs.map((t) => (
                  <li key={t.song.id}>
                    <span className="recent__song">
                      {t.song.title} — {t.song.credit}
                    </span>
                    <span className="recent__q">{t.count}×</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </motion.main>
  );
}
