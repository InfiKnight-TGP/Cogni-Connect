# Map Navigator

**Level:** 3 (hard), the only level for this game
**Skill:** spatial (spatial orientation)
**Files:** `index.tsx` (UI & game loop), `data.ts` (grid graph, BFS shortest path, landmarks)

## How to Play

- **Map:** An SVG top-down town map built on a 4x4 grid of 16 junctions connected by roads. In each round, 3–5 random road segments are removed while maintaining a connected town graph.
- **Landmarks:** 6 to 8 familiar landmarks are placed on junctions (Home 🏠, Temple 🛕, Market 🛒, Pharmacy 💊, Bus stop 🚌, Tea shop 🍵, Pond 🌊, School 🏫).
- **Session Structure (4 Rounds):**
  - **Round 1:** 2 target goals
  - **Round 2:** 2 target goals
  - **Round 3:** 3 target goals
  - **Round 4:** 3 target goals + Go Home
- **Phases:**
  1. **MEMORISE (15s):** The map displays Home and numbered SVG circle goal badges (1, 2, 3) on the target landmarks. A 15-second countdown timer runs with the text "Remember where to go".
  2. **NAVIGATE:** Goal badges are hidden. An instruction banner displays the target goals in order (e.g. "Go to: 🛕 Temple, then 🛒 Market"). The player starts at Home and navigates step-by-step by tapping adjacent junctions (highlighted as large >=56px circles). The path walked is drawn on the map.
  3. **GO HOME (Round 4):** After reaching the 3rd goal in Round 4, the Home marker is hidden from the map and the player is asked "Now find your way back home".
  4. **HINT SYSTEM:** If the player makes 3 moves in a row that do not decrease the BFS shortest-path distance to the current active goal, that goal landmark flashes gold for 2 seconds and a hint is recorded.

## Scoring

- **Round Efficiency:**
  $$\text{Efficiency} = \min\left(100, \left\lfloor \frac{\text{Shortest Path Length (BFS)}}{\text{Player Path Length}} \times 100 \right\rfloor\right)$$
- **Session Score (0–100):**
  $$\text{Session Score} = \max\left(0, \min\left(100, \text{Average Efficiency} - 10 \times \text{Total Hints}\right)\right)$$
- `roundEfficiency` and `totalHints` are logged to the browser console via `console.log`.

When a patient has at least three saved places, the game adds a short **Your places** section after the map rounds. The final session score is the average of the map score and the percentage of place questions answered correctly. If there are not enough places or opening-hour details to build unambiguous questions, the game uses the map score alone.

## References

1. Coutrot, A., Silva, R., Manley, E., De Cothi, W., Sami, S., Bohbot, V. D., Wiener, J. M., Hölscher, C., Dalton, R. C., Hornberger, M., & Spiers, H. J. (2019). Virtual navigation tests in Sea Hero Quest provide global benchmarks for real-world wayfinding capability. *PLOS ONE*, 14(2), e0213272.
2. Sanchez-Escudero, J., et al. (2025). Usability and acceptability of NavegApp for spatial orientation assessment in older adults. *JMIR Serious Games*.

> **Note:** Navigation games are validated for assessment; we use this one for practice and for tracking orientation over time, not as a proven treatment.
