export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export async function searchWeb(_query: string): Promise<SearchResult[]> {
  // TODO: integrate search provider (to be selected)
  void _query;
  return [];
}
