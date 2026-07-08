// アンケート選択肢の表示順を固定するユーティリティ（Prisma スキーマ変更なし）
// DB は orderBy なしだと投票の UPDATE 後に行の返却順が変わることがあるため、id で安定ソートする。

export const surveyOptionsOrderBy = { id: 'asc' as const };

export function sortSurveyOptions<T extends { id: string }>(options: T[]): T[] {
  return [...options].sort((a, b) => a.id.localeCompare(b.id));
}

/** 作成時の入力順を id の辞書順で保持する（surveyId_0000, surveyId_0001, ...） */
export function makeSurveyOptionId(surveyId: string, index: number): string {
  return `${surveyId}_${String(index).padStart(4, '0')}`;
}
