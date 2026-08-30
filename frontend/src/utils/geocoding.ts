export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  address: {
    state?: string;
    state_district?: string;
    county?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    postcode?: string;
  };
}

export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&countrycodes=in&limit=5`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name,
      address: item.address || {}
    }));
  } catch (err) {
    console.error('Geocoding error:', err);
    return [];
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
    if (!res.ok) return null;
    const item = await res.json();
    if (item.error) return null;
    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name,
      address: item.address || {}
    };
  } catch (err) {
    console.error('Reverse geocoding error:', err);
    return null;
  }
}

// Maps Nominatim address structure to our schema hierarchy
export function mapAddressToHierarchy(address: GeocodeResult['address']) {
  return {
    state: address.state || '',
    district: address.state_district || address.county || '',
    city: address.city || address.town || address.village || '',
    ward: address.suburb || '',
    area: address.neighbourhood || address.suburb || '',
    zone: address.road || '', // Fallback, zones are hard to map directly
    postcode: address.postcode || ''
  };
}
