import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { api, type Meta } from '../api';

const fmt = new Intl.NumberFormat('es-ES');

export function About({ onBack }: { onBack: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    api.meta().then(setMeta, () => setMeta(null));
  }, []);
  return (
    <motion.main className="screen about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header className="game__bar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          ←
        </button>
        <h1 className="stats__title">Cómo funciona</h1>
        <span />
      </header>
      <article className="prose">
        <h2>Un detective, no un chatbot</h2>
        <p>
          No sigo un cuestionario fijo ni pregunto al azar. Para cada canción del catálogo calculo la probabilidad de que sea la tuya y, en cada
          turno, elijo la pregunta que <strong>más información aporta</strong>: la que, sea cual sea tu respuesta, más reduce la incertidumbre
          (ganancia de información esperada). Por eso empiezo con preguntas generales y termino con pistas muy concretas, como un artista o una
          palabra del título.
        </p>
        <h2>Tus respuestas no son blanco o negro</h2>
        <p>
          «Probablemente sí» pesa menos que «Sí», y «No lo sé» no cambia nada. Ninguna respuesta elimina del todo una canción: si te equivocas
          en una, puedo recuperarme con las siguientes. Y si ves que te has equivocado, puedes corregir la última respuesta.
        </p>
        <h2>Cuándo me la juego</h2>
        <p>
          Propongo una canción cuando la probabilidad de la favorita es alta o le saca mucha ventaja a la segunda. El porcentaje que ves es esa
          probabilidad, calibrada con miles de partidas simuladas para que sea honesta: lo que anuncio al 80 % acierta unas 8 de cada 10
          veces. Si fallo, la descarto y sigo investigando.
        </p>
        <h2>Datos reales y verificables</h2>
        <p>
          Nunca me invento canciones: solo propongo canciones de mi catálogo
          {meta ? <> de {fmt.format(meta.songs)} temas</> : null}, construido a partir de fuentes abiertas que puedes consultar.
        </p>
        <ul>
          {meta?.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.name}
              </a>{' '}
              <span className="muted">({s.license})</span>
            </li>
          ))}
        </ul>
        <p>
          Algunos datos, como el idioma, se deducen con reglas a partir de esas fuentes (idioma del título, género, país del artista) y los trato
          como probabilidades, no como hechos. Cuando a una canción le falta un dato, uso lo habitual en canciones parecidas (mismo género y
          década), sin mostrarlo nunca como un hecho.
        </p>
        <h2>Aprendo de cada partida</h2>
        <p>
          Cuando una partida termina y sé qué canción era, tus respuestas se suman a lo que sé de ella. Si muchas personas contestan algo
          distinto a mis datos, acabo corrigiéndolos. Al final te puedo pedir dos o tres respuestas extra sobre lo que no sé (por ejemplo, si se
          hizo viral en TikTok, un dato que no ofrece ninguna fuente pública fiable).
        </p>
        <h2>Limitaciones honestas</h2>
        <ul>
          <li>
            El catálogo actual se apoya sobre todo en las listas de Estados Unidos y en playlists latinas de Spotify. Hay huecos en la música
            española clásica que se cubrirán al conectar Wikidata.
          </li>
          <li>No tengo letras completas (tienen derechos de autor): uso temáticas anotadas, la etiqueta de contenido explícito y el título.</li>
          <li>De videojuegos y viralidad en redes solo sé lo que me enseñáis los jugadores.</li>
        </ul>
      </article>
    </motion.main>
  );
}
