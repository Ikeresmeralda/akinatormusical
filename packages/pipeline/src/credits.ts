import { normArtist } from './text';

/**
 * División de créditos en artistas individuales.
 *
 * Los separadores de "featuring" siempre dividen. Los separadores ambiguos
 * ("&", ",", "and") solo dividen si TODAS las partes aparecen en algún sitio
 * de los datos como artista independiente: así "Lady Gaga & Bruno Mars" se
 * divide, pero "Simon & Garfunkel" o "Earth, Wind & Fire" se quedan enteros.
 */
const FEATURING_CASE_SENSITIVE_X = /\s+x\s+/; // "Kygo x Whitney Houston", pero no "Lil Nas X"
const AMBIGUOUS = /\s*,\s*&\s*|\s*,\s*and\s+|\s*,\s*|\s+&\s+|\s+and\s+|\s+\+\s+|\s+vs\.?\s+|\s+y\s+/i;

function featSplit(credit: string): string[] {
  const out: string[] = [];
  for (const part of credit.split(/\s+(?:featuring|feat\.?|ft\.?|duet with|with)\s+/i)) {
    out.push(...part.split(FEATURING_CASE_SENSITIVE_X));
  }
  return out.map((p) => p.trim().replace(/^[,&]\s*|\s*[,&]$/g, '')).filter(Boolean);
}

export class ArtistRegistry {
  private standalone = new Set<string>();

  /** Registra un crédito completo: su parte principal y cada invitado cuentan como artistas independientes. */
  observeCredit(credit: string): void {
    for (const part of featSplit(credit)) this.standalone.add(normArtist(part));
  }

  /** Registra un nombre que sabemos que es un único artista (p. ej. `track_artist` de Spotify). */
  observeArtist(name: string): void {
    this.standalone.add(normArtist(name));
  }

  isStandalone(name: string): boolean {
    return this.standalone.has(normArtist(name));
  }

  split(credit: string): string[] {
    const result: string[] = [];
    for (const part of featSplit(credit)) {
      const pieces = part.split(AMBIGUOUS).map((p) => p.trim()).filter(Boolean);
      if (pieces.length > 1 && pieces.every((p) => this.isStandalone(p))) result.push(...pieces);
      else result.push(part);
    }
    const seen = new Set<string>();
    return result.filter((name) => {
      const key = normArtist(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export function hasFeaturing(credit: string): boolean {
  return featSplit(credit).length > 1;
}
