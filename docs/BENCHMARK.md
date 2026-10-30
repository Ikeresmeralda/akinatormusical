# Benchmark del motor

Generado con `npm run bench` el 2026-10-30 sobre el catálogo semilla
(54.079 canciones; modo normal y Reto 20: 21.820).
Compilación del catálogo en memoria: 1.6 s.

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
| Normal · ganancia de información | 100 | 68.0 % | 14.0 % | 31.0 | 28 | 51 | 1.46 | 16.2 |
| Normal · preguntas al azar | 50 | 20.0 % | 0.0 % | 58.5 | 60 | 60 | 2.50 | 2.2 |
| Normal · cuestionario fijo | 50 | 32.0 % | 0.0 % | 60.0 | 60 | 60 | 3.25 | 2.2 |
| Normal · jugador muy despistado | 50 | 42.0 % | 2.0 % | 37.5 | 34 | 54 | 1.95 | 17.7 |
| Difícil · ganancia de información | 50 | 40.0 % | 6.0 % | 34.1 | 32 | 54 | 1.80 | 38.0 |
| Reto 20 · ganancia de información | 50 | 26.0 % | 26.0 % | 18.8 | 20 | 20 | 1.31 | 15.4 |

## Calibración de la confianza

El porcentaje que muestra la app en cada intento es el posterior de la canción propuesta. Si está bien
calibrado, los intentos al 90 % aciertan cerca del 90 % de las veces. Datos de las partidas con ganancia de
información de la tabla anterior:

| Confianza declarada | Intentos | Aciertos reales |
|---|---|---|
| 0–30 % | 669 | 2.5 % |
| 30–60 % | 81 | 33.3 % |
| 60–85 % | 82 | 57.3 % |
| 85–100 % | 48 | 64.6 % |
