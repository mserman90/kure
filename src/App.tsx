/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { LAYER_CONFIG } from './services/api';
import { NewsItem } from './types';
import { cn } from './lib/utils';
import { Search, Loader2, Maximize2, X, Navigation, ExternalLink, Layers, Menu, RefreshCw } from 'lucide-react';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [layerData, setLayerData] = useState<Record<string, NewsItem[]>>({});
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(
    LAYER_CONFIG.reduce((acc, curr) => ({ ...acc, [curr.id]: true }), {})
  );
  const [layerColors, setLayerColors] = useState<Record<string, string>>(
    LAYER_CONFIG.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.defaultColor }), {})
  );
  
  const [showLayers, setShowLayers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<NewsItem | null>(null);
  const globeRef = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isHoveringNews, setIsHoveringNews] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const news = useMemo(() => {
    let combined: NewsItem[] = [];
    Object.keys(activeLayers).forEach(key => {
      if (activeLayers[key] && layerData[key]) {
        combined = [...combined, ...layerData[key]];
      }
    });
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeLayers, layerData]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        },
        (error) => {
          console.warn("Geolocation access denied or failed.", error);
        }
      );
    }
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const refreshData = async (isMounted = true) => {
    setLoading(true);
    setLoadingProgress(0);
    
    let completedCount = 0;
    const totalCount = LAYER_CONFIG.length;

    const promises = LAYER_CONFIG.map(async (layer) => {
      try {
        const items = await layer.updater();
        if (isMounted) {
          setLayerData(prev => ({ ...prev, [layer.id]: items }));
        }
      } catch (e) {
        console.error(`Failed to update layer ${layer.id}`, e);
      } finally {
        completedCount++;
        if (isMounted) {
          setLoadingProgress(Math.round((completedCount / totalCount) * 100));
        }
      }
    });

    await Promise.all(promises);
    
    if (isMounted) {
      setLoading(false);
      setIsInitialLoad(false);
      setTimeout(() => setLoadingProgress(0), 1000); // fade out progress bar slightly after finish
    }
  };

  useEffect(() => {
    let mounted = true;
    
    const triggerRefresh = () => refreshData(mounted);
    
    triggerRefresh();
    const interval = setInterval(triggerRefresh, 60000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    
    const scrollStep = (time: number) => {
       const dt = time - lastTime;
       lastTime = time;
       if (scrollContainerRef.current && !isHoveringNews && isSidebarOpen) {
         const el = scrollContainerRef.current;
         el.scrollTop += (dt * 0.035); // Approx 35 pixels per second
         // Reset when reaching bottom
         if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
            el.scrollTop = 0;
         }
       }
       animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHoveringNews, isSidebarOpen]);

  useEffect(() => {
    if (globeRef.current) {
        globeRef.current.controls().autoRotate = true;
        globeRef.current.controls().autoRotateSpeed = 0.5;
        // Make globe appear larger/closer initially
        globeRef.current.pointOfView({ altitude: 1.8 });
    }
  }, [loading]);

  const handleNewsClick = (item: NewsItem) => {
    setActiveItem(item);
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = false;
      globeRef.current.pointOfView({ lat: item.lat, lng: item.lon, altitude: 1.2 }, 1000);
    }
  };

  const handleReset = () => {
    setActiveItem(null);
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = true;
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 1.8 }, 1000);
    }
  };

  const htmlElementsData = useMemo(() => {
    // Include ALL layers in the Globe data to prevent DOM manipulation bugs
    let allElements: any[] = [];
    Object.keys(layerData).forEach(key => {
      const items = layerData[key] || [];
      const mapped = items.map(item => {
        const layerColor = layerColors[item.layerId] || '#7bddff';
        return {
          ...item,
          size: activeItem?.id === item.id ? 30 : 15,
          color: layerColor,
          shadowColor: layerColor
        };
      });
      allElements = [...allElements, ...mapped];
    });
    
    if (userLocation) {
      allElements.push({
        id: 'user_location',
        title: 'Mevcut Konumunuz',
        summary: 'Tarayıcı tarafından tespit edilen geçerli koordinatlarınız.',
        source: 'Kullanıcı GPS',
        category: 'Kullanıcı',
        date: 'ŞU AN',
        icon: '📍',
        layerId: 'user',
        lat: userLocation.lat,
        lon: userLocation.lon,
        tags: ['konum', 'gps'],
        size: activeItem?.id === 'user_location' ? 30 : 20,
        color: '#ff00ff', // distinct neon pink for user
        shadowColor: '#ff00ff'
      } as any);
    }
    
    return allElements;
  }, [layerData, layerColors, activeItem?.id, userLocation]);

  return (
    <div className="relative w-full h-screen bg-[#050510] text-[#e8f0ff] overflow-hidden font-sans">
      
      {/* Top Thin Progress Bar */}
      {(loading || loadingProgress > 0) && (
        <div className="absolute top-0 left-0 right-0 h-1 z-50 bg-black/50 overflow-hidden pointer-events-none">
          <div 
            className="h-full bg-[#7bddff] transition-all duration-300 ease-out relative"
            style={{ width: `${loadingProgress}%` }}
          >
            <div className="absolute inset-0 bg-white/50 animate-pulse"></div>
          </div>
        </div>
      )}

      {/* Initial Loading Overlay */}
      {isInitialLoad && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050510]/95 backdrop-blur-md pointer-events-none transition-opacity duration-1000">
           <Layers className="w-16 h-16 text-[#7bddff] mb-6 animate-pulse" />
           <h1 className="text-2xl tracking-widest uppercase text-white font-bold mb-2">OSINT Küresel Takip Merkezi</h1>
           <div className="text-[#a78bff] text-xs font-mono tracking-widest mb-8">VERİ AĞLARINA BAĞLANILIYOR...</div>
           
           <div className="w-64 h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
             <div 
               className="h-full bg-gradient-to-r from-[#4400ff] via-[#7bddff] to-[#4400ff] bg-[length:200%_100%] animate-[sh_2s_infinite] transition-all duration-300 relative"
               style={{ width: `${loadingProgress}%` }}
             >
             </div>
           </div>
           <div className="mt-3 font-mono text-[10px] text-white/50">{loadingProgress}% TAMAMLANDI</div>
        </div>
      )}

      <div className="absolute inset-0 cursor-grab active:cursor-grabbing globe-container">
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          onGlobeClick={handleReset}
          htmlLat="lat"
          htmlLng="lon"
          htmlAltitude={0.01}
          htmlElementsTransitionDuration={0}
          htmlElementsData={htmlElementsData}
          htmlElement={(d: any) => {
            const el = document.createElement('div');
            el.className = `point-marker-container layer-marker-${d.layerId}`;
            el.style.pointerEvents = 'none'; // Allow passing grab events to globe by default
            el.innerHTML = `
              <div class="pin-hitbox" style="pointer-events: auto; padding: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; transform: translate(-50%, -50%);">
                <div class="point-marker" style="
                  width: ${d.size}px; height: ${d.size}px; 
                  background: ${d.color}; border-radius: 50%; opacity: 0.9;
                  box-shadow: 0 0 ${d.size === 30 ? '20px' : '10px'} ${d.shadowColor};
                  border: ${d.size === 30 ? '2px solid white' : 'none'};
                "></div>
                <div class="point-tooltip">
                  <div style="font-weight: bold; margin-bottom: 2px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${d.title}</div>
                  <div style="color: ${d.color}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;">${d.source}</div>
                </div>
              </div>
            `;
            
            let startX = 0, startY = 0;
            const hitbox = el.querySelector('.pin-hitbox') as HTMLElement;
            
            hitbox.onpointerdown = (e) => {
              startX = e.clientX;
              startY = e.clientY;
            };
            
            hitbox.onpointerup = (e) => {
              // Only trigger click if it wasn't a drag motion
              if (Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) {
                e.stopPropagation();
                handleNewsClick(d as NewsItem);
              }
            };
            
            return el;
          }}
        />
      </div>

      <div className="absolute top-4 left-4 right-4 z-40 flex justify-between pointer-events-none">
        
        {/* Sidebar Toggle */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-xl bg-[#0f1423]/80 backdrop-blur-md border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-all shadow-lg"
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={() => refreshData(true)}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#0f1423]/80 backdrop-blur-md border border-white/10 text-white/80 hover:bg-[#7bddff]/20 hover:border-[#7bddff] hover:text-[#7bddff] transition-all shadow-lg"
            title="Verileri Yenile"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>

          {/* Layers Button */}
          <div className="relative">
            <button 
              onClick={() => setShowLayers(!showLayers)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase border rounded-xl backdrop-blur-md transition-all shadow-lg",
                showLayers ? "bg-[#7bddff]/20 border-[#7bddff] text-[#7bddff]" : "bg-[#0f1423]/80 border-white/10 text-white/80 hover:bg-white/10"
              )}
            >
              <Layers className="w-4 h-4" />
              KATMANLAR
            </button>
            
            {showLayers && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-[#0f1423]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-3 z-50 max-h-[70vh] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                <h3 className="text-[10px] tracking-widest uppercase text-[#a78bff] font-semibold mb-2 px-1">Aktif Katmanlar</h3>
                
                {LAYER_CONFIG.map(layer => (
                  <div key={layer.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg">
                    <label className="text-xs font-semibold flex items-center gap-2 cursor-pointer flex-1" title={layer.name}>
                      {layer.icon} 
                      <span className="truncate max-w-[120px]">{layer.name}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={layerColors[layer.id]}
                        onChange={(e) => setLayerColors(l => ({ ...l, [layer.id]: e.target.value }))}
                        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input 
                        type="checkbox" 
                        checked={!!activeLayers[layer.id]}
                        onChange={(e) => setActiveLayers(l => ({ ...l, [layer.id]: e.target.checked }))}
                        className="accent-[#7bddff] w-4 h-4 flex-shrink-0 cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className={cn(
        "absolute left-4 top-16 bottom-4 w-72 md:w-80 flex flex-col z-20 bg-[#0f1423]/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl overflow-hidden transition-transform duration-300 pointer-events-auto",
        isSidebarOpen ? "translate-x-0" : "-translate-x-[150%]"
      )}>
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/20">
          <h2 className="text-xs tracking-widest uppercase text-[#7bddff] font-semibold flex items-center gap-2">
            <Search className="w-4 h-4" />
          </h2>
          {loading && <Loader2 className="w-4 h-4 text-[#7bddff] animate-spin" />}
        </header>
        
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 custom-scrollbar"
          ref={scrollContainerRef}
          onMouseEnter={() => setIsHoveringNews(true)}
          onMouseLeave={() => setIsHoveringNews(false)}
        >
          {news.length === 0 && !loading && (
            <div className="text-center py-10 text-white/40 text-sm">Hiç veri bulunamadı.</div>
          )}
          {news.map((item) => (
            <div 
              key={item.id}
              onClick={() => handleNewsClick(item)}
              className={cn(
                "p-3 rounded-xl border border-transparent cursor-pointer transition-all duration-200 hover:bg-white/5",
                activeItem?.id === item.id ? "bg-white/10 border-y-white/5 border-r-white/5 pl-2.5 border-l-[3px]" : "border-b-white/5"
              )}
              style={activeItem?.id === item.id ? { borderLeftColor: layerColors[item.layerId] } : {}}
            >
              <div className="text-[10px] tracking-wider uppercase mb-1 font-semibold flex items-center gap-1.5" style={{ color: layerColors[item.layerId] }}>
                {item.icon || '📍'} {item.category}
              </div>
              <div className="text-xs font-semibold leading-relaxed text-[#f0f5ff] line-clamp-2">
                {item.title}
              </div>
              <div className="text-[10px] text-white/40 mt-1.5">
                {item.date}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {activeItem && (
        <div className="absolute right-4 bottom-4 w-[min(400px,calc(100vw-32px))] z-40 bg-[#0f1423]/60 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="px-5 py-4 bg-gradient-to-br from-white/5 to-transparent border-b border-white/10 flex gap-3 items-start">
            <div className="text-3xl drop-shadow-md">{activeItem.icon || '📍'}</div>
            <div className="flex-1 pr-6">
              <div className="text-[10px] tracking-wider uppercase mb-1 font-semibold" style={{ color: layerColors[activeItem.layerId] }}>
                {activeItem.category}
              </div>
              <h2 className="text-sm font-bold text-white leading-snug">
                {activeItem.title}
              </h2>
            </div>
            <button 
              onClick={() => setActiveItem(null)}
              className="absolute top-4 right-4 p-1.5 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-5">
            <div className="text-[11px] text-[#7bddff] mb-2 font-medium flex items-center gap-1.5">
              <Navigation className="w-3 h-3" />
              Koordinat: {activeItem.lat.toFixed(4)}, {activeItem.lon.toFixed(4)}
            </div>
            <div className="text-xs leading-relaxed text-[#e8f0ff]/80 mb-4 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar pr-2">
              {activeItem.summary}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2 mt-auto">
              {activeItem.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[#d0bfff]">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-3 bg-black/20 border-t border-white/10">
            <button 
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Haritayı Sıfırla
            </button>
            <a 
              href={activeItem.link}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border border-[#a78bff]/30 bg-[#a78bff]/20 text-[#e8d5ff] hover:brightness-110 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Kaynağa Git
            </a>
          </div>
        </div>
      )}

      {/* Dynamic CSS for Layer Visibility */}
      <style dangerouslySetInnerHTML={{__html: `
        ${Object.keys(activeLayers).map(key => 
          activeLayers[key] === false ? `.layer-marker-${key} { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }` : ''
        ).join('\n')}
      `}} />

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes sh {
          to { background-position: -200% 0; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .scene-container {
          outline: none !important;
        }
        
        .point-marker-container {
          position: relative;
        }
        .point-marker {
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .point-marker-container:hover .point-marker {
          transform: translate(-50%, -50%) scale(1.3) !important;
          opacity: 1 !important;
        }
        .point-tooltip {
          position: absolute;
          bottom: 15px; /* Positioned just above the pin */
          left: 50%;
          transform: translateX(-50%) translateY(0);
          background: rgba(15, 20, 35, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #fff;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.4;
          width: max-content;
          max-width: 200px;
          text-align: center;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          pointer-events: none;
          z-index: 50;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
        }
        .point-marker-container:hover .point-tooltip {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) translateY(-5px);
        }
      `}} />
    </div>
  );
}
