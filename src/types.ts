export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  date: string;
  source: string;
  category: string;
  lat: number;
  lon: number;
  tags: string[];
  icon?: string;
  layerId: string;
}
