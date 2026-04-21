import { NewsItem } from '../types';

async function fetchRss(url: string) {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch { return []; }
}

const hashStr = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
};

const REGIONS = [
  { keys: ['red sea', 'yemen', 'houthi', 'bab el-mandeb'], lat: 12.5833, lon: 43.3333, name: "Kızıldeniz / Babülmendep" },
  { keys: ['black sea', 'ukraine', 'bosphorus', 'crimea'], lat: 44.0000, lon: 33.0000, name: "Karadeniz Merkez" },
  { keys: ['mediterranean', 'cyprus', 'greece', 'turkey'], lat: 34.0000, lon: 32.0000, name: "Doğu Akdeniz" },
  { keys: ['pacific', 'taiwan', 'south china sea', 'philippines', 'japan'], lat: 24.0000, lon: 119.0000, name: "Pasifik / Tayvan" },
  { keys: ['baltic', 'sweden', 'finland', 'poland'], lat: 57.0000, lon: 19.0000, name: "Baltık Denizi" },
  { keys: ['atlantic', 'nato', 'uk'], lat: 45.0000, lon: -20.0000, name: "Atlantik Okyanusu" },
  { keys: ['persian gulf', 'iran', 'hormuz', 'centcom'], lat: 26.5000, lon: 56.2000, name: "Hürmüz Boğazı" },
  { keys: ['arctic', 'russia', 'alaska', 'ice'], lat: 75.0000, lon: -40.0000, name: "Kuzey Kutbu" },
  { keys: ['indian ocean', 'india', 'maldives'], lat: -10.0000, lon: 70.0000, name: "Hint Okyanusu" }
];

export async function fetchUSNINews(): Promise<NewsItem[]> {
  try {
    const items = await fetchRss('https://news.usni.org/feed');
    return items.map((item: any) => {
      const combinedText = (item.title + " " + (item.description || "")).toLowerCase();
      let r = REGIONS.find(rg => rg.keys.some(k => combinedText.includes(k))) || { name: "Bilinmeyen Bölge", lat: 38.89, lon: -77.03 };
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = item.description || "";
      const hStr = item.guid || item.title || "";
      const seed = hashStr(hStr);
      return {
        id: 'usni_' + seed.toString(36),
        title: item.title,
        summary: `Bölge: ${r.name}\n${(tempDiv.textContent || "").substring(0, 150)}...`,
        link: item.link || "https://news.usni.org/",
        date: new Date(item.pubDate).toLocaleString('tr-TR'),
        source: "USNI News", category: "Maritime SIGINT",
        lat: r.lat + ((seed % 100) / 100 - 0.5) * 5, 
        lon: r.lon + (((seed * 7) % 100) / 100 - 0.5) * 5,
        tags: ["donanma"], icon: '🚢', layerId: 'usni'
      };
    });
  } catch { return []; }
}

export async function fetchEarthquakes(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).slice(0, 8).map((f: any) => ({
      id: 'eq_' + f.id,
      title: `M${f.properties.mag.toFixed(1)} - ${f.properties.place}`,
      summary: `USGS Sismik Ağları tarafından deprem tespit edildi. Derinlik: ${f.geometry.coordinates[2].toFixed(1)} km.`,
      link: f.properties.url, date: new Date(f.properties.time).toLocaleString('tr-TR'),
      source: "USGS", category: "Doğal Afet",
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
      tags: ["deprem"], icon: '🌋', layerId: 'eq'
    }));
  } catch { return []; }
}

export async function fetchISS(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
    if (!res.ok) return [];
    const data = await res.json();
    return [{
      id: 'iss', title: "Uluslararası Uzay İstasyonu",
      summary: `Hız: ${Math.round(data.velocity)} km/s | İrtifa: ${Math.round(data.altitude)} km`,
      link: "https://wheretheiss.at", date: "CANLI",
      source: "ISS Takip", category: "Uzay / Yörünge",
      lat: data.latitude, lon: data.longitude, tags: ["iss"], icon: '🛰️', layerId: 'iss'
    }];
  } catch { return []; }
}

export async function fetchPlanes(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://api.airplanes.live/v2/mil');
    if(!res.ok) return [];
    const data = await res.json();
    return (data.ac || [])
      .filter((s:any) => s.lat >= 12 && s.lat <= 42 && s.lon >= 26 && s.lon <= 63)
      .slice(0, 10).map((s:any) => ({
        id: 'plane_' + s.hex, title: `Hava Aracı: ${s.flight?.trim() || s.hex}`,
        summary: `Tip: ${s.desc || "Askeri"} | İrtifa: ${Math.round((s.alt_baro||0)*0.3048)}m`,
        link: `https://globe.airplanes.live/?icao=${s.hex}`, date: "CANLI RADAR",
        source: "Airplanes.live", category: "Aviation SIGINT",
        lat: s.lat, lon: s.lon, tags: ["radar", "askeri"], icon: '🛩️', layerId: 'planes'
      }));
  } catch { return []; }
}

export async function fetchConflicts(): Promise<NewsItem[]> {
  const feeds = [
    { url: 'https://ukraine.liveuamap.com/rss', name: "Ukrayna (Liveuamap)", lat: 48.37, lon: 31.16 },
    { url: 'https://syria.liveuamap.com/rss', name: "Suriye (Liveuamap)", lat: 34.80, lon: 38.99 }
  ];
  let results: NewsItem[] = [];
  for (const feed of feeds) {
    const items = await fetchRss(feed.url);
    results.push(...items.slice(0, 3).map((item:any) => {
      const hStr = item.guid || item.title || "";
      const seed = hashStr(hStr);
      return {
        id: 'conflict_' + seed.toString(36),
        title: item.title, summary: "Çatışma ve Siyasi Şiddet Raporu",
        link: item.link, date: item.pubDate || "GÜNCEL",
        source: feed.name, category: "Siyasi Şiddet",
        lat: feed.lat + ((seed % 100) / 100 - 0.5) * 4, 
        lon: feed.lon + (((seed * 7) % 100) / 100 - 0.5) * 4,
        tags: ["osint", "conflict"], icon: '⚠️', layerId: 'conflicts'
      };
    }));
  }
  return results;
}

export async function fetchFires(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=5');
    if(!res.ok) return [];
    const data = await res.json();
    return (data.events || []).map((e:any) => {
      const geo = e.geometry[e.geometry.length - 1];
      return {
        id: 'fire_' + e.id, title: e.title,
        summary: `NASA ${e.sources.map((s:any)=>s.id).join(',')} uyduları ile termal anomali tespit edildi.`,
        link: e.sources[0]?.url || "https://firms.modaps.eosdis.nasa.gov/",
        date: new Date(geo.date).toLocaleString('tr-TR'),
        source: "NASA EONET", category: "Uydu Termal",
        lat: geo.coordinates[1], lon: geo.coordinates[0], tags: ["yangın"], icon: '🔥', layerId: 'fires'
      };
    });
  } catch { return []; }
}

export async function fetchDefNews(): Promise<NewsItem[]> {
  const items = await fetchRss('https://breakingdefense.com/feed/');
  return items.slice(0, 4).map((item:any) => {
    const hStr = item.guid || item.title || "";
    const seed = hashStr(hStr);
    return {
      id: 'def_' + seed.toString(36),
      title: item.title, summary: "Savunma Sanayii ve Küresel Güvenlik",
      link: item.link, date: item.pubDate || "GÜNCEL",
      source: "Breaking Defense", category: "Savunma Haberleri",
      lat: 38.89 + ((seed % 100) / 100 - 0.5) * 2, 
      lon: -77.03 + (((seed * 7) % 100) / 100 - 0.5) * 2,
      tags: ["savunma"], icon: '📰', layerId: 'defnews'
    };
  });
}

export async function fetchLaunches(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://lldev.thespacedevs.com/2.2.0/launch/upcoming/?limit=4');
    if(!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((l:any) => ({
      id: 'launch_' + l.id, title: l.name,
      summary: l.mission?.description || "Yakın zamanlı uzay fırlatması.",
      link: l.url, date: new Date(l.net).toLocaleString('tr-TR'),
      source: "The Space Devs", category: "Uzay Görevleri",
      lat: parseFloat(l.pad?.latitude || 0), lon: parseFloat(l.pad?.longitude || 0),
      tags: ["roket"], icon: '🚀', layerId: 'launches'
    }));
  } catch { return []; }
}

export async function fetchStarlink(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://api.spacexdata.com/v4/starlink');
    if(!res.ok) return [];
    const data = await res.json();
    return data.filter((s:any) => s.latitude && s.longitude).slice(0, 5).map((s:any) => ({
      id: 'starlink_' + s.id, title: s.spaceTrack?.OBJECT_NAME || "Starlink",
      summary: `İrtifa: ${Math.round(s.height_km||550)} km`,
      link: "https://www.starlink.com/map", date: "CANLI İLETİŞİM",
      source: "SpaceX API", category: "Starlink Ağı",
      lat: s.latitude, lon: s.longitude, tags: ["leo"], icon: '🌐', layerId: 'starlink'
    }));
  } catch { return []; }
}

export const LAYER_CONFIG = [
  { id: 'usni', name: 'Maritime SIGINT', icon: '🚢', updater: fetchUSNINews, defaultColor: '#3b82f6' },
  { id: 'planes', name: 'Aviation SIGINT', icon: '🛩️', updater: fetchPlanes, defaultColor: '#a855f7' },
  { id: 'conflicts', name: 'Siyasi Şiddet (OSINT)', icon: '⚠️', updater: fetchConflicts, defaultColor: '#ef4444' },
  { id: 'defnews', name: 'Savunma Haberleri', icon: '📰', updater: fetchDefNews, defaultColor: '#64748b' },
  { id: 'eq', name: 'Doğal Afet (USGS)', icon: '🌋', updater: fetchEarthquakes, defaultColor: '#f97316' },
  { id: 'fires', name: 'Uydu Termal (NASA)', icon: '🔥', updater: fetchFires, defaultColor: '#dc2626' },
  { id: 'iss', name: 'Uzay İstasyonu (ISS)', icon: '🛰️', updater: fetchISS, defaultColor: '#10b981' },
  { id: 'starlink', name: 'Starlink Ağı', icon: '🌐', updater: fetchStarlink, defaultColor: '#0ea5e9' },
  { id: 'launches', name: 'Uzay Görevleri', icon: '🚀', updater: fetchLaunches, defaultColor: '#eab308' },
];
