import React, { useState, useEffect, useRef } from 'react';
import { searchAddress, GeocodeResult, mapAddressToHierarchy } from '@/utils/geocoding';

interface NominatimSearchProps {
  onSelect: (result: {
    lat: number;
    lng: number;
    hierarchy: {
      state: string;
      district: string;
      city: string;
      ward: string;
      area: string;
      zone: string;
    };
    displayName: string;
  }) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

export const NominatimSearch: React.FC<NominatimSearchProps> = ({ 
  onSelect, 
  placeholder = "Search location (e.g. Model Town, Ludhiana)...",
  className = "w-full px-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 focus:ring-1 focus:ring-emerald-500",
  defaultValue = ""
}) => {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }

    const delayTimer = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchAddress(query + ", Punjab, India"); // Prioritize Punjab
      setResults(res);
      setIsSearching(false);
      setIsOpen(true);
    }, 600);

    return () => clearTimeout(delayTimer);
  }, [query]);

  const handleSelect = (r: GeocodeResult) => {
    setQuery(r.displayName);
    setIsOpen(false);
    
    const hierarchy = mapAddressToHierarchy(r.address);
    onSelect({
      lat: r.lat,
      lng: r.lon,
      hierarchy,
      displayName: r.displayName
    });
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value === '') setIsOpen(false);
          }}
          placeholder={placeholder}
          className={className}
        />
        {isSearching && (
          <div className="absolute right-3 top-3 h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="absolute z-[9999] w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <li 
              key={i} 
              className="px-4 py-3 hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-0 text-sm text-slate-300 transition-colors"
              onClick={() => handleSelect(r)}
            >
              {r.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
