export const moleLevels = [
  { label: "Level 2", gridSize: 3, lengths: [3, 4, 5, 6, 7] },
  { label: "Level 3", gridSize: 4, lengths: [4, 5, 6, 7, 8] },
] as const;

export function makePath(gridSize: number, length: number) {
  const holes = Array.from({ length: gridSize * gridSize }, (_, index) => index);
  for (let index = holes.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [holes[index], holes[swap]] = [holes[swap], holes[index]];
  }
  return holes.slice(0, length);
}
