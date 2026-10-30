# Benchmark del motor

Generado con `npm run bench` el 2026-10-30 sobre el catálogo semilla
(54.079 canciones; modo normal y Reto 20: 21.820).
Compilación del catálogo en memoria: 2.1 s.

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
| Normal · ganancia de información | 300 | 73.3 % | 12.3 % | 33.1 | 31 | 57 | 1.60 | 14.3 |
| Normal · preguntas al azar | 150 | 22.0 % | 0.0 % | 58.3 | 60 | 60 | 2.58 | 2.1 |
| Normal · cuestionario fijo | 150 | 22.0 % | 0.0 % | 60.0 | 60 | 60 | 2.70 | 2.1 |
| Normal · jugador muy despistado | 150 | 42.0 % | 5.3 % | 38.6 | 40 | 58 | 1.92 | 16.8 |
| Difícil · ganancia de información | 150 | 52.7 % | 4.0 % | 36.4 | 34 | 58 | 1.62 | 32.3 |
| Reto 20 · ganancia de información | 150 | 28.0 % | 28.0 % | 18.7 | 20 | 20 | 1.50 | 14.8 |

## Calibración de la confianza

El porcentaje que muestra la app en cada intento es el posterior de la canción propuesta. Si está bien
calibrado, los intentos al 90 % aciertan cerca del 90 % de las veces. Datos de las partidas con ganancia de
información de la tabla anterior:

| Confianza declarada | Intentos | Aciertos reales |
|---|---|---|
| 0–30 % | 1743 | 3.1 % |
| 30–60 % | 247 | 30.4 % |
| 60–85 % | 334 | 48.2 % |
| 85–100 % | 163 | 69.9 % |
