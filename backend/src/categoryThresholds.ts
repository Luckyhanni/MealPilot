export type CategoryThresholds = {
  fastMaxMinutes: number;
  highProteinMinProteinPerServing: number;
  lowCalMaxKcal: number;
};

export const defaultCategoryThresholds = {
  fastMaxMinutes: 30,
  highProteinMinProteinPerServing: 50,
  lowCalMaxKcal: 650,
} as const satisfies CategoryThresholds;
