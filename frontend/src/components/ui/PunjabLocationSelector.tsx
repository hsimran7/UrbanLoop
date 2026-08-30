import React, { useState, useEffect } from 'react';

export const PUNJAB_DISTRICTS = [
  'Amritsar',
  'Barnala',
  'Bathinda',
  'Faridkot',
  'Fatehgarh Sahib',
  'Fazilka',
  'Ferozepur',
  'Gurdaspur',
  'Hoshiarpur',
  'Jalandhar',
  'Kapurthala',
  'Ludhiana',
  'Malerkotla',
  'Mansa',
  'Moga',
  'Pathankot',
  'Patiala',
  'Rupnagar',
  'Sahibzada Ajit Singh Nagar (Mohali)',
  'Sangrur',
  'Shaheed Bhagat Singh Nagar (Nawanshahr)',
  'Sri Muktsar Sahib',
  'Tarn Taran',
];

// District to default major towns mapping for convenient dependent dropdowns
export const DISTRICT_TOWNS: Record<string, string[]> = {
  'Amritsar': ['Amritsar City', 'Ajnala', 'Baba Bakala', 'Majitha', 'Jandiala Guru'],
  'Barnala': ['Barnala Town', 'Tapa', 'Bhadaur', 'Dhanaula'],
  'Bathinda': ['Bathinda City', 'Rampur Phul', 'Talwandi Sabo', 'Mauri', 'Bhai Rupa'],
  'Faridkot': ['Faridkot Town', 'Kotkapura', 'Jaitu'],
  'Fatehgarh Sahib': ['Sirhind-Fategarh', 'Mandi Gobindgarh', 'Amloh', 'Khamanon'],
  'Fazilka': ['Fazilka Town', 'Abohar', 'Jalalabad'],
  'Ferozepur': ['Ferozepur City', 'Ferozepur Cantt', 'Zira', 'Guru Har Sahai'],
  'Gurdaspur': ['Gurdaspur Town', 'Batala', 'Dera Baba Nanak', 'Dhariwal', 'Dinangar'],
  'Hoshiarpur': ['Hoshiarpur City', 'Dasuya', 'Mukerian', 'Garhshankar', 'Tanda'],
  'Jalandhar': ['Jalandhar City', 'Phillaur', 'Nakodar', 'Shahkot', 'Adampur', 'Goraya'],
  'Kapurthala': ['Kapurthala Town', 'Phagwara', 'Sultanpur Lodhi', 'Bholath'],
  'Ludhiana': ['Ludhiana City', 'Khanna', 'Jagraon', 'Samrala', 'Payal', 'Raikot'],
  'Malerkotla': ['Malerkotla Town', 'Ahmedgarh', 'Amargarh'],
  'Mansa': ['Mansa Town', 'Budhlada', 'Sardulgarh'],
  'Moga': ['Moga City', 'Dharamkot', 'Nihal Singh Wala', 'Baghapurana'],
  'Pathankot': ['Pathankot City', 'Sujanpur', 'Dhar Kalan'],
  'Patiala': ['Patiala City', 'Nabaha', 'Rajpura', 'Samana', 'Patran'],
  'Rupnagar': ['Rupnagar (Ropar)', 'Anandpur Sahib', 'Nangal', 'Morinda'],
  'Sahibzada Ajit Singh Nagar (Mohali)': ['Mohali (SAS Nagar)', 'Kharar', 'Zirakpur', 'Derabassi', 'Kurali'],
  'Sangrur': ['Sangrur Town', 'Sunam', 'Dhuri', 'Lehra', 'Moonak'],
  'Shaheed Bhagat Singh Nagar (Nawanshahr)': ['Nawanshahr', 'Banga', 'Balachaur'],
  'Sri Muktsar Sahib': ['Sri Muktsar Sahib', 'Malout', 'Gidderbaha'],
  'Tarn Taran': ['Tarn Taran Sahib', 'Patti', 'Khadur Sahib', 'Bhikhiwind'],
};

export interface LocationData {
  state: string;
  district: string;
  city: string;
  area: string;
  address: string;
}

interface PunjabLocationSelectorProps {
  value?: Partial<LocationData>;
  onChange: (location: LocationData) => void;
  className?: string;
  disabled?: boolean;
}

export const PunjabLocationSelector: React.FC<PunjabLocationSelectorProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
}) => {
  const [state, setState] = useState(value?.state || 'Punjab');
  const [district, setDistrict] = useState(value?.district || '');
  const [city, setCity] = useState(value?.city || '');
  const [area, setArea] = useState(value?.area || '');
  const [address, setAddress] = useState(value?.address || '');

  // Preload initial values if provided
  useEffect(() => {
    if (value?.state) setState(value.state);
    if (value?.district) setDistrict(value.district);
    if (value?.city) setCity(value.city);
    if (value?.area) setArea(value.area);
    if (value?.address) setAddress(value.address);
  }, [value?.state, value?.district, value?.city, value?.area, value?.address]);

  // Handle State Change
  const handleStateChange = (newState: string) => {
    setState(newState);
    setDistrict('');
    setCity('');
    setArea('');
    notifyParent(newState, '', '', '', address);
  };

  // Handle District Change — Reset City & Area on District change
  const handleDistrictChange = (newDistrict: string) => {
    setDistrict(newDistrict);
    setCity('');
    setArea('');
    notifyParent(state, newDistrict, '', '', address);
  };

  // Handle City Change — Reset Area on City change
  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    setArea('');
    notifyParent(state, district, newCity, '', address);
  };

  // Handle Area Change
  const handleAreaChange = (newArea: string) => {
    setArea(newArea);
    notifyParent(state, district, city, newArea, address);
  };

  // Handle Address Change
  const handleAddressChange = (newAddress: string) => {
    setAddress(newAddress);
    notifyParent(state, district, city, area, newAddress);
  };

  const notifyParent = (st: string, dist: string, ct: string, ar: string, addr: string) => {
    onChange({
      state: st,
      district: dist,
      city: ct,
      area: ar,
      address: addr,
    });
  };

  const availableCities = district ? (DISTRICT_TOWNS[district] || [`${district} Main`]) : [];

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* STATE */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">State</label>
          <select
            value={state}
            onChange={(e) => handleStateChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition"
          >
            <option value="Punjab">Punjab</option>
          </select>
        </div>

        {/* DISTRICT */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">District</label>
          <select
            value={district}
            onChange={(e) => handleDistrictChange(e.target.value)}
            disabled={disabled || !state}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition"
          >
            <option value="">Select Punjab District</option>
            {PUNJAB_DISTRICTS.map((dist) => (
              <option key={dist} value={dist}>
                {dist}
              </option>
            ))}
          </select>
        </div>

        {/* CITY / TOWN */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">City / Town</label>
          <select
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            disabled={disabled || !district}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition"
          >
            <option value="">{district ? 'Select City / Town' : 'Select District First'}</option>
            {availableCities.map((ct) => (
              <option key={ct} value={ct}>
                {ct}
              </option>
            ))}
          </select>
        </div>

        {/* WARD / AREA */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Ward / Area</label>
          <input
            type="text"
            placeholder={city ? "e.g. Ward 12 / Sarabha Nagar" : "Select City First"}
            value={area}
            onChange={(e) => handleAreaChange(e.target.value)}
            disabled={disabled || !city}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* FULL ADDRESS */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Complete Address</label>
        <input
          type="text"
          placeholder="House/Plot No, Street, Landmark"
          value={address}
          onChange={(e) => handleAddressChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-emerald-500 transition placeholder:text-slate-600"
        />
      </div>
    </div>
  );
};
