#!/usr/bin/env node
/**
 * generate-sample-listings.js
 * Generates sample listings for new regions and appends them to data/listings.json
 */

const fs = require('fs');
const path = require('path');

const LISTINGS_PATH = path.join(__dirname, '..', 'data', 'listings.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 4) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

function roundPrice(p) {
  if (p >= 1000000) return Math.round(p / 10000) * 10000;
  if (p >= 100000) return Math.round(p / 5000) * 5000;
  return Math.round(p / 1000) * 1000;
}

// ── Street name pools ────────────────────────────────────────────────────────

const BC_STREETS = [
  'Main St', 'Broadway', 'Granville St', 'Hastings St', 'Kingsway',
  'Cambie St', 'Fraser St', 'Victoria Dr', 'Commercial Dr', 'Oak St',
  'Alma St', 'Arbutus St', 'Burrard St', 'Denman St', 'Davie St',
  'Robson St', 'Pacific Blvd', 'Beach Ave', 'Cornwall Ave', 'Cedar St',
  'Vine St', 'Yew St', 'Trafalgar St', 'Balsam St', 'Larch St',
  'Dunbar St', 'Macdonald St', 'Blenheim St', 'Collingwood St',
  'Marine Dr', 'King Edward Ave', 'Knight St', 'Nanaimo St',
  'Renfrew St', 'Rupert St', 'Boundary Rd', 'Slocan St', 'Templeton Dr',
  'Pandora St', 'Venables St', 'Clark Dr', 'Glen Dr', 'Scotia St',
  'Willow St', 'Heather St', 'Ash St', 'Spruce St', 'Alder St',
  'Birch St', 'Pine St', 'Fir St', 'Hemlock St', 'Cypress St',
  'Chestnut St', 'Maple St', 'Laurel St', '4th Ave', '8th Ave',
  '10th Ave', '12th Ave', '16th Ave', '25th Ave', '33rd Ave',
  '41st Ave', '49th Ave', '57th Ave', 'Kingsway', 'Imperial St',
  'Nelson Ave', 'Gilmore Ave', 'Willingdon Ave', 'Rosser Ave',
  'Hazel St', 'Beresford St', 'Sussex Ave', 'Walker Ave',
  'Government Rd', 'Lougheed Hwy', 'Shaughnessy St', 'Pipeline Rd',
  'Como Lake Ave', 'Austin Ave', 'Rochester Ave', 'Mariner Way',
  'David Ave', 'Guildford Dr', 'Coast Meridian Rd', 'Westwood St',
  'Plateau Blvd', 'Burke Mountain St', 'Panorama Dr', 'Highland Dr',
];

const AB_STREETS = [
  'Jasper Ave', 'Whyte Ave', '104th St', '109th St', 'Stony Plain Rd',
  'Gateway Blvd', 'Calgary Trail', 'Ellerslie Rd', '170th St',
  'Terwillegar Dr', 'Windermere Blvd', 'Rabbit Hill Rd',
  'Riverbend Rd', 'Rhatigan Rd', '34th Ave', '23rd Ave', 'Mill Woods Rd',
  'Lakewood Rd', '50th St', '66th St', '91st St', '97th St',
  'Grandin Rd', 'St. Albert Trail', 'Bellerose Dr', 'Erin Ridge Dr',
  'Sherwood Dr', 'Baseline Rd', 'Clover Bar Rd', 'Brentwood Blvd',
  'Switzer Dr', 'Mountain St', 'Athabasca Ave', 'Hardisty Ave',
  'Pembina Ave', 'Drinnan Way', 'Boudreau Rd', 'Rundle Dr',
];

const ON_STREETS = [
  'Bay St', 'King St', 'Queen St', 'Yonge St', 'Bloor St',
  'Dundas St', 'College St', 'Spadina Ave', 'University Ave',
  'Front St', 'Adelaide St', 'Richmond St', 'Wellington St',
  'Bathurst St', 'Ossington Ave', 'Dufferin St', 'Lansdowne Ave',
  'Dovercourt Rd', 'Shaw St', 'Crawford St', 'Manning Ave',
  'Euclid Ave', 'Palmerston Blvd', 'Markham St', 'Clinton St',
  'Grace St', 'Montrose Ave', 'Beatrice St', 'Harbord St',
  'Dupont St', 'Davenport Rd', 'St. Clair Ave', 'Eglinton Ave',
  'Lawrence Ave', 'Sheppard Ave', 'Finch Ave', 'Steeles Ave',
  'Don Mills Rd', 'Bayview Ave', 'Leslie St', 'Woodbine Ave',
  'Victoria Park Ave', 'Warden Ave', 'Kennedy Rd', 'Brimley Rd',
  'McCowan Rd', 'Markham Rd', 'Meadowvale Blvd', 'Hurontario St',
  'Mississauga Rd', 'Erin Mills Pkwy', 'Burnhamthorpe Rd',
  'Confederation Pkwy', 'Dundas St', 'Highway 7', 'Warden Ave',
  'Main St Markham', 'Bur Oak Ave', 'John St', 'Strachan Ave',
  'Liberty St', 'Mowat Ave', 'East Liberty St', 'Hanna Ave',
  'Atlantic Ave', 'Jefferson Ave', 'Sudbury St', 'Lisgar St',
];

const CA_STREETS = [
  'Pacific Coast Hwy', 'Laguna Canyon Rd', 'Coast Hwy',
  'Forest Ave', 'Cliff Dr', 'Ocean Ave', 'Catalina St',
  'Diamond St', 'Pearl St', 'Emerald Bay Rd', 'Bluebird Canyon Dr',
  'Alta Laguna Blvd', 'Temple Hills Dr', 'Sunset Terrace',
  'Del Mar Ave', 'Cress St', 'Myrtle St', 'Glenneyre St',
  'Brooks St', 'Thalia St', 'Calliope St', 'Cleo St',
  'Doheny Park Rd', 'Dana Point Harbor Dr', 'Selva Rd',
  'Golden Lantern St', 'Pacific Island Dr', 'Blue Lantern St',
  'Avenida Del Mar', 'El Camino Real', 'Camino Capistrano',
  'Ortega Hwy', 'Camino De Los Mares', 'Crown Valley Pkwy',
  'Alicia Pkwy', 'La Paz Rd', 'Niguel Rd', 'Pacific Park Dr',
  'Newport Coast Dr', 'Balboa Blvd', 'Superior Ave', 'Dover Dr',
  'Irvine Ave', 'Jamboree Rd', 'MacArthur Blvd',
];

const OKANAGAN_STREETS = [
  'Lakeshore Rd', 'Pandosy St', 'Harvey Ave', 'Bernard Ave',
  'Ellis St', 'Water St', 'Abbott St', 'Richter St',
  'Ethel St', 'Burtch Rd', 'Gordon Dr', 'KLO Rd',
  'Glenmore Dr', 'Dilworth Dr', 'Spall Rd', 'Enterprise Way',
  'Springfield Rd', 'Rutland Rd', 'Hollywood Rd', 'McCurdy Rd',
  'Westbank Dr', 'Gellatly Rd', 'Boucherie Rd', 'Shannon Lake Rd',
  'Main St', 'Westminster Ave', 'Skaha Lake Rd', 'Channel Pkwy',
  'Nanaimo Ave', 'Eckhardt Ave', 'Fairview Rd', 'Green Ave',
  'Okanagan Ave', 'Kalamalka Rd', '25th Ave', '32nd St',
  'Highway 97', 'Pleasant Valley Rd', 'Silver Star Rd',
  'Berry Rd', 'Oceola Rd', 'Bottom Wood Lake Rd',
  'Prairie Valley Rd', 'Victoria Rd', 'Rosedale Ave',
  'Beach Ave', 'Princeton Ave', 'Lakeshore Dr',
  'Haynes Point Rd', '89th St', '62nd Ave',
];

const SEA_TO_SKY_STREETS = [
  'Village Gate Blvd', 'Lorimer Rd', 'Blackcomb Way', 'Whistler Way',
  'Alta Lake Rd', 'Rainbow Dr', 'Nordic Dr', 'Balsam Way',
  'Spruce Grove Way', 'Nesters Rd', 'Portage Rd', 'Pemberton Farm Rd',
  'Venture Pl', 'Industrial Way', 'Frontier St', 'Birch Rd',
  'Cottonwood Rd', 'Pemberton Meadows Rd', 'Sea to Sky Hwy',
  'Cleveland Ave', 'Victoria St', 'Buckley Ave', 'Third Ave',
  'Loggers Lane', 'Discovery Way', 'Tantalus Rd', 'Garibaldi Way',
  'University Blvd', 'Crumpit Woods Dr', 'Thunderbird Ridge',
];

const GULF_ISLANDS_STREETS = [
  'Fulford-Ganges Rd', 'North End Rd', 'Vesuvius Bay Rd',
  'Long Harbour Rd', 'Cusheon Lake Rd', 'Beddis Rd', 'Stewart Rd',
  'Rainbow Rd', 'Ganges Rd', 'Upper Ganges Rd',
  'Sturdies Bay Rd', 'Porlier Pass Rd', 'Georgeson Bay Rd',
  'Bluff Rd', 'Montague Rd',
  'Fernhill Rd', 'Village Bay Rd', 'Miners Bay Rd',
  'Horton Bay Rd', 'Campbell Bay Rd',
  'Otter Bay Rd', 'Port Washington Rd', 'Bedwell Harbour Rd',
  'Spalding Rd', 'Canal Rd', 'Hooson Rd', 'Cliffside Rd',
  'East Point Rd', 'Narvaez Bay Rd', 'Tumbo Channel Rd',
  'Berry Point Rd', 'South Rd', 'North Rd', 'Stalker Rd',
  'Lochinvar Lane', 'Tin Can Alley',
];

const SUNSHINE_COAST_STREETS = [
  'Gibsons Way', 'Marine Dr', 'Gower Point Rd', 'School Rd',
  'Reed Rd', 'Pratt Rd', 'Payne Rd', 'Shaw Rd',
  'Wharf Ave', 'Dolphin St', 'Cowrie St', 'Inlet Ave',
  'Trail Ave', 'Norwest Bay Rd', 'Redrooffs Rd', 'Sunshine Coast Hwy',
  'Roberts Creek Rd', 'Joe Rd', 'Hall Rd', 'Lockyer Rd',
  'Halfmoon Bay Rd', 'Truman Rd', 'Southwood Rd', 'Cove Rd',
  'Garden Bay Rd', 'Irvines Landing Rd', 'Lee Rd', 'Lagoon Rd',
  'Madeira Park Rd', 'Francis Peninsula Rd', 'Warnock Rd', 'Hotel Lake Rd',
];

const RICHMOND_STREETS = [
  'No. 3 Rd', 'Westminster Hwy', 'Garden City Rd', 'Granville Ave',
  'Blundell Rd', 'Francis Rd', 'Steveston Hwy', 'Gilbert Rd',
  'Railway Ave', 'Chatham St', 'Moncton St', 'Bayview St',
  'Cooney Rd', 'Ackroyd Rd', 'Cook Rd', 'Saba Rd', 'Lansdowne Rd',
  'Alderbridge Way', 'Cambie Rd', 'Sea Island Way', 'River Rd',
  'Dyke Rd', 'No. 1 Rd', 'No. 2 Rd', 'No. 4 Rd', 'No. 5 Rd',
  'Williams Rd', 'Bridgeport Rd', 'Capstan Way', 'Oval Way',
];

const SURREY_STREETS = [
  '152nd St', '160th St', '168th St', 'Fraser Hwy', '64th Ave',
  '72nd Ave', '80th Ave', '88th Ave', '96th Ave', '104th Ave',
  'Fleetwood Way', 'Guildford Dr', '100th Ave', 'King George Blvd',
  'Scott Rd', '120th St', '128th St', '140th St', '144th St',
  '148th St', '156th St', '164th St', '176th St', 'Cloverdale Ave',
  'Highway 10', '56th Ave', '58th Ave', '60th Ave',
  'Panorama Dr', 'Sullivan Heights', 'Fraser Heights Dr',
  '108th Ave', '110th Ave', '112th Ave',
];

const LANGLEY_DELTA_STREETS = [
  'Fraser Hwy', '200th St', '208th St', '216th St', 'Willoughby Town Centre Dr',
  '64th Ave', '72nd Ave', '80th Ave', '88th Ave', '96th Ave',
  'Walnut Grove Dr', 'Glover Rd', 'Mavis Ave', 'Fort Langley Rd',
  '56th Ave', '48th Ave', 'English Bluff Rd', 'Tsawwassen Dr',
  '12th Ave', 'Point Roberts Rd', 'Ladner Trunk Rd', 'Elliott St',
  'Delta St', 'Arthur Dr', 'Harvest Dr', 'River Rd',
  'Nordel Way', '84th Ave', '112th St', '116th St',
  'Scott Rd', 'Kennedy Rd',
];

const RIDGE_MEADOWS_STREETS = [
  'Lougheed Hwy', 'Dewdney Trunk Rd', '224th St', '232nd St',
  'Maple Crescent', 'Brown Ave', 'Edge St', 'River Rd',
  'Silver Valley Rd', 'Blaney Dr', 'Albion Rd', 'Thompson Ave',
  'Kanaka Way', 'Fern Crescent', 'Meadow Ave', 'Harris Rd',
  'Ford Rd', 'Airport Way', 'Baynes Rd', 'Bonson Rd',
];

// ── Agent pools ──────────────────────────────────────────────────────────────

const BC_AGENTS = [
  'Sarah Chen, RE/MAX Crest', 'David Park, Sutton West Coast',
  'Mike Thompson, Royal LePage', 'Jennifer Wu, Macdonald Realty',
  'Kevin Lee, Oakwyn Realty', 'Amanda Singh, Engel & Volkers',
  'Jason Ko, Coldwell Banker', 'Lisa Wang, Century 21',
  'Ryan Gill, Keller Williams', 'Emily Zhang, eXp Realty',
  'Andrew Morrison, Dexter Realty', 'Priya Sharma, Regent Park Realty',
  'Chris Evans, HomeLife Realty', 'Tony Huang, Royal Pacific',
  'Rachel Kim, Sutton Group', 'Derek Chan, Faith Realty',
  'Melissa Liu, Angell/Hasman', 'Brian O\'Brien, RE/MAX Select',
  'Natasha Petrov, Stilhavn Real Estate', 'Marcus Johnson, Oakwyn Realty',
];

const AB_AGENTS = [
  'Mark Robertson, RE/MAX Elite', 'Sandra Olson, Royal LePage Noralta',
  'Tyler Brandt, Century 21 Leading', 'Jasmine Kaur, Realty Executives',
  'Greg Fenton, CIR Realty', 'Angela Hoffman, MaxWell Realty',
  'Daniel Fung, RE/MAX River City', 'Karen White, Coldwell Banker Mountain',
  'Steve Mueller, Royal LePage Foothills', 'Laura Chen, eXp Realty Alberta',
  'Chris Anderson, Realty Executives Apex', 'Michelle Becker, Keller Williams',
];

const ON_AGENTS = [
  'Michael Torres, Royal LePage Signature', 'Jessica Lam, Bosley Real Estate',
  'Andrew Mitchell, Sotheby\'s International', 'Sophia Ramos, Harvey Kalles',
  'David Kim, Keller Williams Referred', 'Christina Nguyen, RE/MAX Hallmark',
  'Robert Grant, Chestnut Park Real Estate', 'Laura Singh, Century 21 Atria',
  'Steven Cho, iPro Realty', 'Amanda Fox, Right at Home Realty',
  'Patrick O\'Connor, Sutton Group', 'Helen Wu, HomeLife New World',
  'James MacDonald, Coldwell Banker', 'Nicole Bianchi, Royal LePage Connect',
];

const US_AGENTS = [
  'Jennifer Sterling, Compass', 'Michael Rivera, Sotheby\'s International',
  'Robert Hayes, Coldwell Banker Global Luxury', 'Amanda Chen, Douglas Elliman',
  'Christopher Wells, Villa Real Estate', 'Elizabeth Grant, Berkshire Hathaway',
  'David Morrison, First Team Real Estate', 'Sarah Patterson, The Agency',
  'Thomas Keller, HOM Sotheby\'s', 'Rachel Brooks, Compass Laguna Beach',
  'Kevin O\'Brien, Engel & Volkers', 'Lauren Mitchell, Pacific Sotheby\'s',
];

const OKANAGAN_AGENTS = [
  'Trevor Black, RE/MAX Kelowna', 'Sandra Lane, Royal LePage Kelowna',
  'Mike Rivers, Century 21 Assurance', 'Jennifer Foster, Coldwell Banker Horizon',
  'Chris Graham, Engel & Volkers Okanagan', 'Heather Stone, eXp Realty Kelowna',
  'Kyle Armstrong, RE/MAX Penticton', 'Amanda Shore, Royal LePage Locations West',
  'Derek Woods, Sotheby\'s Okanagan', 'Lisa Vineyard, Macdonald Realty Okanagan',
];

const SEA_TO_SKY_AGENTS = [
  'Jeff Alpine, RE/MAX Sea to Sky', 'Kendra Peak, Engel & Volkers Whistler',
  'Tom Summit, Royal LePage Sussex', 'Rachel Snow, Whistler Real Estate',
  'Chris Ridge, Coldwell Banker Sea to Sky', 'Amy Forest, Macdonald Realty Squamish',
  'Mike Glacier, RE/MAX Squamish', 'Laura Trail, Century 21 Pemberton',
];

const GULF_ISLANDS_AGENTS = [
  'Peter Shore, Pemberton Holmes Gulf Islands', 'Mary Harbour, RE/MAX Salt Spring',
  'Robert Cove, Royal LePage Salt Spring', 'Janet Bay, Salt Spring Realty',
  'David Island, Gulf Islands Realty', 'Carol Bluff, Macdonald Realty Gulf Islands',
  'Sam Waters, Century 21 Islands', 'Grace Point, eXp Realty Gulf Islands',
];

const SUNSHINE_COAST_AGENTS = [
  'Karen Harbour, RE/MAX City Realty Gibsons', 'Tim Shore, Royal LePage Sussex Coast',
  'Linda Creek, Sunshine Coast Realty', 'Mark Bay, Century 21 Sunshine Coast',
  'Sharon Cove, Sotheby\'s Sunshine Coast', 'Ian Point, Coldwell Banker Sunshine Coast',
  'Wendy Trail, RE/MAX Coast Living', 'Paul Inlet, Sutton Sunshine Coast',
];

// ── Property types ───────────────────────────────────────────────────────────

const TYPES = ['House', 'Apt/Condo', 'Townhouse', 'Land/Lot', 'Duplex', 'Mfd Home'];

function weightedType(weights) {
  const r = Math.random();
  let cumulative = 0;
  for (const [type, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (r <= cumulative) return type;
  }
  return 'House';
}

// ── Lot size generation ──────────────────────────────────────────────────────

function genLot(type) {
  if (type === 'Apt/Condo') return null;
  if (type === 'Townhouse') return null;
  if (Math.random() < 0.3) return null;
  const w = pick([33, 40, 45, 50, 55, 60, 66, 75, 80, 100, 120, 150]);
  const d = pick([100, 110, 120, 122, 125, 130, 132, 140, 150, 170, 200, 250]);
  return `${w}x${d}`;
}

// ── Region definitions ───────────────────────────────────────────────────────

const REGIONS = [
  // ── BC REGIONS ──
  {
    region: 'Vancouver',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Downtown', 'West End', 'Kitsilano', 'Mount Pleasant', 'Commercial Drive', 'Kerrisdale', 'Dunbar', 'Point Grey', 'Marpole', 'Hastings-Sunrise', 'Renfrew-Collingwood'],
    streets: BC_STREETS, agents: BC_AGENTS,
    latRange: [49.2000, 49.3100], lngRange: [-123.2300, -123.0200],
    priceRange: { House: [1200000, 4500000], 'Apt/Condo': [450000, 1800000], Townhouse: [850000, 2200000], 'Land/Lot': [1500000, 6000000], Duplex: [1100000, 2500000], 'Mfd Home': [300000, 700000] },
    typeWeights: { House: 0.30, 'Apt/Condo': 0.35, Townhouse: 0.20, Duplex: 0.08, 'Land/Lot': 0.04, 'Mfd Home': 0.03 },
    listingsCount: 15,
  },
  {
    region: 'Burnaby / New Westminster',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Metrotown', 'Brentwood', 'Edmonds', 'Lougheed', 'Downtown NW', 'Sapperton', 'Queensborough'],
    streets: BC_STREETS, agents: BC_AGENTS,
    latRange: [49.1900, 49.2700], lngRange: [-123.0300, -122.8800],
    priceRange: { House: [1100000, 2800000], 'Apt/Condo': [380000, 1200000], Townhouse: [700000, 1500000], 'Land/Lot': [1000000, 3000000], Duplex: [900000, 1800000], 'Mfd Home': [250000, 550000] },
    typeWeights: { House: 0.25, 'Apt/Condo': 0.40, Townhouse: 0.20, Duplex: 0.08, 'Land/Lot': 0.04, 'Mfd Home': 0.03 },
    listingsCount: 12,
  },
  {
    region: 'North Shore',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Lower Lonsdale', 'Lynn Valley', 'Deep Cove', 'Ambleside', 'Dundarave', 'British Properties'],
    streets: BC_STREETS, agents: BC_AGENTS,
    latRange: [49.3100, 49.3700], lngRange: [-123.2200, -122.9300],
    priceRange: { House: [1400000, 5500000], 'Apt/Condo': [500000, 1500000], Townhouse: [900000, 2000000], 'Land/Lot': [1200000, 4000000], Duplex: [1000000, 2200000], 'Mfd Home': [350000, 700000] },
    typeWeights: { House: 0.40, 'Apt/Condo': 0.25, Townhouse: 0.20, Duplex: 0.05, 'Land/Lot': 0.07, 'Mfd Home': 0.03 },
    listingsCount: 11,
  },
  {
    region: 'Tri-Cities',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Town Centre', 'Burke Mountain', 'Westwood Plateau', 'Port Coquitlam', 'Inlet Centre', 'Heritage Mountain'],
    streets: BC_STREETS, agents: BC_AGENTS,
    latRange: [49.2400, 49.3200], lngRange: [-122.8600, -122.7200],
    priceRange: { House: [900000, 2200000], 'Apt/Condo': [350000, 900000], Townhouse: [650000, 1300000], 'Land/Lot': [800000, 2000000], Duplex: [800000, 1500000], 'Mfd Home': [250000, 500000] },
    typeWeights: { House: 0.35, 'Apt/Condo': 0.25, Townhouse: 0.25, Duplex: 0.07, 'Land/Lot': 0.05, 'Mfd Home': 0.03 },
    listingsCount: 11,
  },
  {
    region: 'Ridge Meadows',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Maple Ridge Town Centre', 'Silver Valley', 'Albion', 'Pitt Meadows'],
    streets: RIDGE_MEADOWS_STREETS, agents: BC_AGENTS,
    latRange: [49.2000, 49.2700], lngRange: [-122.6200, -122.5200],
    priceRange: { House: [700000, 1600000], 'Apt/Condo': [300000, 650000], Townhouse: [500000, 950000], 'Land/Lot': [500000, 1500000], Duplex: [600000, 1100000], 'Mfd Home': [200000, 450000] },
    typeWeights: { House: 0.45, 'Apt/Condo': 0.15, Townhouse: 0.25, Duplex: 0.05, 'Land/Lot': 0.05, 'Mfd Home': 0.05 },
    listingsCount: 10,
  },
  {
    region: 'Langley / Delta',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Langley City', 'Willoughby', 'Walnut Grove', 'Fort Langley', 'Tsawwassen', 'Ladner', 'North Delta'],
    streets: LANGLEY_DELTA_STREETS, agents: BC_AGENTS,
    latRange: [49.0200, 49.1300], lngRange: [-123.0800, -122.5500],
    priceRange: { House: [800000, 2000000], 'Apt/Condo': [350000, 750000], Townhouse: [550000, 1100000], 'Land/Lot': [600000, 2000000], Duplex: [700000, 1300000], 'Mfd Home': [220000, 500000] },
    typeWeights: { House: 0.40, 'Apt/Condo': 0.15, Townhouse: 0.25, Duplex: 0.08, 'Land/Lot': 0.07, 'Mfd Home': 0.05 },
    listingsCount: 12,
  },
  {
    region: 'Richmond',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Richmond Centre', 'Steveston', 'Brighouse', 'Ironwood', 'Terra Nova'],
    streets: RICHMOND_STREETS, agents: BC_AGENTS,
    latRange: [49.1400, 49.1900], lngRange: [-123.1900, -123.0800],
    priceRange: { House: [1200000, 3500000], 'Apt/Condo': [400000, 1100000], Townhouse: [700000, 1500000], 'Land/Lot': [1000000, 3500000], Duplex: [900000, 1800000], 'Mfd Home': [280000, 550000] },
    typeWeights: { House: 0.30, 'Apt/Condo': 0.35, Townhouse: 0.20, Duplex: 0.08, 'Land/Lot': 0.04, 'Mfd Home': 0.03 },
    listingsCount: 11,
  },
  {
    region: 'Surrey (Expanded)',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Fleetwood', 'Guildford', 'Cloverdale', 'Newton', 'Panorama Ridge', 'Fraser Heights'],
    streets: SURREY_STREETS, agents: BC_AGENTS,
    latRange: [49.0800, 49.1900], lngRange: [-122.8800, -122.6800],
    priceRange: { House: [850000, 2200000], 'Apt/Condo': [330000, 800000], Townhouse: [550000, 1100000], 'Land/Lot': [600000, 1800000], Duplex: [700000, 1400000], 'Mfd Home': [220000, 480000] },
    typeWeights: { House: 0.40, 'Apt/Condo': 0.20, Townhouse: 0.25, Duplex: 0.07, 'Land/Lot': 0.05, 'Mfd Home': 0.03 },
    listingsCount: 12,
  },
  {
    region: 'Sunshine Coast',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Gibsons', 'Sechelt', 'Roberts Creek', 'Halfmoon Bay', 'Pender Harbour', 'Madeira Park'],
    streets: SUNSHINE_COAST_STREETS, agents: SUNSHINE_COAST_AGENTS,
    latRange: [49.3700, 49.6400], lngRange: [-124.0300, -123.4800],
    priceRange: { House: [600000, 1800000], 'Apt/Condo': [300000, 700000], Townhouse: [450000, 900000], 'Land/Lot': [250000, 1200000], Duplex: [500000, 1000000], 'Mfd Home': [180000, 400000] },
    typeWeights: { House: 0.50, 'Apt/Condo': 0.10, Townhouse: 0.15, Duplex: 0.05, 'Land/Lot': 0.12, 'Mfd Home': 0.08 },
    listingsCount: 11,
  },
  {
    region: 'Okanagan',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Kelowna', 'West Kelowna', 'Penticton', 'Vernon', 'Lake Country', 'Summerland', 'Peachland', 'Osoyoos', 'Oliver'],
    streets: OKANAGAN_STREETS, agents: OKANAGAN_AGENTS,
    latRange: [49.0200, 50.2800], lngRange: [-119.7500, -119.3200],
    priceRange: { House: [500000, 2000000], 'Apt/Condo': [250000, 800000], Townhouse: [400000, 1000000], 'Land/Lot': [200000, 1500000], Duplex: [450000, 1100000], 'Mfd Home': [150000, 400000] },
    typeWeights: { House: 0.40, 'Apt/Condo': 0.20, Townhouse: 0.15, Duplex: 0.08, 'Land/Lot': 0.10, 'Mfd Home': 0.07 },
    listingsCount: 14,
  },
  {
    region: 'Sea to Sky',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Whistler', 'Pemberton', 'Squamish'],
    streets: SEA_TO_SKY_STREETS, agents: SEA_TO_SKY_AGENTS,
    latRange: [49.7000, 50.3600], lngRange: [-123.2000, -122.7800],
    priceRange: { House: [800000, 4500000], 'Apt/Condo': [350000, 2000000], Townhouse: [600000, 2500000], 'Land/Lot': [400000, 3000000], Duplex: [700000, 1800000], 'Mfd Home': [300000, 600000] },
    typeWeights: { House: 0.35, 'Apt/Condo': 0.30, Townhouse: 0.20, Duplex: 0.05, 'Land/Lot': 0.07, 'Mfd Home': 0.03 },
    listingsCount: 10,
  },
  {
    region: 'Gulf Islands',
    jurisdiction: 'CA-BC', country: 'CA', provinceState: 'BC', currency: 'CAD',
    neighborhoods: ['Salt Spring Island', 'Galiano Island', 'Mayne Island', 'Pender Island', 'Saturna Island', 'Gabriola Island'],
    streets: GULF_ISLANDS_STREETS, agents: GULF_ISLANDS_AGENTS,
    latRange: [48.7500, 49.1800], lngRange: [-123.8500, -123.2500],
    priceRange: { House: [500000, 2500000], 'Apt/Condo': [250000, 600000], Townhouse: [350000, 800000], 'Land/Lot': [150000, 1500000], Duplex: [400000, 900000], 'Mfd Home': [200000, 500000] },
    typeWeights: { House: 0.50, 'Apt/Condo': 0.05, Townhouse: 0.10, Duplex: 0.05, 'Land/Lot': 0.20, 'Mfd Home': 0.10 },
    listingsCount: 11,
  },

  // ── OUT-OF-BC REGIONS ──
  {
    region: 'Edmonton',
    jurisdiction: 'CA-AB', country: 'CA', provinceState: 'AB', currency: 'CAD',
    neighborhoods: ['Downtown Edmonton', 'Oliver District', 'Strathcona', 'Whyte Ave', 'Windermere', 'Terwillegar', 'Riverbend', 'Mill Woods', 'St. Albert', 'Sherwood Park'],
    streets: AB_STREETS, agents: AB_AGENTS,
    latRange: [53.4600, 53.6100], lngRange: [-113.6200, -113.3200],
    priceRange: { House: [280000, 850000], 'Apt/Condo': [120000, 380000], Townhouse: [200000, 500000], 'Land/Lot': [100000, 500000], Duplex: [250000, 550000], 'Mfd Home': [80000, 200000] },
    typeWeights: { House: 0.40, 'Apt/Condo': 0.25, Townhouse: 0.15, Duplex: 0.10, 'Land/Lot': 0.05, 'Mfd Home': 0.05 },
    listingsCount: 14,
  },
  {
    region: 'Hinton',
    jurisdiction: 'CA-AB', country: 'CA', provinceState: 'AB', currency: 'CAD',
    neighborhoods: ['Hinton', 'Edson'],
    streets: AB_STREETS, agents: AB_AGENTS,
    latRange: [53.3700, 53.5900], lngRange: [-117.6300, -116.3500],
    priceRange: { House: [180000, 500000], 'Apt/Condo': [80000, 220000], Townhouse: [140000, 320000], 'Land/Lot': [40000, 250000], Duplex: [150000, 350000], 'Mfd Home': [60000, 180000] },
    typeWeights: { House: 0.50, 'Apt/Condo': 0.10, Townhouse: 0.10, Duplex: 0.10, 'Land/Lot': 0.10, 'Mfd Home': 0.10 },
    listingsCount: 10,
  },
  {
    region: 'Toronto',
    jurisdiction: 'CA-ON', country: 'CA', provinceState: 'ON', currency: 'CAD',
    neighborhoods: ['Downtown Core', 'Yorkville', 'The Annex', 'Liberty Village', 'King West', 'Leslieville', 'The Beaches', 'North York', 'Scarborough', 'Etobicoke', 'Mississauga', 'Markham'],
    streets: ON_STREETS, agents: ON_AGENTS,
    latRange: [43.6000, 43.8500], lngRange: [-79.6300, -79.1800],
    priceRange: { House: [800000, 3500000], 'Apt/Condo': [400000, 1500000], Townhouse: [600000, 1800000], 'Land/Lot': [500000, 3000000], Duplex: [700000, 2000000], 'Mfd Home': [250000, 500000] },
    typeWeights: { House: 0.25, 'Apt/Condo': 0.40, Townhouse: 0.20, Duplex: 0.08, 'Land/Lot': 0.04, 'Mfd Home': 0.03 },
    listingsCount: 15,
  },
  {
    region: 'Laguna Beach',
    jurisdiction: 'US-CA', country: 'US', provinceState: 'CA', currency: 'USD',
    neighborhoods: ['Laguna Beach', 'Dana Point', 'San Clemente', 'San Juan Capistrano', 'Laguna Niguel', 'Newport Beach'],
    streets: CA_STREETS, agents: US_AGENTS,
    latRange: [33.4200, 33.6300], lngRange: [-117.8600, -117.6800],
    priceRange: { House: [1500000, 12000000], 'Apt/Condo': [600000, 3500000], Townhouse: [900000, 4000000], 'Land/Lot': [800000, 8000000], Duplex: [1200000, 5000000], 'Mfd Home': [400000, 1000000] },
    typeWeights: { House: 0.40, 'Apt/Condo': 0.25, Townhouse: 0.15, Duplex: 0.05, 'Land/Lot': 0.10, 'Mfd Home': 0.05 },
    listingsCount: 12,
  },
];

// ── Coordinate offsets per neighborhood for more realism ─────────────────────

const NEIGHBORHOOD_COORDS = {
  // Vancouver
  'Downtown': { lat: 49.2827, lng: -123.1207 },
  'West End': { lat: 49.2860, lng: -123.1340 },
  'Kitsilano': { lat: 49.2650, lng: -123.1680 },
  'Mount Pleasant': { lat: 49.2620, lng: -123.1010 },
  'Commercial Drive': { lat: 49.2700, lng: -123.0700 },
  'Kerrisdale': { lat: 49.2330, lng: -123.1560 },
  'Dunbar': { lat: 49.2440, lng: -123.1850 },
  'Point Grey': { lat: 49.2680, lng: -123.2030 },
  'Marpole': { lat: 49.2110, lng: -123.1310 },
  'Hastings-Sunrise': { lat: 49.2810, lng: -123.0440 },
  'Renfrew-Collingwood': { lat: 49.2420, lng: -123.0350 },
  // Burnaby / New Westminster
  'Metrotown': { lat: 49.2270, lng: -123.0020 },
  'Brentwood': { lat: 49.2660, lng: -123.0010 },
  'Edmonds': { lat: 49.2120, lng: -122.9590 },
  'Lougheed': { lat: 49.2480, lng: -122.8970 },
  'Downtown NW': { lat: 49.2040, lng: -122.9110 },
  'Sapperton': { lat: 49.2240, lng: -122.8890 },
  'Queensborough': { lat: 49.1890, lng: -122.9350 },
  // North Shore
  'Lower Lonsdale': { lat: 49.3120, lng: -123.0770 },
  'Lynn Valley': { lat: 49.3430, lng: -123.0350 },
  'Deep Cove': { lat: 49.3290, lng: -122.9500 },
  'Ambleside': { lat: 49.3270, lng: -123.1520 },
  'Dundarave': { lat: 49.3290, lng: -123.1690 },
  'British Properties': { lat: 49.3560, lng: -123.1650 },
  // Tri-Cities
  'Town Centre': { lat: 49.2780, lng: -122.7910 },
  'Burke Mountain': { lat: 49.3010, lng: -122.7500 },
  'Westwood Plateau': { lat: 49.2940, lng: -122.7760 },
  'Port Coquitlam': { lat: 49.2610, lng: -122.7510 },
  'Inlet Centre': { lat: 49.2740, lng: -122.8250 },
  'Heritage Mountain': { lat: 49.2900, lng: -122.8070 },
  // Ridge Meadows
  'Maple Ridge Town Centre': { lat: 49.2190, lng: -122.5970 },
  'Silver Valley': { lat: 49.2420, lng: -122.5530 },
  'Albion': { lat: 49.2250, lng: -122.5670 },
  'Pitt Meadows': { lat: 49.2210, lng: -122.6880 },
  // Langley / Delta
  'Langley City': { lat: 49.1040, lng: -122.6590 },
  'Willoughby': { lat: 49.1380, lng: -122.6550 },
  'Walnut Grove': { lat: 49.1640, lng: -122.6390 },
  'Fort Langley': { lat: 49.1680, lng: -122.5790 },
  'Tsawwassen': { lat: 49.0050, lng: -123.0770 },
  'Ladner': { lat: 49.0860, lng: -123.0840 },
  'North Delta': { lat: 49.1570, lng: -122.9220 },
  // Richmond
  'Richmond Centre': { lat: 49.1660, lng: -123.1370 },
  'Steveston': { lat: 49.1280, lng: -123.1860 },
  'Brighouse': { lat: 49.1700, lng: -123.1410 },
  'Ironwood': { lat: 49.1520, lng: -123.1060 },
  'Terra Nova': { lat: 49.1830, lng: -123.1800 },
  // Surrey (Expanded)
  'Fleetwood': { lat: 49.1570, lng: -122.7780 },
  'Guildford': { lat: 49.1870, lng: -122.7980 },
  'Cloverdale': { lat: 49.1030, lng: -122.7310 },
  'Newton': { lat: 49.1340, lng: -122.8390 },
  'Panorama Ridge': { lat: 49.0930, lng: -122.7950 },
  'Fraser Heights': { lat: 49.1930, lng: -122.7430 },
  // Sunshine Coast
  'Gibsons': { lat: 49.4010, lng: -123.5050 },
  'Sechelt': { lat: 49.4730, lng: -123.7550 },
  'Roberts Creek': { lat: 49.4260, lng: -123.6450 },
  'Halfmoon Bay': { lat: 49.5190, lng: -123.9100 },
  'Pender Harbour': { lat: 49.6240, lng: -124.0250 },
  'Madeira Park': { lat: 49.6210, lng: -124.0200 },
  // Okanagan
  'Kelowna': { lat: 49.8880, lng: -119.4960 },
  'West Kelowna': { lat: 49.8630, lng: -119.5830 },
  'Penticton': { lat: 49.4990, lng: -119.5900 },
  'Vernon': { lat: 50.2670, lng: -119.2720 },
  'Lake Country': { lat: 50.0600, lng: -119.4130 },
  'Summerland': { lat: 49.6050, lng: -119.6770 },
  'Peachland': { lat: 49.7720, lng: -119.7340 },
  'Osoyoos': { lat: 49.0310, lng: -119.4690 },
  'Oliver': { lat: 49.1830, lng: -119.5510 },
  // Sea to Sky
  'Whistler': { lat: 50.1163, lng: -122.9574 },
  'Pemberton': { lat: 50.3193, lng: -122.8030 },
  'Squamish': { lat: 49.7016, lng: -123.1558 },
  // Gulf Islands
  'Salt Spring Island': { lat: 48.8290, lng: -123.5090 },
  'Galiano Island': { lat: 48.9190, lng: -123.4150 },
  'Mayne Island': { lat: 48.8510, lng: -123.2970 },
  'Pender Island': { lat: 48.7870, lng: -123.2710 },
  'Saturna Island': { lat: 48.7870, lng: -123.1740 },
  'Gabriola Island': { lat: 49.1600, lng: -123.7900 },
  // Edmonton
  'Downtown Edmonton': { lat: 53.5441, lng: -113.4909 },
  'Oliver District': { lat: 53.5400, lng: -113.5200 },
  'Strathcona': { lat: 53.5190, lng: -113.4970 },
  'Whyte Ave': { lat: 53.5170, lng: -113.4980 },
  'Windermere': { lat: 53.4670, lng: -113.5660 },
  'Terwillegar': { lat: 53.4710, lng: -113.5920 },
  'Riverbend': { lat: 53.4730, lng: -113.5400 },
  'Mill Woods': { lat: 53.4590, lng: -113.4380 },
  'St. Albert': { lat: 53.6310, lng: -113.6270 },
  'Sherwood Park': { lat: 53.5410, lng: -113.3180 },
  // Hinton
  'Hinton': { lat: 53.3964, lng: -117.5790 },
  'Edson': { lat: 53.5830, lng: -116.4350 },
  // Toronto
  'Downtown Core': { lat: 43.6532, lng: -79.3832 },
  'Yorkville': { lat: 43.6710, lng: -79.3930 },
  'The Annex': { lat: 43.6700, lng: -79.4050 },
  'Liberty Village': { lat: 43.6370, lng: -79.4190 },
  'King West': { lat: 43.6440, lng: -79.4010 },
  'Leslieville': { lat: 43.6630, lng: -79.3350 },
  'The Beaches': { lat: 43.6720, lng: -79.2960 },
  'North York': { lat: 43.7615, lng: -79.4111 },
  'Scarborough': { lat: 43.7731, lng: -79.2577 },
  'Etobicoke': { lat: 43.6205, lng: -79.5132 },
  'Mississauga': { lat: 43.5890, lng: -79.6441 },
  'Markham': { lat: 43.8561, lng: -79.3370 },
  // Laguna Beach
  'Laguna Beach': { lat: 33.5427, lng: -117.7854 },
  'Dana Point': { lat: 33.4672, lng: -117.6981 },
  'San Clemente': { lat: 33.4269, lng: -117.6120 },
  'San Juan Capistrano': { lat: 33.5017, lng: -117.6626 },
  'Laguna Niguel': { lat: 33.5225, lng: -117.7076 },
  'Newport Beach': { lat: 33.6189, lng: -117.9298 },
};

// ── Generate a single listing ────────────────────────────────────────────────

function generateListing(regionDef) {
  const neighborhood = pick(regionDef.neighborhoods);
  const type = weightedType(regionDef.typeWeights);
  const priceR = regionDef.priceRange[type];
  const price = roundPrice(randInt(priceR[0], priceR[1]));

  let beds, baths, sqft;
  if (type === 'Land/Lot') {
    beds = 0; baths = 0; sqft = 0;
  } else if (type === 'Apt/Condo') {
    beds = pick([1, 1, 2, 2, 2, 3, 3]);
    baths = pick([1, 1, 2, 2]);
    sqft = randInt(450, 1800);
  } else if (type === 'Townhouse') {
    beds = pick([2, 2, 3, 3, 3, 4]);
    baths = pick([2, 2, 3, 3]);
    sqft = randInt(1000, 2400);
  } else if (type === 'Duplex') {
    beds = pick([3, 4, 4, 5, 6]);
    baths = pick([2, 3, 3, 4]);
    sqft = randInt(1400, 3200);
  } else if (type === 'Mfd Home') {
    beds = pick([2, 2, 3, 3]);
    baths = pick([1, 1, 2]);
    sqft = randInt(700, 1400);
  } else {
    // House
    beds = pick([2, 3, 3, 3, 4, 4, 5, 5, 6]);
    baths = pick([2, 2, 3, 3, 4, 4, 5]);
    sqft = randInt(1200, 5000);
  }

  const streetNum = randInt(100, 19999);
  const street = pick(regionDef.streets);
  const addr = type === 'Apt/Condo' && Math.random() < 0.4
    ? `${randInt(101, 2505)}-${streetNum} ${street}`
    : `${streetNum} ${street}`;

  const coords = NEIGHBORHOOD_COORDS[neighborhood];
  const lat = coords
    ? randFloat(coords.lat - 0.015, coords.lat + 0.015)
    : randFloat(regionDef.latRange[0], regionDef.latRange[1]);
  const lng = coords
    ? randFloat(coords.lng - 0.015, coords.lng + 0.015)
    : randFloat(regionDef.lngRange[0], regionDef.lngRange[1]);

  const waterView = Math.random() < 0.12;
  const dom = randInt(1, 120);
  const yearBuilt = type === 'Land/Lot' ? null : randInt(1950, 2025);
  const lot = genLot(type);
  const agent = pick(regionDef.agents);

  const listing = {
    addr,
    price,
    beds,
    baths,
    sqft,
    type,
    lot,
    agent,
    neighborhood,
    dom,
    yearBuilt,
    waterView,
    latitude: lat,
    longitude: lng,
    region: regionDef.region,
    country: regionDef.country,
    provinceState: regionDef.provinceState,
    currency: regionDef.currency,
    jurisdiction: regionDef.jurisdiction,
  };

  return listing;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Reading existing listings from', LISTINGS_PATH);
  const data = JSON.parse(fs.readFileSync(LISTINGS_PATH, 'utf-8'));

  const existingCount = data.listings.length;
  console.log(`Existing listings: ${existingCount}`);

  const newListings = [];
  for (const regionDef of REGIONS) {
    const count = regionDef.listingsCount;
    console.log(`Generating ${count} listings for ${regionDef.region}...`);
    for (let i = 0; i < count; i++) {
      newListings.push(generateListing(regionDef));
    }
  }

  console.log(`Generated ${newListings.length} new listings across ${REGIONS.length} regions`);

  // Append new listings
  data.listings.push(...newListings);

  // Update metadata
  const allRegions = new Set(data.metadata.regions);
  const allNeighborhoods = new Set(data.metadata.neighborhoods);

  for (const listing of newListings) {
    allRegions.add(listing.region);
    allNeighborhoods.add(listing.neighborhood);
  }

  data.metadata.regions = [...allRegions].sort();
  data.metadata.neighborhoods = [...allNeighborhoods].sort();
  data.metadata.totalListings = data.listings.length;
  data.metadata.lastUpdated = new Date().toISOString();

  // Write back
  fs.writeFileSync(LISTINGS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');

  console.log(`\nDone! Updated ${LISTINGS_PATH}`);
  console.log(`Total listings: ${data.metadata.totalListings} (was ${existingCount})`);
  console.log(`Regions: ${data.metadata.regions.length}`);
  console.log(`Neighborhoods: ${data.metadata.neighborhoods.length}`);
}

main();
