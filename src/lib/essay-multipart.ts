/** Nexus ESSAY_PROMPT_MULTIPART と同じラベル形式（【(1)】…【(2)】…） */
export function joinEssayMultipartBlocks(parts: string[]): string {
  const blocks: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const t = parts[i]!.trim();
    blocks.push(`【(${i + 1})】\n${t}`);
  }
  return blocks.join("\n\n");
}
