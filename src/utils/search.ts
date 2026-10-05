// Case- and diacritic-insensitive fold ("João" matches "joao"): NFD splits
// accented letters into base + combining mark, then the marks are stripped.
export const foldForSearch = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const matchesSearch = (value: string, query: string): boolean => {
  const needle: string = foldForSearch(query.trim());
  return needle.length === 0 || foldForSearch(value).includes(needle);
};
