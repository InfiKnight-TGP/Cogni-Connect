// Map Navigator — graph generator, landmarks, and BFS utilities.

export interface Junction {
  id: number; // 0 to 15
  row: number; // 0 to 3
  col: number; // 0 to 3
  x: number; // SVG coordinate x
  y: number; // SVG coordinate y
}

export interface Landmark {
  key: string;
  name: string;
  emoji: string;
  isHome?: boolean;
}

export const LANDMARK_POOL: Landmark[] = [
  { key: "home", name: "Home", emoji: "🏠", isHome: true },
  { key: "temple", name: "Temple", emoji: "🛕" },
  { key: "market", name: "Market", emoji: "🛒" },
  { key: "pharmacy", name: "Pharmacy", emoji: "💊" },
  { key: "bus_stop", name: "Bus stop", emoji: "🚌" },
  { key: "tea_shop", name: "Tea shop", emoji: "🍵" },
  { key: "pond", name: "Pond", emoji: "🌊" },
  { key: "school", name: "School", emoji: "🏫" },
];

export const GRID_SIZE = 4;
export const TOTAL_NODES = GRID_SIZE * GRID_SIZE; // 16

// Map 16 junctions to SVG x,y coordinates inside 500x500 viewBox
export const JUNCTIONS: Junction[] = Array.from({ length: TOTAL_NODES }, (_, id) => {
  const row = Math.floor(id / GRID_SIZE);
  const col = id % GRID_SIZE;
  return {
    id,
    row,
    col,
    x: 65 + col * 123,
    y: 65 + row * 123,
  };
});

// Adjacency list graph representation: node id -> list of connected node ids
export type Graph = Record<number, number[]>;

// Helper to shuffle array
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Check if graph is connected (all 16 nodes can be reached from node 0). */
export function isGraphConnected(graph: Graph): boolean {
  const visited = new Set<number>();
  const queue = [0];
  visited.add(0);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const neighbor of graph[curr] || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited.size === TOTAL_NODES;
}

/** BFS shortest path distance between startNode and endNode. */
export function getBFSDistance(graph: Graph, startNode: number, endNode: number): number {
  if (startNode === endNode) return 0;

  const visited = new Set<number>([startNode]);
  const queue: [number, number][] = [[startNode, 0]];

  while (queue.length > 0) {
    const [curr, dist] = queue.shift()!;
    for (const neighbor of graph[curr] || []) {
      if (neighbor === endNode) return dist + 1;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }

  return Infinity;
}

/** Generate all possible 24 grid edges for 4x4 grid. */
function getAllGridEdges(): [number, number][] {
  const edges: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const curr = r * GRID_SIZE + c;
      if (c + 1 < GRID_SIZE) {
        const right = r * GRID_SIZE + (c + 1);
        edges.push([curr, right]);
      }
      if (r + 1 < GRID_SIZE) {
        const down = (r + 1) * GRID_SIZE + c;
        edges.push([curr, down]);
      }
    }
  }
  return edges;
}

/**
 * Generate a connected 4x4 grid graph with 3-5 random road segments removed.
 */
export function generateGraph(rng: () => number = Math.random): Graph {
  const allEdges = getAllGridEdges();

  for (let attempt = 0; attempt < 1000; attempt++) {
    const edgesToRemoveCount = Math.floor(rng() * 3) + 3; // 3, 4, or 5
    const shuffledEdges = shuffle(allEdges, rng);
    const remainingEdges = shuffledEdges.slice(edgesToRemoveCount);

    // Build adjacency list
    const graph: Graph = {};
    for (let i = 0; i < TOTAL_NODES; i++) {
      graph[i] = [];
    }
    for (const [u, v] of remainingEdges) {
      graph[u].push(v);
      graph[v].push(u);
    }

    if (isGraphConnected(graph)) {
      return graph;
    }
  }

  // Fallback to full grid graph if needed
  const fallbackGraph: Graph = {};
  for (let i = 0; i < TOTAL_NODES; i++) fallbackGraph[i] = [];
  for (const [u, v] of allEdges) {
    fallbackGraph[u].push(v);
    fallbackGraph[v].push(u);
  }
  return fallbackGraph;
}

export interface RoundSetup {
  graph: Graph;
  landmarkPos: Record<string, number>; // landmark key -> junction id
  goalKeys: string[]; // sequence of goal landmark keys
}

/**
 * Build a round setup:
 * - 6 to 8 landmarks placed on random junctions.
 * - Goal selection constraint:
 *   1. Never Home
 *   2. Each goal must be at least 2 roads (BFS distance >= 2) from the previous waypoint.
 */
export function buildRoundSetup(goalCount: number, isRound4: boolean = false, rng: () => number = Math.random, knob = 2): RoundSetup {
  for (let attempt = 0; attempt < 500; attempt++) {
    const graph = generateGraph(rng);
    const landmarkCount = Math.min(LANDMARK_POOL.length, Math.floor(rng() * (knob >= 3 ? 2 : 1)) + (knob >= 3 ? 7 : 5));
    const selectedLandmarks = LANDMARK_POOL.slice(0, landmarkCount);

    const junctionIds = shuffle(Array.from({ length: TOTAL_NODES }, (_, i) => i), rng);
    const landmarkPos: Record<string, number> = {};

    selectedLandmarks.forEach((lm, idx) => {
      landmarkPos[lm.key] = junctionIds[idx];
    });

    const homeNode = landmarkPos["home"];
    const nonHomeLandmarks = selectedLandmarks.filter((lm) => lm.key !== "home");

    // Select goal keys such that distance between consecutive waypoints >= 2
    let validGoals: string[] | null = null;
    const shuffledNonHome = shuffle(nonHomeLandmarks, rng);

    for (let gAttempt = 0; gAttempt < 100; gAttempt++) {
      const candidateGoals = shuffle(shuffledNonHome, rng).slice(0, goalCount).map((lm) => lm.key);

      let prevNode = homeNode;
      let ok = true;

      for (const gKey of candidateGoals) {
        const gNode = landmarkPos[gKey];
        if (getBFSDistance(graph, prevNode, gNode) < 2) {
          ok = false;
          break;
        }
        prevNode = gNode;
      }

      if (ok && isRound4) {
        // Round 4 ends by going back home from last goal.
        // Check dist(lastGoal, home) >= 2
        if (getBFSDistance(graph, prevNode, homeNode) < 2) {
          ok = false;
        }
      }

      if (ok) {
        validGoals = candidateGoals;
        break;
      }
    }

    if (validGoals) {
      return {
        graph,
        landmarkPos,
        goalKeys: validGoals,
      };
    }
  }

  // Safe fallback if loop exhausts
  const graph = generateGraph(rng);
  const landmarkPos: Record<string, number> = {};
  LANDMARK_POOL.forEach((lm, idx) => {
    landmarkPos[lm.key] = idx;
  });
  return {
    graph,
    landmarkPos,
    goalKeys: goalCount === 2 ? ["temple", "market"] : ["temple", "market", "pharmacy"],
  };
}
