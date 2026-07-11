/**
 * 添削コメント（理由文・誤→正）から文法カテゴリを推定する。
 * 構造化タグが無いためヒューリスティック。先頭一致優先。
 */

export type GrammarCategoryId =
  | "spelling"
  | "tense"
  | "number"
  | "article"
  | "preposition"
  | "collocation"
  | "agreement"
  | "word_order"
  | "voice"
  | "relative"
  | "infinitive_gerund"
  | "modal"
  | "conjunction"
  | "pronoun"
  | "comparison"
  | "negation"
  | "punctuation"
  | "vocabulary"
  | "structure"
  | "other";

export type GrammarCategoryDef = {
  id: GrammarCategoryId;
  label: string;
  /** 理由・誤・正を結合したテキストに対する判定 */
  patterns: RegExp[];
};

/** プルダウン／チェック用のカテゴリ一覧（その他以外を先に） */
export const GRAMMAR_CATEGORY_DEFS: GrammarCategoryDef[] = [
  {
    id: "spelling",
    label: "スペルミス",
    patterns: [/スペル/, /綴り/, /つづり/, /spelling/i, /misspell/i, /typo/i, /誤字/],
  },
  {
    id: "tense",
    label: "時制",
    patterns: [
      /時制/,
      /tense/i,
      /過去形/,
      /現在形/,
      /未来形/,
      /完了形/,
      /進行形/,
      /過去分詞/,
      /現在分詞/,
      /三単現/,
      /\bV-?ed\b/i,
    ],
  },
  {
    id: "number",
    label: "単数・複数",
    patterns: [/単数/, /複数/, /plural/i, /singular/i, /可算/, /不可算/, /数えられない/, /数えられる/],
  },
  {
    id: "article",
    label: "冠詞",
    patterns: [/冠詞/, /不定冠詞/, /定冠詞/, /\ba\/an\b/i, /\bthe\b.*冠/, /冠.*\bthe\b/i],
  },
  {
    id: "preposition",
    label: "前置詞",
    patterns: [/前置詞/, /preposition/i, /前置詞の選択/, /前置詞が/],
  },
  {
    id: "collocation",
    label: "コロケーション",
    patterns: [/コロケーション/, /コロケ/, /collocation/i, /語の結び/, /慣用表現/, /決まり文句/],
  },
  {
    id: "agreement",
    label: "主語と動詞の一致",
    patterns: [/一致/, /agreement/i, /主語.*動詞/, /動詞.*主語/, /三単現の-?s/],
  },
  {
    id: "word_order",
    label: "語順",
    patterns: [/語順/, /word\s*order/i, /語の並び/, /倒置/],
  },
  {
    id: "voice",
    label: "能動態・受動態",
    patterns: [/受動態/, /能動態/, /passive/i, /active\s*voice/i, /be\s*動詞.*過去分詞/],
  },
  {
    id: "relative",
    label: "関係詞",
    patterns: [/関係詞/, /関係代名詞/, /関係副詞/, /relative\s*(pronoun|clause)/i],
  },
  {
    id: "infinitive_gerund",
    label: "不定詞・動名詞",
    patterns: [/不定詞/, /動名詞/, /to\s*不定詞/, /gerund/i, /infinitive/i, /to\s*V/, /V-?ing/],
  },
  {
    id: "modal",
    label: "助動詞",
    patterns: [/助動詞/, /modal/i, /\bshould\b/i, /\bmust\b/i, /\bcould\b/i, /\bwould\b/i, /\bmight\b/i],
  },
  {
    id: "conjunction",
    label: "接続詞",
    patterns: [/接続詞/, /conjunction/i, /接続の/, /\bbecause\b/i, /\balthough\b/i, /\bwhile\b/i],
  },
  {
    id: "pronoun",
    label: "代名詞",
    patterns: [/代名詞/, /pronoun/i, /所有格/, /目的格/, /所有代名詞/, /\bit\s*is\b/i, /there\s*(is|are)/i],
  },
  {
    id: "comparison",
    label: "比較表現",
    patterns: [/比較級/, /最上級/, /比較表現/, /比較/, /comparative/i, /superlative/i],
  },
  {
    id: "negation",
    label: "否定",
    patterns: [/否定/, /二重否定/, /negation/i, /\bnever\b/i, /no\s+longer/i],
  },
  {
    id: "punctuation",
    label: "句読点・記号",
    patterns: [/カンマ/, /コンマ/, /ピリオド/, /クエスチョン/, /句読点/, /punctuation/i, /コンマの/],
  },
  {
    id: "vocabulary",
    label: "語彙選択",
    patterns: [/語彙/, /単語の選択/, /語の選択/, /word\s*choice/i, /意味が違う/, /不自然な語/, /語感/],
  },
  {
    id: "structure",
    label: "文構造",
    patterns: [/文構造/, /構文/, /文型/, /clause/i, /節の/, /構造が/, /SVO/, /文の組み立て/],
  },
  {
    id: "other",
    label: "その他",
    patterns: [],
  },
];

const LABEL_BY_ID = new Map(GRAMMAR_CATEGORY_DEFS.map((d) => [d.id, d.label]));

export function grammarCategoryLabel(id: GrammarCategoryId | string): string {
  return LABEL_BY_ID.get(id as GrammarCategoryId) ?? id;
}

export function allGrammarCategoryIds(): GrammarCategoryId[] {
  return GRAMMAR_CATEGORY_DEFS.map((d) => d.id);
}

/** 理由・誤・正から最も近いカテゴリを1つ返す */
export function classifyGrammarCategory(input: {
  wrong: string;
  correct: string;
  reason: string;
}): GrammarCategoryId {
  const hay = `${input.reason}\n${input.wrong}\n${input.correct}`;
  for (const def of GRAMMAR_CATEGORY_DEFS) {
    if (def.id === "other") continue;
    if (def.patterns.some((re) => re.test(hay))) return def.id;
  }
  return "other";
}
