import { AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { About } from './components/About';
import { Defeat, Victory } from './components/EndScreens';
import { Game } from './components/Game';
import { GuessReveal } from './components/GuessReveal';
import { Home } from './components/Home';
import { Stats } from './components/Stats';
import { useGame } from './game/useGame';

export function App() {
  const game = useGame();
  const { state } = game;
  const again = () => game.start(state.mode);
  const home = () => game.go('home');

  // Cada pantalla empieza arriba (si no, se hereda el desplazamiento de la anterior)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.screen]);

  return (
    <div className="app">
      <div className="backdrop" aria-hidden="true">
        <span className="blob blob--a" />
        <span className="blob blob--b" />
        <span className="blob blob--c" />
      </div>
      <AnimatePresence mode="wait">
        {state.screen === 'home' && (
          <Home key="home" onStart={game.start} onResume={game.resume} onStats={() => game.go('stats')} onAbout={() => game.go('about')} />
        )}
        {state.screen === 'play' && (
          <Game
            key="play"
            mode={state.mode}
            decision={state.decision}
            log={state.log}
            pending={state.pending}
            error={state.error}
            onAnswer={game.answer}
            onUndo={game.undo}
            onRetry={game.retry}
            onHome={home}
            onSurrender={game.surrender}
          />
        )}
        {state.screen === 'guess' && state.decision?.type === 'guess' && (
          <GuessReveal
            key={`guess-${state.decision.song.id}`}
            decision={state.decision}
            pending={state.pending}
            onConfirm={(ok) => void game.confirmGuess(ok)}
            onUndo={game.undo}
          />
        )}
        {state.screen === 'won' && state.result && <Victory key="won" mode={state.mode} result={state.result} onAgain={again} onHome={home} />}
        {state.screen === 'lost' && state.result && (
          <Defeat key="lost" mode={state.mode} result={state.result} onReveal={game.reveal} onAgain={again} onHome={home} />
        )}
        {state.screen === 'stats' && <Stats key="stats" onBack={home} />}
        {state.screen === 'about' && <About key="about" onBack={home} />}
      </AnimatePresence>
    </div>
  );
}
