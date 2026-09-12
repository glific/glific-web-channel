// Two letters, so a mark reads as a monogram rather than as a truncated word. A single-word name
// gives its first two letters, which is why "Glific" shows "gl" rather than "g".
export const initialsFor = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toLowerCase();
  return (words[0][0] + words[1][0]).toLowerCase();
};
