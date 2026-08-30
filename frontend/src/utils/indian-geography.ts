export interface AreaSuggestion {
  state: string;
  city: string;
  wardNumber: number;
  wardName: string;
  area: string;
}

const STATES_CITIES = [
  // North India mandatory states
  { state: 'Punjab', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda'] },
  { state: 'Haryana', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Rohtak'] },
  { state: 'Himachal Pradesh', cities: ['Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Hamirpur'] },
  { state: 'Jammu & Kashmir', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Kathua'] },
  { state: 'Ladakh', cities: ['Leh', 'Kargil'] },
  { state: 'Delhi', cities: ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi'] },
  { state: 'Chandigarh', cities: ['Chandigarh'] },
  { state: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Agra', 'Varanasi', 'Prayagraj'] },
  { state: 'Uttarakhand', cities: ['Dehradun', 'Haridwar', 'Haldwani', 'Roorkee', 'Rishikesh'] },
  { state: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'] },
  
  // Other regions
  { state: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Thane', 'Nagpur', 'Nashik'] },
  { state: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi'] },
  { state: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai'] },
  { state: 'Telangana', cities: ['Hyderabad', 'Warangal'] },
  { state: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara'] },
  { state: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Darjeeling'] },
];

const CITY_LOCALITIES: Record<string, string[]> = {
  // Punjab
  'Ludhiana': ['Model Town', 'Civil Lines', 'Sarabha Nagar', 'BRS Nagar', 'Ferozepur Road', 'Gill Road', 'Tajpur Road', 'Moti Nagar'],
  'Amritsar': ['Ranjit Avenue', 'Lawrence Road', 'Golden Temple Area', 'Putlighar', 'Mall Road', 'Majitha Road', 'Albert Road'],
  'Jalandhar': ['Model Town', 'Urban Estate', 'Model House', 'Rama Mandi', 'Cantonment', 'GT Road', 'Guru Nanak Pura'],
  'Patiala': ['Baradari', 'Model Town', 'Urban Estate', 'Tripuri', 'SST Nagar', 'Leela Bhawan', 'Cantonment'],
  'Bathinda': ['Model Town', 'Civil Station', 'Thermal Colony', 'Goniana Road', 'Ajit Road', 'Guru Nanak Nagar'],

  // Haryana
  'Gurugram': ['DLF Phase 1', 'DLF Phase 3', 'DLF Phase 5', 'Sushant Lok 1', 'Sector 45', 'Sector 56', 'Sohna Road', 'Golf Course Road', 'Udyog Vihar', 'Palam Vihar'],
  'Faridabad': ['Sector 15', 'Sector 21', 'Sector 37', 'Greenfield Colony', 'Surajkund', 'Nit 5', 'Mathura Road'],
  'Panipat': ['Model Town', 'Sukhdev Nagar', 'Sector 11', 'Sector 25', 'Gohana Road', 'Sanjay Chowk'],
  'Ambala': ['Ambala Cantt', 'Model Town', 'Sector 9', 'Ambala City Central', 'Cloth Market', 'Prem Nagar'],
  'Rohtak': ['Model Town', 'Sector 1', 'Sector 3', 'D-Park', 'Civic Center', 'Delhi Road', 'Jhajjar Road'],

  // Himachal Pradesh
  'Shimla': ['Mall Road', 'Ridge', 'Chhota Shimla', 'Kasumpti', 'Sanjauli', 'Dhalli', 'New Shimla', 'Summer Hill'],
  'Dharamshala': ['McLeod Ganj', 'Kotwali Bazar', 'Sidhbari', 'Dharamkot', 'Bhagsunag', 'Forsyth Ganj', 'Civil Lines'],
  'Solan': ['Mall Road', 'Chambaghat', 'Deonghat', 'Kather', 'Saproon', 'Sector 2', 'Subathu Road'],
  'Mandi': ['Tarna Hills', 'Ramnagar', 'Sauli Khad', 'Purani Mandi', 'School Bazar', 'Khaliyar'],
  'Hamirpur': ['Main Bazar', 'New Colony', 'Dosarka', 'H हीरा नगर', 'Galore Road', 'Bhota Road'],

  // Jammu & Kashmir
  'Srinagar': ['Lal Chowk', 'Rajbagh', 'Karan Nagar', 'Hazratbal', 'Dal Lake Area', 'Sonwar', 'Nishat', 'Shalimar', 'Nowhatta'],
  'Jammu': ['Gandhi Nagar', 'Trikuta Nagar', 'Channi Himmat', 'Janipur', 'Bahu Plaza', 'Rehari Colony', 'Canal Road'],
  'Anantnag': ['KP Road', 'Khanabal', 'Lazibal', 'Ashajipora', 'Donipawa', 'Nai Basti'],
  'Baramulla': ['Main Bazar', 'Kanthbagh', 'Khawaja Bagh', 'Ushkara', 'Carapa Road', 'Sopore Road'],
  'Kathua': ['College Road', 'Industrial Area', 'Govindsar', 'Patel Nagar', 'Shastri Nagar', 'Canal View'],

  // Ladakh
  'Leh': ['Main Bazar', 'Chanspa', 'Changspa Road', 'Fort Road', 'Sankar', 'Skara', 'Tukcha'],
  'Kargil': ['Main Market', 'Baroo', 'Titichumik', 'Chanchik', 'Poyen', 'Bemathang'],

  // Delhi
  'New Delhi': ['Connaught Place', 'Chanakyapuri', 'Vasant Kunj', 'Saket', 'Lajpat Nagar', 'Greater Kailash', 'Hauz Khas', 'Green Park', 'Safdarjung', 'RK Puram', 'Dwarka', 'Rohini', 'Janakpuri', 'Rajouri Garden', 'Karol Bagh', 'Pahar Ganj', 'Chandni Chowk', 'Mayur Vihar', 'Preet Vihar', 'Laxmi Nagar'],
  'North Delhi': ['Alipur', 'Bawana', 'Narela', 'Saraswati Vihar', 'Model Town', 'Jahangirpuri', 'Pitampura', 'Shalimar Bagh', 'Ashok Vihar', 'Burari'],
  'South Delhi': ['Saket', 'Malviya Nagar', 'Hauz Khas', 'Mehrauli', 'Greater Kailash', 'Alaknanda', 'Kalkaji', 'Neb Sarai', 'Sangam Vihar', 'Chhatarpur'],
  'East Delhi': ['Mayur Vihar', 'Preet Vihar', 'Laxmi Nagar', 'Patparganj', 'Anand Vihar', 'Vasundhara Enclave', 'Shakarpur', 'Gandhi Nagar', 'Krishna Nagar', 'Geeta Colony'],
  'West Delhi': ['Janakpuri', 'Rajouri Garden', 'Punjabi Bagh', 'Vikaspuri', 'Paschim Vihar', 'Tilak Nagar', 'Uttam Nagar', 'Hari Nagar', 'Kirti Nagar', 'Dwarka Sector 1'],

  // Chandigarh
  'Chandigarh': ['Sector 17', 'Sector 35', 'Sector 8', 'Sector 22', 'Sector 9', 'Sector 15', 'Sector 43', 'Sukhna Lake Area', 'Elante Mall Road'],

  // Uttar Pradesh
  'Lucknow': ['Hazratganj', 'Gomti Nagar', 'Aliganj', 'Indira Nagar', 'Janki Puram', 'Charbagh', 'Aminabad', 'Aashiana', 'Chowk'],
  'Kanpur': ['Civil Lines', 'Swaroop Nagar', 'Kakadeo', 'Kalyanpur', 'Mall Road', 'Kidwai Nagar', 'Lajpat Nagar', 'Arya Nagar'],
  'Noida': ['Sector 18', 'Sector 62', 'Sector 15', 'Sector 50', 'Sector 93', 'Sector 137', 'Sector 76', 'Sector 128'],
  'Ghaziabad': ['Indirapuram', 'Vasundhara', 'Vaishali', 'Raj Nagar', 'Kavi Nagar', 'Sanjay Nagar', 'Sahibabad'],
  'Agra': ['Taj Ganj', 'Sanjay Place', 'Fatehabad Road', 'Kamla Nagar', 'Dayal Bagh', 'Raja Ki Mandi', 'Sikandra'],
  'Varanasi': ['Lanka', 'Sigra', 'Godowlia', 'Cantt', 'Assi Ghat Area', 'Sarnath', 'Bhelupur', 'Mahmoorganj'],
  'Prayagraj': ['Civil Lines', 'Georgetown', 'Tagore Town', 'Katra', 'Allahapur', 'Naini', 'Jhusi'],

  // Uttarakhand
  'Dehradun': ['Rajpur Road', 'Dalanwala', 'Vasant Vihar', 'Clement Town', 'Sahastradhara Road', 'Patel Nagar', 'Jakhan'],
  'Haridwar': ['Har Ki Pauri Area', 'Ranipur', 'Shivalik Nagar', 'Kankhal', 'Jwalapur', 'Motichur'],
  'Haldwani': ['Mukherjee Nagar', 'Dahariya', 'Kathgodam', 'Kaladhungi Road', 'Bareilly Road', 'Cusumkhera'],
  'Roorkee': ['Civil Lines', 'IIT Campus Area', 'Ramnagar', 'Solanipuram', 'Ganga Nagar', 'Roorkee Cantt'],
  'Rishikesh': ['Triveni Ghat Area', 'Tapovan', 'Laxman Jhula Area', 'Muni Ki Reti', 'Rishihar', 'Dhalwala'],

  // Rajasthan
  'Jaipur': ['C-Scheme', 'Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'Raja Park', 'Tonk Road', 'Johri Bazar', 'Bani Park'],
  'Jodhpur': ['Sardarpura', 'Shastri Nagar', 'Ratanda', 'Paota', 'Chopasni Road', 'Air Force Area'],
  'Udaipur': ['Panchwati', 'Hiran Magri', 'Fatehsagar Lake Area', 'Old City', 'Shobhagpura', 'Madhuban'],
  'Kota': ['Talwandi', 'Vigyan Nagar', 'Kunhari', 'Dadabari', 'Gumanpura', 'Nayapura', 'Rajeev Gandhi Nagar'],
  'Ajmer': ['Vaishali Nagar', 'Ana Sagar Road', 'Civil Lines', 'Clock Tower Area', 'Adarsh Nagar', 'Ramganj'],
  'Bikaner': ['Sadul Ganj', 'Vyash Colony', 'Gangashahr', 'Rani Bazar', 'Civil Lines', 'Kote Gate Area'],

  // Mumbai
  'Mumbai': ['Colaba Central', 'Colaba Causeway', 'Cuffe Parade', 'Nariman Point', 'Marine Lines', 'Churchgate', 'Kalbadevi', 'Girgaon', 'Byculla', 'Mazagaon', 'Dadar West', 'Dadar East', 'Prabhadevi', 'Lower Parel', 'Bandra West', 'Bandra East', 'Khar', 'Santacruz', 'Andheri West', 'Lokhandwala', 'Versova', 'Andheri East', 'Marol', 'Saki Naka', 'Juhu', 'Vile Parle', 'Ghatkopar', 'Kurla', 'Chembur', 'Mulund', 'Borivali'],
  // Pune
  'Pune': ['Kothrud', 'Baner', 'Aundh', 'Viman Nagar', 'Kalyani Nagar', 'Hinjawadi', 'Wakad', 'Hadapsar', 'Kondhwa', 'Camp', 'Shivajinagar', 'Pimple Saudagar', 'Swargate', 'Katraj', 'Deccan', 'Sinhagad Road', 'Kharadi', 'Wanowrie', 'Bavdhan', 'Yerwada'],
  // Thane
  'Thane': ['Ghodbunder Road', 'Naupada', 'Vartak Nagar', 'Kopri', 'Wagle Estate', 'Hiranandani Estate', 'Kalyan', 'Dombivli', 'Ambernath', 'Badlapur'],
  // Nagpur
  'Nagpur': ['Dharampeth', 'Sardar', 'Manish Nagar', 'Wardha Road', 'Sitabuldi', 'Sadashiv Nagar', 'Nandanvan', 'Ramdaspeth', 'Pratap Nagar', 'Civil Lines'],
  // Nashik
  'Nashik': ['Indira Nagar', 'Panchavati', 'Satpur', 'Ambad', 'Nashik Road', 'Gangapur Road', 'Cidco', 'Deolali', 'Pathardi Phata', 'Mahatma Nagar'],

  // Bengaluru
  'Bengaluru': ['Indiranagar', 'Jayanagar', 'Koramangala', 'Whitefield', 'HSR Layout', 'Malleshwaram', 'Hebbal', 'Rajajinagar', 'Banashankari', 'Electronic City', 'Marathahalli', 'Bellandur', 'BTM Layout', 'Yelahanka', 'Yeshwanthpur', 'Basavanagudi', 'Sadashivnagar', 'Kalyan Nagar', 'RT Nagar', 'Domlur'],
  // Mysuru
  'Mysuru': ['Gokulam', 'Vidyaranyapuram', 'Jayalakshmipuram', 'Hebbal', 'Vijayanagar', 'Saraswathipuram', 'Kuvempunagar', 'J P Nagar', 'Devaraja Mohalla', 'Chamarajapuram'],
  // Hubballi
  'Hubballi': ['Keshwapur', 'Vidyanagar', 'Gokul Road', 'Deshpande Nagar', 'Shirur Park', 'Adarsh Nagar', 'Navanagar', 'Rajatagiri', 'Manjunath Nagar', 'Rayapur'],
  // Mangaluru
  'Mangaluru': ['Kadri', 'Bejai', 'Lalbagh', 'Urwa', 'Pandeshwar', 'Attavar', 'Kulshekar', 'Derebail', 'Car Street', 'Mannagudda'],
  // Belagavi
  'Belagavi': ['Tilakwadi', 'Shahapur', 'Hindwadi', 'Sadashiv Nagar', 'Angol', 'Ramteerth Nagar', 'Cantonment', 'Jawahar Nagar', 'Rani Chennamma Nagar', 'Chidambar Nagar'],

  // Chennai
  'Chennai': ['Adyar', 'T-Nagar', 'Mylapore', 'Velachery', 'Nungambakkam', 'Anna Nagar', 'Guindy', 'Tambaram', 'Royapettah', 'Chromepet', 'Thiruvanmiyur', 'Besant Nagar', 'Egmore', 'Alwarpet', 'Kotturpuram', 'Saidapet', 'West Mambalam', 'Kodambakkam', 'Vadapalani', 'Triplicane'],
  // Coimbatore
  'Coimbatore': ['R S Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony', 'Ramanathapuram', 'Saravanampatti', 'Singanallur', 'Kovaipudur', 'Town Hall', 'Race Course'],
  // Madurai
  'Madurai': ['K K Nagar', 'Anna Nagar', 'Tallakulam', 'Simmakkal', 'Sellur', 'Goripalayam', 'Koodal Nagar', 'Pudur', 'TVS Nagar', 'Madurai Central'],

  // Hyderabad
  'Hyderabad': ['Gachibowli', 'Madhapur', 'Jubilee Hills', 'Banjara Hills', 'Ameerpet', 'Secunderabad', 'Kukatpally', 'Begumpet', 'Charminar', 'Hitech City', 'Kondapur', 'Miyapur', 'Nanakramguda', 'Manikonda', 'Kothapet', 'Dilsukhnagar', 'LB Nagar', 'Himayatnagar', 'Abids', 'Somajiguda'],
  // Warangal
  'Warangal': ['Hanamkonda', 'Kazipet', 'Subedari', 'Naimnagar', 'Nakkalagutta', 'Waddepally', 'Hunter Road', 'Girish Nagar', 'Kishanpura', 'Shanti Nagar'],

  // Ahmedabad
  'Ahmedabad': ['Maninagar', 'Satellite', 'Navrangpura', 'Vastrapur', 'C G Road', 'Bapu Nagar', 'Sabarmati', 'Ghatlodia', 'Naranpura', 'Paldi'],
  // Surat
  'Surat': ['Adajan', 'Athwa Lines', 'Varachha', 'Vesu', 'Dindoli', 'Piplod', 'Katargam', 'Rander', 'Udhna', 'Bhatar'],
  // Vadodara
  'Vadodara': ['Alkapuri', 'Gotri', 'Fatehgunj', 'Manjalpur', 'Akota', 'Sayajigunj', 'Karelibaug', 'Subhanpura', 'Waghodia Road', 'Gorwa'],

  // Kolkata
  'Kolkata': ['Salt Lake', 'Rajarhat', 'New Town', 'Garia', 'Jadavpur', 'Tollygunge', 'Behala', 'Alipore', 'Park Street', 'Shambazar', 'Howrah Central', 'Shalimar', 'Liluah', 'Bally', 'Salkia', 'Ramrajatala', 'Durgapur', 'Asansol', 'Darjeeling Town', 'Siliguri']
};

export function generateIndianGeography(): AreaSuggestion[] {
  const suggestions: AreaSuggestion[] = [];
  
  STATES_CITIES.forEach(({ state, cities }) => {
    cities.forEach(city => {
      const localities = CITY_LOCALITIES[city] || ['Central Area', 'Main Market', 'Station Road', 'Extension Area', 'Local Ward Area'];
      localities.forEach((locality, idx) => {
        const wardNum = (idx % 10) + 1;
        suggestions.push({
          state,
          city,
          wardNumber: wardNum,
          wardName: `Ward ${wardNum} - ${city} ${locality.split(' ')[0]}`,
          area: locality,
        });
      });
    });
  });
  
  return suggestions;
}
