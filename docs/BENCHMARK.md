# Benchmark del motor

Generado con `npm run bench` el 2026-10-30 sobre el catálogo semilla
(54.079 canciones; modo normal y Reto 20: 21.820).
Compilación del catálogo en memoria: 2.0 s.

## Qué mide

Cada partida elige una canción objetivo al azar según el prior del modo, así que en modo normal salen más
los éxitos. Un **jugador simulado** responde a las preguntas del motor:

- Donde el catálogo tiene el dato, la respuesta «verdadera» se muestrea de ese dato.
- Donde no lo tiene, el jugador conoce un valor oculto que el motor no sabe, como pasa con un jugador real.
- Contesta «No lo sé» con la tasa propia de cada pregunta, usa «Probablemente» un 20 % de las veces y se
  equivoca un 4 % (un 12 % en el escenario «muy despistado»).

Las dos líneas base usan **la misma inferencia bayesiana y la misma política de intento**. Solo cambia cómo se
elige la siguiente pregunta, así que la diferencia mide el valor de elegir por ganancia de información.

> Limitación honesta: el jugador simulado responde según los mismos datos que usa el motor, así que esto mide la
> eficiencia de la estrategia, no la precisión de los datos frente a personas reales. Con jugadores reales
> pesan además los huecos y errores del catálogo, y el aprendizaje los va corrigiendo.

## Resultados

| Escenario | Partidas | Acierto | Acierto en ≤ 20 preguntas | Media de preguntas (aciertos) | Mediana | P90 | Intentos por acierto | ms por turno |
|---|---|---|---|---|---|---|---|---|
| Normal · ganancia de información | 300 | 72.7 % | 16.3 % | 31.7 | 29 | 54 | 1.43 | 15.9 |
| Normal · preguntas al azar | 150 | 21.3 % | 0.0 % | 58.3 | 60 | 60 | 2.56 | 2.2 |
| Normal · cuestionario fijo | 150 | 23.3 % | 0.0 % | 60.0 | 60 | 60 | 2.80 | 2.3 |
| Normal · jugador muy despistado | 150 | 34.7 % | 6.0 % | 35.3 | 33 | 60 | 1.83 | 17.6 |
| Difícil · ganancia de información | 150 | 42.0 % | 2.0 % | 35.2 | 32 | 51 | 1.60 | 39.6 |
| Reto 20 · ganancia de información | 150 | 27.3 % | 27.3 % | 18.7 | 20 | 20 | 1.46 | 16.6 |

## Calibración de la confianza

El porcentaje que muestra la app en cada intento es el posterior de la canción propuesta, calibrado con un
escalado de Platt (`CONFIDENCE_CALIBRATION` en `engine.ts`). Si está bien calibrado, los intentos al 90 %
aciertan cerca del 90 % de las veces.

**Modo normal, jugador estándar:**

| Confianza declarada | Intentos | Aciertos reales |
|---|---|---|
| 0–30 % | 496 | 4.4 % |
| 30–60 % | 135 | 46.7 % |
| 60–85 % | 130 | 73.1 % |
| 85–100 % | 43 | 88.4 % |

**Todos los escenarios con ganancia de información** (incluye al jugador que se equivoca un 12 % y el modo difícil,
donde la misma confianza acierta menos):

| Confianza declarada | Intentos | Aciertos reales |
|---|---|---|
| 0–30 % | 1965 | 3.2 % |
| 30–60 % | 303 | 33.3 % |
| 60–85 % | 253 | 63.2 % |
| 85–100 % | 63 | 81.0 % |

Los intentos por debajo del 30 % son sobre todo los que la IA hace al agotar las preguntas, cuando ya no tiene
nada mejor que probar.
