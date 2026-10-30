import type { SourceInfo } from '@am/engine';

/**
 * Registro de fuentes del catálogo semilla. Todas son datasets abiertos y
 * verificables; el pipeline las descarga a `data/raw/` (no se versionan).
 */
export interface RawSource extends SourceInfo {
  /** Nombre del fichero local en data/raw. */
  file: string;
  download: string;
}

const TT = 'https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data';

export const SOURCES = {
  billboardCharts: {
    id: 'billboard',
    name: 'Billboard Hot 100 (archivo semanal 1958-hoy, mhollingshead/billboard-hot-100)',
    url: 'https://github.com/mhollingshead/billboard-hot-100',
    license: 'Datos factuales de listas de Billboard; atribución requerida',
    file: 'billboard_hot100_all.json',
    download: 'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/all.json',
  },
  ttBillboard: {
    id: 'tt-billboard',
    name: 'TidyTuesday 2021-09-14: Billboard Hot 100 1958-2021',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2021/2021-09-14',
    license: 'CC0 1.0',
    file: 'tt_2021_billboard.csv',
    download: `${TT}/2021/2021-09-14/billboard.csv`,
  },
  ttAudioFeatures: {
    id: 'tt-audio',
    name: 'TidyTuesday 2021-09-14: rasgos de audio y géneros de Spotify de las canciones del Hot 100',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2021/2021-09-14',
    license: 'CC0 1.0',
    file: 'tt_2021_audio_features.csv',
    download: `${TT}/2021/2021-09-14/audio_features.csv`,
  },
  ttSpotifySongs: {
    id: 'tt-spotify',
    name: 'TidyTuesday 2020-01-21: canciones de playlists de Spotify por género',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2020/2020-01-21',
    license: 'CC0 1.0',
    file: 'tt_2020_spotify_songs.csv',
    download: `${TT}/2020/2020-01-21/spotify_songs.csv`,
  },
  ttNumberOnes: {
    id: 'tt-numberones',
    name: 'TidyTuesday 2025-08-26: números 1 del Hot 100 anotados (Chris Dalla Riva, Uncharted Territory)',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2025/2025-08-26',
    license: 'CC0 1.0 (no se conservan las letras)',
    file: 'tt_2025_number_ones.csv',
    download: `${TT}/2025/2025-08-26/billboard.csv`,
  },
  ttEurovision: {
    id: 'tt-eurovision',
    name: 'TidyTuesday 2022-05-17: Festival de Eurovisión 1956-2022',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2022/2022-05-17',
    license: 'CC0 1.0',
    file: 'tt_2022_eurovision.csv',
    download: `${TT}/2022/2022-05-17/eurovision.csv`,
  },
  ttRollingStone: {
    id: 'tt-rollingstone',
    name: 'TidyTuesday 2024-05-07: Rolling Stone 500 álbumes (género y miembros del artista)',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2024/2024-05-07',
    license: 'CC0 1.0',
    file: 'tt_2024_rolling_stone.csv',
    download: `${TT}/2024/2024-05-07/rolling_stone.csv`,
  },
  ttRap: {
    id: 'tt-rap',
    name: 'TidyTuesday 2020-04-14: encuesta BBC de mejores canciones de hip hop',
    url: 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2020/2020-04-14',
    license: 'CC0 1.0',
    file: 'tt_2020_rap_rankings.csv',
    download: `${TT}/2020/2020-04-14/rankings.csv`,
  },
} satisfies Record<string, RawSource>;

export type SourceKey = keyof typeof SOURCES;
