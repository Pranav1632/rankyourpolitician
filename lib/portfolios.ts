// One-line, non-partisan mandates for each Union ministry / department, so a
// minister's profile shows what their portfolio actually DOES (their real
// executive responsibility) instead of a generic "Member of Parliament" block.
// Plain-language on purpose, matching the site's tone. Shown as data (English).
//
// Keys are the portfolio strings used in data/seed/central_government.json, with
// any "(Independent Charge)" suffix stripped by normalizePortfolio().

export function normalizePortfolio(name: string): string {
  return name.replace(/\s*\(independent charge\)\s*/i, '').trim();
}

export const PORTFOLIO_MANDATE: Record<string, string> = {
  'Prime Minister':
    'Heads the Union government and chairs the Council of Ministers; sets overall policy and coordinates every ministry.',
  'Personnel, Public Grievances and Pensions':
    'Central-government staffing and recruitment rules, administrative reform, pensions, and the public-grievance system (CPGRAMS).',
  'Department of Atomic Energy': "India's nuclear power, research reactors and atomic-energy programme.",
  'Department of Space': 'The national space programme and ISRO.',
  'All important policy issues and all portfolios not allocated to any Minister':
    'Any policy matter or department not specifically assigned to another minister.',
  Defence: 'The armed forces (Army, Navy, Air Force), defence production and procurement, and border security.',
  'Home Affairs': 'Internal security, central police forces, borders, Union Territories and centre-state coordination.',
  'Co-operation': 'Cooperative societies, cooperative credit and the wider cooperative sector.',
  'Road Transport and Highways': 'National highways, road safety and motor-vehicle regulation.',
  'Health and Family Welfare': 'Public-health policy, central hospitals, drug regulation and national health programmes.',
  'Chemicals and Fertilizers':
    'The chemicals, petrochemicals and pharmaceuticals industries, and the fertiliser supply and subsidy.',
  "Agriculture and Farmers' Welfare": 'Crop policy, minimum support prices, farm schemes and farmer welfare.',
  'Rural Development': 'Rural jobs (MGNREGA), rural roads, rural housing and poverty-reduction schemes.',
  Finance: 'The Union Budget, taxation, public spending, banking and financial-sector policy.',
  'Corporate Affairs': 'Company law, corporate governance and business regulation.',
  'External Affairs': 'Foreign policy, diplomacy, embassies and Indians abroad.',
  Power: 'Electricity generation and transmission policy and the national grid.',
  'Housing and Urban Affairs': 'Cities and towns - urban housing, metros and urban infrastructure.',
  'Heavy Industries': 'State-owned heavy-engineering firms and the auto and capital-goods sector.',
  Steel: 'The steel industry and public-sector steel producers.',
  'Commerce and Industry': 'Foreign trade, exports, industrial policy and ease of doing business.',
  Education: 'Schools, higher education, universities and national education policy.',
  'Micro, Small and Medium Enterprises': 'Small businesses (MSMEs) - credit, promotion and clusters.',
  'Panchayati Raj': 'Village and district local self-government (panchayats).',
  'Fisheries, Animal Husbandry and Dairying': 'Fisheries, livestock, dairy and animal health.',
  'Ports, Shipping and Waterways': 'Ports, merchant shipping and inland waterways.',
  'Social Justice and Empowerment':
    'Welfare of Scheduled Castes, OBCs, persons with disabilities and other marginalised groups.',
  'Civil Aviation': 'Airlines, airports and air-travel regulation.',
  'Consumer Affairs, Food and Public Distribution':
    'Consumer protection, food procurement and the public distribution system (ration shops).',
  'New and Renewable Energy': 'Solar, wind and other renewable-energy programmes.',
  'Tribal Affairs': 'Welfare and development of Scheduled Tribes.',
  Textiles: 'The textiles, handloom and handicrafts sector.',
  Railways: 'Indian Railways - trains, tracks, stations and rail safety.',
  'Information and Broadcasting': 'TV, radio, film and government communication and media policy.',
  'Electronics and Information Technology': 'IT, electronics manufacturing, digital services and data policy.',
  Communications: 'Telecom, mobile networks, spectrum and postal services.',
  'Development of North Eastern Region': 'Development and central schemes for the North-Eastern states.',
  'Environment, Forest and Climate Change': 'Environmental protection, forests, wildlife and climate policy.',
  Culture: 'Heritage, museums, archaeology and cultural institutions.',
  Tourism: 'Promotion and development of tourism.',
  'Women and Child Development': "Child nutrition, women's safety and welfare schemes (e.g. Anganwadi).",
  'Parliamentary Affairs': 'Managing government business in Parliament and coordinating between the two Houses.',
  'Minority Affairs': 'Welfare and education schemes for religious minorities.',
  'Petroleum and Natural Gas': 'Oil and gas - exploration, refining, LPG and fuel supply.',
  'Labour and Employment': 'Labour laws, worker welfare, social security and employment services.',
  'Youth Affairs and Sports': 'Sports, athletes and youth programmes.',
  Coal: 'Coal mining and supply.',
  Mines: 'Mining of minerals other than coal and petroleum.',
  'Food Processing Industries': 'The food-processing and packaged-food industry.',
  'Jal Shakti': 'Water resources, rivers, drinking water and sanitation (Jal Jeevan / Swachh Bharat).',
  'Statistics and Programme Implementation':
    'National statistics and surveys, and monitoring of flagship government projects.',
  Planning: 'Policy-planning support (NITI Aayog-related work).',
  'Science and Technology': 'Scientific research, R&D funding and technology development.',
  'Earth Sciences': 'Weather forecasting, oceans and climate science (IMD).',
  "Prime Minister's Office": 'Supports the Prime Minister and coordinates across the government.',
  'Law and Justice': 'Laws, the court system, legal affairs and the judicial-appointments process.',
  AYUSH: 'Traditional medicine - Ayurveda, Yoga, Unani, Siddha and Homoeopathy.',
  'Skill Development and Entrepreneurship': 'Vocational-skills training and entrepreneurship programmes.',
};

/** Mandate for a portfolio string (tolerant of the "(Independent Charge)" suffix). */
export function portfolioMandate(name: string): string | undefined {
  return PORTFOLIO_MANDATE[normalizePortfolio(name)];
}
