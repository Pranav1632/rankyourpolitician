// Role-based ESCALATION CHAINS: who reports to whom in the appointed bureaucracy,
// so a citizen can see the next authority up when an office does not act. These
// are chains of COMMAND among appointed officials - NOT elected representatives
// (an MLA/MP/Mayor is a separate, parallel lever, never a rung here).
//
// GENERATED from a research + adversarial-verification workflow (all chains
// returned "high" confidence); regenerate via tools/data-manager. Titles/thresholds
// vary by state - see each chain's `variesNote`. `sources` cite the references used.
import type { IconName } from '@/components/Icon';
import type { ProblemType, OfficeType } from './types';

export type ChainKey =
  | 'police' | 'revenue' | 'urban_civic' | 'pwd' | 'water_phed'
  | 'rural_panchayat' | 'health' | 'education' | 'electricity' | 'pds';

export interface EscalationRung {
  id: string;
  title: string;
  short: string;
  level: string;
  jurisdiction: string;
  handles: string;
  escalateWhen?: string;
}

export interface EscalationChainDef {
  label: string;
  icon: IconName;
  rungs: EscalationRung[]; // ordered BOTTOM (citizen-facing) -> TOP (state head)
  citizenStartIndex: number;
  variesNote?: string;
  sources?: string[];
}

export const ESCALATION_CHAINS: Record<ChainKey, EscalationChainDef> = {
  "police": {
    "label": "Police / law & order",
    "icon": "shield",
    "rungs": [
      {
        "id": "sho",
        "title": "Station House Officer (SHO) / Officer-in-Charge (thana in-charge)",
        "short": "SHO",
        "level": "station",
        "jurisdiction": "One police station (thana) area",
        "handles": "File your complaint/FIR here first; the officer legally bound to register a cognizable-offence FIR under BNSS Sec 173(1) (old CrPC 154).",
        "escalateWhen": "If the SHO refuses to register the FIR, delays, or fails to investigate, escalate to the SDPO/DSP or send a written complaint to the SP."
      },
      {
        "id": "sdpo-dsp",
        "title": "Sub-Divisional Police Officer (SDPO) / Circle Officer (CO), a Deputy Superintendent of Police (DSP) rank officer",
        "short": "SDPO/DSP",
        "level": "sub-division",
        "jurisdiction": "A police sub-division / circle covering several stations",
        "handles": "First supervisory officer above the thana; take a station's inaction or a botched investigation here for local review and direction.",
        "escalateWhen": "If the SDPO/DSP does not intervene or the matter needs district-level authority, approach the Superintendent of Police."
      },
      {
        "id": "sp-ssp",
        "title": "Superintendent of Police (SP) / Senior Superintendent of Police (SSP)",
        "short": "SP/SSP",
        "level": "district",
        "jurisdiction": "One district (or Deputy Commissioner of Police in a commissionerate city)",
        "handles": "District police head and key escalation point: BNSS Sec 173(4) (old CrPC 154(3)) lets you send a written complaint to the SP if the station refuses an FIR; the SP can register/investigate or direct a subordinate to.",
        "escalateWhen": "If the SP does not act or the issue spans multiple districts, escalate to the Range DIG."
      },
      {
        "id": "dig",
        "title": "Deputy Inspector General of Police (DIG), Range",
        "short": "DIG",
        "level": "range",
        "jurisdiction": "A police 'range' of several districts",
        "handles": "Supervisory officer over a cluster of districts; approach for grievances the district SP has failed to resolve.",
        "escalateWhen": "If unresolved at range level, escalate to the zonal IG / ADGP."
      },
      {
        "id": "ig-adgp",
        "title": "Inspector General of Police (IGP) / Additional Director General of Police (ADGP), Zone",
        "short": "IG/ADGP",
        "level": "zone",
        "jurisdiction": "A police 'zone' covering multiple ranges",
        "handles": "Senior zonal supervisory officer; take persistent failures across ranges or serious misconduct here.",
        "escalateWhen": "If the zone-level officer does not act, escalate to the state police chief (DGP)."
      },
      {
        "id": "dgp",
        "title": "Director General of Police (DGP)",
        "short": "DGP",
        "level": "state",
        "jurisdiction": "The entire state / UT police force",
        "handles": "Head of the state police; final internal escalation for systemic inaction, and the office linked to the State Police Complaints Authority process.",
        "escalateWhen": "If internal police channels are exhausted, escalate outside the force - Magistrate under BNSS Sec 175(3) (old CrPC 156(3)), State/National Human Rights Commission, State/District Police Complaints Authority, or the High Court."
      },
      {
        "id": "home-secretary",
        "title": "Principal Secretary / Additional Chief Secretary (Home), State Home Department",
        "short": "Home Secretary",
        "level": "state",
        "jurisdiction": "State government's administrative control over the police",
        "handles": "Civil-service head of the Home Department to whom the police report administratively; approach for policy-level or systemic grievances the DGP cannot or will not address.",
        "escalateWhen": "Beyond this, the levers are the Chief Secretary, the political executive (Home Minister/CM) or the courts - not a further police reporting rung."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "Structure varies by state. In commissionerate cities (metros) the district/range tiers are replaced by ACP → DCP → Joint/Addl CP → Commissioner of Police, who also holds magisterial powers. Not every state uses both 'range' (DIG) and 'zone' (IG/ADGP) layers - smaller states may have SP reporting closer to the DGP. Rank-wise ADGP is actually senior to IG (it sits just below DGP); they are grouped at 'zone' level here only because a zone may be headed by either. SHO rank also varies (Inspector in most states, sometimes Sub-Inspector for smaller stations).",
    "sources": [
      "https://en.wikipedia.org/wiki/Police_ranks_and_insignia_of_India",
      "https://www.cyberlawconsulting.com/police_does_not_take_fir.php",
      "https://www.scconline.com/blog/post/2026/01/06/magistrate-ordered-investigation-section-175-3-bnss-analysis/",
      "https://www.sansalegal.com/post/how-to-file-a-complaint-against-a-police-officer-in-india-bnss-process-and-authorities"
    ]
  },
  "revenue": {
    "label": "Revenue, land & certificates",
    "icon": "law",
    "rungs": [
      {
        "id": "patwari",
        "title": "Patwari / Lekhpal / Talathi / Village Accountant (VA)",
        "short": "Patwari",
        "level": "station",
        "jurisdiction": "One village or a small cluster of villages (patwar circle)",
        "handles": "First point of contact for land records: apply for mutation (change of ownership after sale/inheritance), get certified copies of khatauni/jamabandi/RTC, and get field details verified for caste/income/residence/domicile certificate applications.",
        "escalateWhen": "Escalate to the Revenue Inspector/Kanungo if the Patwari refuses or delays a record entry, makes a wrong entry, or asks for a bribe."
      },
      {
        "id": "ri-kanungo",
        "title": "Revenue Inspector / Kanungo / Supervisor (RI)",
        "short": "RI/Kanungo",
        "level": "block",
        "jurisdiction": "A revenue circle covering several patwar circles/villages",
        "handles": "Supervises Patwaris and their records; a citizen goes here to get a stalled mutation moved forward, to have record errors checked, and to have field measurement/demarcation reports countersigned.",
        "escalateWhen": "Escalate to the Tehsildar if the RI cannot get the Patwari to act, or the matter needs a formal order (mutation sanction, certificate issue, or a small revenue dispute)."
      },
      {
        "id": "tehsildar",
        "title": "Tehsildar / Naib-Tehsildar / Mamlatdar / Taluka Magistrate",
        "short": "Tehsildar",
        "level": "tehsil",
        "jurisdiction": "One tehsil / taluka / mandal (a sub-district)",
        "handles": "The key deciding officer at ground level: sanctions/rejects mutations, issues caste, income, residence/domicile and other revenue certificates, orders demarcation and partition, and hears minor land-record disputes.",
        "escalateWhen": "Escalate (first appeal) to the SDM/SDO if the Tehsildar wrongly rejects/sanctions a mutation, refuses a certificate, or you dispute the order - typically within 30 days."
      },
      {
        "id": "sdm-sdo-rdo",
        "title": "Sub-Divisional Magistrate / Sub-Divisional Officer / Revenue Divisional Officer",
        "short": "SDM/SDO/RDO",
        "level": "sub-division",
        "jurisdiction": "A revenue sub-division (a group of tehsils within a district)",
        "handles": "First appellate/revenue court above the Tehsildar: hears appeals against Tehsildar's mutation and certificate orders, decides bigger partition/boundary disputes, and supervises all Tehsils in the sub-division.",
        "escalateWhen": "Escalate to the District Collector/DM if the SDM's order is unsatisfactory or the dispute is of district-wide significance - typically within 30-60 days."
      },
      {
        "id": "dc-dm-collector",
        "title": "District Collector / District Magistrate / Deputy Commissioner",
        "short": "DC/DM/Collector",
        "level": "district",
        "jurisdiction": "The whole district",
        "handles": "Chief revenue officer and appellate authority of the district: hears appeals against SDM orders, is the district-level authority on land revenue, records and major land disputes, and controls certificate issuance across the district.",
        "escalateWhen": "Escalate to the Divisional Commissioner if the Collector's revenue order is disputed or the Collectorate does not resolve the matter - typically within 60 days."
      },
      {
        "id": "div-commissioner",
        "title": "Divisional Commissioner (Revenue Commissioner)",
        "short": "Div. Commissioner",
        "level": "division",
        "jurisdiction": "A revenue division covering several districts",
        "handles": "Senior revenue appellate authority above the Collector: hears appeals/revisions against Collector's revenue and land-dispute orders and supervises revenue administration across the division. (Some states route revision through the Board of Revenue / Financial Commissioner instead.)",
        "escalateWhen": "Escalate to the Board of Revenue / State Revenue Department if the Commissioner's order needs revision or the issue is one of state-wide policy."
      },
      {
        "id": "board-of-revenue-pr-secy-revenue",
        "title": "Board of Revenue / Financial Commissioner / Principal Secretary (Revenue) - under the Chief Secretary",
        "short": "Board of Revenue / Pr. Secy (Revenue)",
        "level": "state",
        "jurisdiction": "The entire state / UT",
        "handles": "Apex revenue authority: the Board of Revenue (or Financial Commissioner in states without a Board) is the highest revenue court/revision authority, while the Principal Secretary (Revenue) heads the department for policy, rules and administrative complaints - the top of the revenue chain below the political executive.",
        "escalateWhen": "Beyond this, remedies lie outside the administrative chain - the High Court (writ/revision) or civil courts."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "Titles vary by state: the village accountant is Patwari (north/Punjab/Haryana/Rajasthan/MP), Lekhpal (UP), Talathi (Maharashtra), Village Accountant/VAO (Karnataka/Tamil Nadu), Karnam (parts of south), Patwari/Amin (Bihar). The supervisor rung is Kanungo/Revenue Inspector/Circle Inspector/Revenue Supervisor. Tehsil is also taluka/mandal/circle; Tehsildar is Mamlatdar (Gujarat/Maharashtra) or Taluka/Tahsildar-Magistrate. SDM's revenue avatar is SDO/RDO in several states. Collector is Deputy Commissioner (Karnataka, Punjab, north-east, etc.). At the top, some states have a formal Board of Revenue (UP, Bihar, Rajasthan, MP, TN, AP/Telangana) that is the apex revenue court; others abolished it and route final revision through the Financial Commissioner (Punjab/Haryana) or the Principal Secretary/Revenue Department under the state government. Appeal time-limits also differ by state revenue code.",
    "sources": [
      "https://www.99acres.com/articles/important-land-administration-officers-in-india.html",
      "https://anantamias.com/indian-administrative-hierarchy/",
      "https://www.cmaknowledge.in/2026/03/complete-process-of-land-and-revenue-court-cases-step-by-step-guide-with-real-case-studies.html",
      "https://righttoinformation.wiki/property-mutation-pending-municipal-revenue-correction-india"
    ]
  },
  "urban_civic": {
    "label": "City civic (Municipal Corporation)",
    "icon": "home",
    "rungs": [
      {
        "id": "je-si",
        "title": "Junior Engineer / Sanitary Inspector (JE / SI)",
        "short": "JE / SI",
        "level": "zone",
        "jurisdiction": "One ward (or a cluster of streets within a ward)",
        "handles": "First point of contact for the problem on the ground - potholes, a burst/leaking water line, choked drain, dead streetlight (JE), or uncollected garbage and dirty streets (SI).",
        "escalateWhen": "Escalate if the complaint is logged but no field crew shows up, or the fix is beyond the field officer's small-works/spot-repair mandate."
      },
      {
        "id": "ae-wo",
        "title": "Assistant Engineer / Ward Officer (Assistant Commissioner) (AE / WO)",
        "short": "AE / WO",
        "level": "zone",
        "jurisdiction": "One ward",
        "handles": "The ward's administrative in-charge who supervises the JEs/SIs and sanctions ward-level works, sanitation staff deployment and local grievances.",
        "escalateWhen": "Escalate if the ward office sits on the complaint, blames lack of funds/staff, or the issue spans multiple wards."
      },
      {
        "id": "ee-zonal-dc",
        "title": "Executive Engineer / Zonal Deputy Municipal Commissioner (EE / Zonal DMC)",
        "short": "EE / Zonal DC",
        "level": "zone",
        "jurisdiction": "A zone (several wards)",
        "handles": "Zone-level head for a service line - approves larger road/water/drain works, coordinates sanitation across wards, and handles complaints unresolved at ward level.",
        "escalateWhen": "Escalate if the zonal office fails to act, or the matter needs a corporation-wide/inter-department decision or budget."
      },
      {
        "id": "addl-mc",
        "title": "Additional / Deputy Municipal Commissioner (Addl. MC / DMC)",
        "short": "Addl. MC",
        "level": "city",
        "jurisdiction": "Whole city (a functional portfolio: engineering, health/sanitation, or revenue)",
        "handles": "City-wide head of a department (e.g. Engineering, Public Health & Sanitation, or Revenue/Property Tax); takes up systemic failures and policy-level grievances for that service.",
        "escalateWhen": "Escalate if the departmental head does not resolve it, or the problem needs the corporation chief's authority."
      },
      {
        "id": "mc",
        "title": "Municipal Commissioner (MC) [CEO in some corporations]",
        "short": "MC",
        "level": "city",
        "jurisdiction": "Entire Municipal Corporation",
        "handles": "Chief executive officer of the corporation (usually an IAS officer); the top appointed authority for all civic services and the final internal escalation within the city body.",
        "escalateWhen": "Escalate beyond the city only if the corporation as a whole is unresponsive, or the issue needs state-level intervention, funds or inter-ULB policy."
      },
      {
        "id": "dma-cdma",
        "title": "Director / Commissioner of Municipal Administration (DMA / CDMA)",
        "short": "DMA / CDMA",
        "level": "state",
        "jurisdiction": "All urban local bodies in the state",
        "handles": "State directorate that supervises and coordinates all municipalities/corporations; citizens approach it when a corporation persistently fails or for state-scheme/oversight matters.",
        "escalateWhen": "Escalate to the parent department for policy, funding or accountability decisions the directorate cannot make."
      },
      {
        "id": "prin-secy-ud",
        "title": "Principal Secretary / ACS, Urban Development (Municipal Administration & Urban Development) Department",
        "short": "Prin. Secy, UD",
        "level": "state",
        "jurisdiction": "State urban-development policy and the entire municipal system",
        "handles": "Administrative head of the state department that owns urban local governance - the top of the appointed reporting chain for civic administration in the state.",
        "escalateWhen": "This is the top of the departmental chain; beyond it lie the Chief Secretary, elected government, courts or constitutional bodies rather than the reporting hierarchy."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "Titles and exact tiering vary by state municipal act and corporation size. Ward-level in-charges are called Ward Officer / Assistant Commissioner in some corporations and Assistant Engineer-led elsewhere; zonal heads may be Deputy or Additional Commissioners. The largest corporations (e.g. Greater Mumbai/BMC, Delhi/MCD) are governed by their own acts and their Commissioners report directly to the state government rather than through a DMA/CDMA directorate; smaller-state corporations route through the state Directorate of Municipal Administration. The state department is variously named Urban Development, Municipal Administration & Urban Development (MA&UD), or Local Self-Government.",
    "sources": [
      "https://en.wikipedia.org/wiki/Municipal_commissioner_(India)",
      "https://en.wikipedia.org/wiki/Municipal_corporation_(India)",
      "https://cdma.ap.gov.in/en/organization-chart",
      "https://cdma.ap.gov.in/about/powers-and-functions/"
    ]
  },
  "pwd": {
    "label": "Roads & buildings (PWD)",
    "icon": "law",
    "rungs": [
      {
        "id": "je",
        "title": "Junior Engineer (JE)",
        "short": "JE",
        "level": "station",
        "jurisdiction": "One section (a stretch of road / cluster of buildings within a sub-division)",
        "handles": "First point of contact for potholes, damaged road stretches, blocked drains, and minor building/repair complaints in the local area.",
        "escalateWhen": "Escalate to the Assistant Engineer if the JE takes no action, says it is beyond his sanction limit, or work is not started within a reasonable time."
      },
      {
        "id": "ae-aee",
        "title": "Assistant Engineer (AE) / Assistant Executive Engineer (AEE)",
        "short": "AE/AEE",
        "level": "sub-division",
        "jurisdiction": "One sub-division (several sections)",
        "handles": "In charge of the sub-division; take up execution and quality of local road/building works, estimates, and repeated JE-level complaints.",
        "escalateWhen": "Escalate to the Executive Engineer if the sub-division fails to act, sanction is pending higher up, or the complaint spans multiple sub-divisions."
      },
      {
        "id": "ee",
        "title": "Executive Engineer (EE) / Divisional Officer",
        "short": "EE",
        "level": "division",
        "jurisdiction": "One division (typically a district or part of a district)",
        "handles": "The key public-facing PWD officer for a district - approves and monitors road/building works, awards contracts within limits, and resolves grievances the sub-division could not.",
        "escalateWhen": "Escalate to the Superintending Engineer if the division is unresponsive, the matter involves larger contracts/policy, or you are dissatisfied with the EE's decision."
      },
      {
        "id": "se",
        "title": "Superintending Engineer (SE)",
        "short": "SE",
        "level": "range",
        "jurisdiction": "One circle (one to two districts / several divisions)",
        "handles": "Supervises the circle's divisions; take up systemic quality issues, delayed projects, and appeals against Executive Engineer decisions.",
        "escalateWhen": "Escalate to the Chief Engineer if the circle does not resolve the issue or it concerns region-wide planning, standards, or major funding."
      },
      {
        "id": "ce",
        "title": "Chief Engineer (CE)",
        "short": "CE",
        "level": "zone",
        "jurisdiction": "One zone/region (several circles)",
        "handles": "Regional head of the engineering wing; escalation point for major unresolved grievances, large project delays, and technical/administrative sanction at scale.",
        "escalateWhen": "Escalate to the Engineer-in-Chief (or, where absent, the Secretary) for state-level policy, standards, or grievances unresolved across the region."
      },
      {
        "id": "einc",
        "title": "Engineer-in-Chief (EinC)",
        "short": "EinC",
        "level": "state",
        "jurisdiction": "Whole state (technical head of the PWD engineering cadre)",
        "handles": "Topmost technical/engineering authority in the department - final internal escalation for engineering decisions, standards, and statewide works.",
        "escalateWhen": "Escalate to the Secretary / Principal Secretary (PWD) when the matter is administrative, policy, or budgetary rather than purely technical."
      },
      {
        "id": "secretary-pwd",
        "title": "Secretary / Principal Secretary, Public Works Department",
        "short": "Secretary (PWD)",
        "level": "state",
        "jurisdiction": "Whole state (administrative head of the department, IAS-rank)",
        "handles": "Administrative and policy head of the department reporting to the Minister; final departmental authority on grievances, funds, and policy.",
        "escalateWhen": "Beyond this, use external levers - Chief Secretary, State Grievance Portal/CPGRAMS, RTI, Lokayukta, or the courts - not a higher PWD rung."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "States vary: some (e.g. Maharashtra, UP) insert an Additional/Principal Chief Engineer or split zones differently; a few use \"Chief Engineer\" as the top technical rank with no separate Engineer-in-Chief, while others (e.g. Andhra/Telangana, Tamil Nadu) do have an Engineer-in-Chief. The lowest field officer may be titled Junior Engineer, Assistant Engineer, or Sub-Divisional Officer depending on state, and the sub-division head is often called the Sub-Divisional Officer (SDO). Roads and buildings are sometimes split into separate wings/circles. The administrative head may be Secretary, Principal Secretary, or Additional Chief Secretary (PWD).",
    "sources": [
      "https://megpwd.gov.in/org-setup.html",
      "https://pwd.maharashtra.gov.in/en/organization-structure/",
      "https://www.pwddelhi.gov.in/organization-structure",
      "https://pwd.py.gov.in/sites/default/files/chapter03.pdf"
    ]
  },
  "water_phed": {
    "label": "Rural water & sewerage (PHED)",
    "icon": "sparkle",
    "rungs": [
      {
        "id": "je",
        "title": "Junior Engineer (JE)",
        "short": "JE",
        "level": "station",
        "jurisdiction": "One section - a cluster of villages / a group of schemes within a sub-division",
        "handles": "Ground-level, citizen-facing officer: no water / dry tap, leaking or burst pipeline, broken handpump or tubewell, contaminated or dirty supply, choked village sewer line - first to log and attend a local complaint.",
        "escalateWhen": "Escalate if the JE does not respond within the charter time, the fault needs materials/funds or a work order he cannot sanction, or the problem spans more than his section."
      },
      {
        "id": "ae-sdo",
        "title": "Assistant Engineer (AE) / Assistant Executive Engineer (AEE), also called Sub-Divisional Officer (SDO)",
        "short": "AE/SDO",
        "level": "sub-division",
        "jurisdiction": "One PHED sub-division (supervises several sections / JEs)",
        "handles": "Supervises the JEs and sanctions minor repairs; approached when a JE fails to act, for recurring scheme failures, small new connections, or estimate-level repair approvals.",
        "escalateWhen": "Escalate if the sub-division cannot fix it, a bigger scheme/pipeline or tender is involved, or the AE is unresponsive."
      },
      {
        "id": "ee",
        "title": "Executive Engineer (EE), head of the PHE Division (Divisional Officer)",
        "short": "EE",
        "level": "division",
        "jurisdiction": "One PHE Division (roughly a district or part of one; supervises several sub-divisions)",
        "handles": "Key decision officer at district level - chronic supply failure across many villages, division-wide scheme execution and maintenance, tenders and larger works, and formal grievance redressal when lower rungs fail.",
        "escalateWhen": "Escalate if the issue is division-wide or systemic, involves major capital works/large funds, or the EE does not resolve a formally lodged complaint."
      },
      {
        "id": "se",
        "title": "Superintending Engineer (SE), head of the PHE Circle",
        "short": "SE",
        "level": "range",
        "jurisdiction": "One PHE Circle - a group of divisions, roughly a cluster of districts / a region (tier sits above division, below zone)",
        "handles": "Circle-level oversight of multiple divisions; escalation point for persistent multi-district problems, delayed major schemes, and to press action when an EE has not delivered.",
        "escalateWhen": "Escalate if the matter spans multiple circles, needs zone/state-level policy or budget decisions, or the SE fails to act."
      },
      {
        "id": "ce",
        "title": "Chief Engineer (CE) / Additional Chief Engineer (ACE), head of the PHE Zone/Region",
        "short": "CE",
        "level": "zone",
        "jurisdiction": "A zone/region of the state (several circles), or a functional wing (rural water, urban, mechanical)",
        "handles": "Senior-most field engineering authority for a large region; approached for major unresolved regional issues, large-scheme delays, and systemic maintenance failures escalated past the circle.",
        "escalateWhen": "Escalate if the issue is state-wide, needs the department's top technical or administrative authority, or remains unresolved at zone level."
      },
      {
        "id": "enc",
        "title": "Engineer-in-Chief (EnC) / Chief Engineer (State Head), technical head of PHED",
        "short": "EnC",
        "level": "state",
        "jurisdiction": "Entire state - head of the PHED engineering cadre",
        "handles": "Top technical head of the department; the final engineering-side escalation for state-wide policy, standards, and unresolved major grievances.",
        "escalateWhen": "Escalate to the administrative/secretariat head if the matter needs policy, inter-departmental, or governance-level decisions beyond the engineering cadre."
      },
      {
        "id": "secretary",
        "title": "Principal Secretary / Secretary, PHED (Public Health Engineering / Drinking Water & Sanitation Dept)",
        "short": "Secretary",
        "level": "state",
        "jurisdiction": "Entire state - administrative head of the department in the Secretariat (IAS officer)",
        "handles": "Administrative and policy head above the engineering cadre; highest departmental authority for budgets, policy, and grievances not resolved by the technical chain (above this sit the Chief Secretary and the Minister as political head).",
        "escalateWhen": "Top of the departmental reporting chain; beyond this lies the Chief Secretary / State Government and the parallel political lever (Minister / elected representatives)."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "State variation is significant. The classic engineering ladder JE → AE/AEE(SDO) → EE → SE → CE → EnC is standard across most states' PHED/PWD cadres, but: (1) many states cap the technical apex at Chief Engineer and have no separate Engineer-in-Chief; (2) the intermediate \"Circle\" tier (SE) can be absent or merged in smaller states/UTs; (3) the entry title is \"Junior Engineer\" in most states but \"Assistant Engineer\" is the direct-recruit degree-holder entry in some, shifting labels down a rung; (4) AE vs AEE and the SDO tag vary; (5) rural water is often under \"PHED\" but in several states sits under a \"Drinking Water & Sanitation\" / \"Jal Jeevan / Rural Water Supply\" directorate with the same cadre; (6) the administrative head may be titled Principal Secretary, Secretary, or ACS depending on the officer's seniority.",
    "sources": [
      "https://www.wbphed.gov.in/images/main/ORGANISATIONAL_STRUCTURE_OF_PHE_DEPTT_11oct2017.pdf",
      "https://phedharyana.gov.in/Organisation/Organisation_Structure_of_Department",
      "https://www.mpphed.gov.in/organization.html",
      "https://pwd.maharashtra.gov.in/en/organization-structure/"
    ]
  },
  "rural_panchayat": {
    "label": "Village & rural development",
    "icon": "people",
    "rungs": [
      {
        "id": "gp-secretary-vdo",
        "title": "Gram Panchayat Secretary / Village Development Officer (VDO)",
        "short": "GP Secretary / VDO",
        "level": "station",
        "jurisdiction": "One Gram Panchayat (a village or cluster of villages)",
        "handles": "Birth/death certificates, property/house tax, water and sanitation complaints, MGNREGA job cards and worksite issues, ration/scheme paperwork, local grievances.",
        "escalateWhen": "Escalate to the BDO if the Secretary is unresponsive, the issue spans multiple panchayats, or funds/approvals sit at the block."
      },
      {
        "id": "bdo",
        "title": "Block Development Officer (BDO)",
        "short": "BDO",
        "level": "block",
        "jurisdiction": "One development block / Panchayat Samiti (many Gram Panchayats)",
        "handles": "Block-level scheme implementation (MGNREGA, PMAY-G, roads, water), release of funds to panchayats, supervision of Secretaries/Gram Sevaks, and complaints against them.",
        "escalateWhen": "Escalate to the Zilla Parishad CEO if the BDO fails to act, funds/tenders are stuck, or the matter is district-wide."
      },
      {
        "id": "ceo-zp",
        "title": "Chief Executive Officer, Zilla Parishad / Zilla Panchayat (CEO)",
        "short": "CEO ZP",
        "level": "district",
        "jurisdiction": "The whole district (all blocks and panchayats)",
        "handles": "District-wide rural development administration, coordination of all BDOs, major grievances, scheme monitoring; also oversees the DRDA/Project Director running centrally sponsored rural schemes.",
        "escalateWhen": "Escalate to the District Collector/DM if it needs district-head authority across departments, or to the state Directorate if the CEO cannot resolve it."
      },
      {
        "id": "dm-collector-dc",
        "title": "District Collector / District Magistrate / Deputy Commissioner (DC)",
        "short": "DM / Collector / DC",
        "level": "district",
        "jurisdiction": "The whole district (apex district authority, chairs the DRDA)",
        "handles": "District-head-level intervention when rural development overlaps with revenue, land, law-and-order, or inter-department coordination; chairs the District Rural Development Agency.",
        "escalateWhen": "Escalate to the state Directorate/Commissioner of Rural Development when the problem is a policy, statewide, or unresolved at district level."
      },
      {
        "id": "director-commissioner-rd",
        "title": "Director / Commissioner, Panchayati Raj & Rural Development (State Directorate)",
        "short": "Director / Commissioner RD",
        "level": "state",
        "jurisdiction": "Statewide directorate for rural development and panchayats",
        "handles": "Statewide implementation and monitoring of rural schemes, inter-district issues, disciplinary matters against district/block officers, and grievance appeals from the district.",
        "escalateWhen": "Escalate to the department Secretary for policy decisions, fund allocation across the state, or when the Directorate cannot resolve the matter."
      },
      {
        "id": "prl-secretary-rd-pr",
        "title": "Principal Secretary / Additional Chief Secretary, Rural Development & Panchayati Raj Department",
        "short": "Prl. Secretary RD&PR",
        "level": "state",
        "jurisdiction": "State department (top administrative head of rural development)",
        "handles": "State policy, budget and scheme design, final administrative appeals, and coordination with the Union Ministry of Rural Development / Panchayati Raj.",
        "escalateWhen": "Escalate to the Chief Secretary only for cross-department, whole-of-government matters; otherwise this is the department's ceiling."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "Nomenclature and routing vary by state. The village-level officer is variously called Gram Panchayat Secretary, Gram Sevak, Village Development Officer (VDO), or Panchayat/Gram Development Officer. At district level, some states run rural schemes primarily through the DRDA Project Director (rank of Additional Collector), and in several states the District Collector is designated ex-officio CEO of the DRDA; the Zilla Parishad CEO is administratively answerable to the state RD directorate rather than being a strict subordinate of the Collector, so the CEO-to-Collector step is an escalation to a higher district authority rather than a pure reporting line. The exact split between a separate 'Director' and 'Commissioner' at state level also differs by state.",
    "sources": [
      "https://rdd.maharashtra.gov.in/en/administrative-setup/",
      "https://en.wikipedia.org/wiki/District_council_(India)",
      "https://bangalorerural.nic.in/en/administrative-setup-zp/",
      "https://www.zpsatara.gov.in/en/about-department/introduction/"
    ]
  },
  "health": {
    "label": "Government health services",
    "icon": "shield",
    "rungs": [
      {
        "id": "mo",
        "title": "Medical Officer / Medical Officer In-charge (MO)",
        "short": "MO",
        "level": "station",
        "jurisdiction": "One Primary Health Centre (PHC) and its sub-centres / Health & Wellness Centres",
        "handles": "First point of contact: OPD care, referrals, staff/medicine availability and day-to-day complaints at the PHC.",
        "escalateWhen": "Escalate if the MO is absent/unresponsive, medicines or staff are chronically missing, or the issue needs a higher (CHC/block) facility."
      },
      {
        "id": "bmo",
        "title": "Block Medical Officer / Senior Medical Officer, CHC (BMO / SMO / Taluka Health Officer)",
        "short": "BMO",
        "level": "block",
        "jurisdiction": "One block/taluka - the Community Health Centre (CHC) plus all PHCs under it",
        "handles": "Complaints about a PHC's functioning, CHC services, block-level staff, and problems the local MO couldn't resolve.",
        "escalateWhen": "Escalate if the block office fails to act, the problem spans multiple blocks, or it concerns the district hospital / district-wide services."
      },
      {
        "id": "cmo-cmho",
        "title": "Chief Medical Officer / Chief Medical & Health Officer (CMO / CMHO / DMHO / Civil Surgeon)",
        "short": "CMO/CMHO",
        "level": "district",
        "jurisdiction": "The whole district - all PHCs, CHCs and public-health programmes (district hospital run by Civil Surgeon / Medical Superintendent)",
        "handles": "The main district health authority: serious service failures, staff misconduct, programme delivery, and appeals against block-level inaction.",
        "escalateWhen": "Escalate if the district health office does not resolve the matter or the issue is systemic across the district/region."
      },
      {
        "id": "dy-dhs-jd",
        "title": "Regional / Divisional Deputy Director or Joint Director of Health Services (Dy.DHS / JD)",
        "short": "Dy.DHS/JD",
        "level": "division",
        "jurisdiction": "A revenue division / cluster of districts (several states omit this tier)",
        "handles": "Supervisory review of multiple districts; escalation when a district CMO/CMHO is unresponsive or the problem crosses district lines.",
        "escalateWhen": "Escalate to the state directorate if the divisional office cannot resolve it or where no divisional tier exists."
      },
      {
        "id": "dhs",
        "title": "Director / Director General of Health Services (DHS / DG-HS)",
        "short": "DHS",
        "level": "state",
        "jurisdiction": "Entire state - technical/administrative head of the health services directorate (NHM issues via Mission Director, NHM)",
        "handles": "State-wide policy and programme failures, senior-officer accountability, and grievances unresolved at district/division level.",
        "escalateWhen": "Escalate to the department secretariat for policy decisions, funding, transfers/postings, or when the directorate itself fails to act."
      },
      {
        "id": "ps-acs-health",
        "title": "Principal Secretary / Additional Chief Secretary, Health & Family Welfare Department",
        "short": "PS/ACS Health",
        "level": "state",
        "jurisdiction": "State government's Health & Family Welfare Department - administrative apex over the directorate",
        "handles": "Highest state-level accountability: department policy, budgets, and grievances that the health directorate could not resolve.",
        "escalateWhen": "Beyond this, recourse is the Chief Secretary/Chief Minister's grievance cell, state Health Minister, or courts - outside the departmental chain."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "Titles and tiers vary by state. District head is variously CMO, CMHO, DMHO, District Health Officer, or Civil Surgeon (some states split the Civil Surgeon/hospital role from the CMHO/public-health role; others merge them). The regional/divisional tier (Deputy/Joint Director) exists in larger states like MP, Maharashtra, UP, Rajasthan but is absent in smaller states, where district rolls up directly to the state Directorate. The state technical head may be titled Director or Director General of Health Services, with NHM matters routed through the Mission Director, NHM.",
    "sources": [
      "https://nhsrcindia.org/sites/default/files/2021-06/Model%20Job%20Descriptions.pdf",
      "https://socio.health/social-groups-and-family-health/india-primary-health-care-system-structure/",
      "http://health.mp.gov.in/en/district-office-cmhocivil-surgeon",
      "https://meghealth.gov.in/dmho.html"
    ]
  },
  "education": {
    "label": "Government schools",
    "icon": "cap",
    "rungs": [
      {
        "id": "hm",
        "title": "Head Master / Head Mistress / Principal",
        "short": "HM",
        "level": "station",
        "jurisdiction": "One government school",
        "handles": "Day-to-day school issues: teacher absence, admissions, mid-day meal, textbooks, infrastructure, a child's marks or treatment.",
        "escalateWhen": "HM does not act, the problem is beyond the school (teacher shortage, sanctioned posts, funds), or the complaint is against the HM."
      },
      {
        "id": "crc-crp",
        "title": "Cluster Resource Centre Coordinator / Block Resource Person",
        "short": "CRC/CRP",
        "level": "block",
        "jurisdiction": "A cluster of 5-10 nearby schools within a block",
        "handles": "Academic supervision and first field escalation for a group of schools; teacher training, on-site support and monitoring. Advisory, not an administrative authority.",
        "escalateWhen": "Issue needs administrative power (transfers, funds, formal action) that a coordinator cannot exercise; most citizens skip straight to the BEO."
      },
      {
        "id": "beo",
        "title": "Block Education Officer (BEO)",
        "short": "BEO",
        "level": "block",
        "jurisdiction": "One block / taluka / mandal",
        "handles": "Complaints against a school or HM, teacher attendance and transfers within the block, scheme delivery (mid-day meal, uniforms, textbooks).",
        "escalateWhen": "BEO fails to resolve, the matter spans multiple blocks, or you need district-level authority over postings and inquiries."
      },
      {
        "id": "deo",
        "title": "District Education Officer (DEO)",
        "short": "DEO",
        "level": "district",
        "jurisdiction": "One district",
        "handles": "District-wide school supervision, teacher transfers and disciplinary action, enrolment/attendance monitoring, RTE and scheme grievances.",
        "escalateWhen": "DEO does not act, decision needs regional/directorate powers, or the complaint is against district-level officials."
      },
      {
        "id": "dde-jde",
        "title": "Deputy Director / Joint Director of Education (Divisional/Regional)",
        "short": "DDE/JDE",
        "level": "division",
        "jurisdiction": "A revenue division / region of several districts",
        "handles": "Regional oversight of multiple DEOs, appeals against district decisions, cross-district administrative matters (where the state has this tier).",
        "escalateWhen": "Regional office does not resolve it or the matter needs statewide policy or directorate-level intervention."
      },
      {
        "id": "dse",
        "title": "Director / Commissioner of School Education",
        "short": "DSE",
        "level": "state",
        "jurisdiction": "Entire state (directorate head)",
        "handles": "Statewide implementation of school education, senior transfers, policy grievances, escalated complaints not settled at district/division.",
        "escalateWhen": "Issue is a policy or funding decision, or the directorate itself has not acted - take it to the Secretariat."
      },
      {
        "id": "ps-secy",
        "title": "Principal Secretary / Secretary, School Education Department",
        "short": "PS/Secy",
        "level": "state",
        "jurisdiction": "State government department head",
        "handles": "Top administrative authority for school education policy, budgets and department-wide grievances in the state.",
        "escalateWhen": "Beyond this: the state Minister (elected, separate lever), Chief Secretary, or Union Dept. of School Education & Literacy for central schemes."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "The divisional/regional tier (Deputy/Joint Director) exists in larger states (e.g., Maharashtra's Deputy Director of Education, UP's Regional/Joint Director) but is absent in smaller states/UTs where the DEO reports straight to the Directorate. Titles vary by state: the district head may be DEO, DEEO, or CEO(Education); the state head is Director in some states and Commissioner of School Education in others. Elementary and secondary education are frequently split into separate directorates and officer cadres (e.g., DEO Primary vs DEO Secondary; BEO vs BEEO). CRC/BRC posts derive from SSA/Samagra Shiksha and are academic-support roles, so citizens typically start with the HM and escalate to the BEO.",
    "sources": [
      "https://teachers.institute/school-education/organisational-structure-school-management-india/",
      "https://teachers.institute/dimensions-of-educational-management/educational-administration-state-level-india/",
      "https://nroer.gov.in/home/file/readDoc/59835eb416b51cc4c4db27b9/educational-administration-structure-function-and-processes-at-the-district-and-sub-district-levels.pdf",
      "https://educationforallinindia.com/overview-of-cluster-resource-center/"
    ]
  },
  "electricity": {
    "label": "Electricity (DISCOM)",
    "icon": "sparkle",
    "rungs": [
      {
        "id": "je-complaint-centre",
        "title": "Junior Engineer / Lineman at the local Complaint / Fuse-Off Call Centre (JE)",
        "short": "JE / Complaint Centre",
        "level": "station",
        "jurisdiction": "One feeder / section / local area (a few streets or a colony)",
        "handles": "First point of contact via the toll-free number or local sub-station office for power outages, tripped feeders, fuse-off calls, faulty meters and on-the-spot bill queries.",
        "escalateWhen": "Escalate if the outage is not restored in the promised time, no crew is sent, or the complaint number yields no action within a day."
      },
      {
        "id": "ae",
        "title": "Assistant Engineer / Assistant Executive Engineer (AE / AEE)",
        "short": "AE",
        "level": "sub-division",
        "jurisdiction": "One sub-division (a cluster of feeders / a town ward or group of villages)",
        "handles": "Supervises the sub-division office; handles recurring outages, low voltage, meter replacement, new-connection delays and disputed bills the complaint centre could not fix.",
        "escalateWhen": "Escalate if the AE does not respond within the citizen-charter timeframe, disowns the issue, or the billing/technical fault persists across the sub-division."
      },
      {
        "id": "ee-gro",
        "title": "Executive Engineer / Divisional Engineer (EE / XEN) - often the designated Grievance Redressal Officer (GRO)",
        "short": "EE / GRO",
        "level": "division",
        "jurisdiction": "One division (several sub-divisions covering a town or taluka)",
        "handles": "Divisional head and usually the DISCOM's designated GRO; handles unresolved billing disputes, refund/adjustment demands, load and transformer issues, and formal written grievances against the sub-division.",
        "escalateWhen": "Escalate if the GRO/EE fails to decide within the notified period (often 15-45 days) or the decision is unsatisfactory - the next step is the statutory CGRF."
      },
      {
        "id": "se",
        "title": "Superintending Engineer (SE) - Circle head",
        "short": "SE",
        "level": "district",
        "jurisdiction": "One circle (several divisions - typically a district or two)",
        "handles": "Circle-level administrative head; takes up systemic problems (chronic circle-wide outages, mass wrong billing, delayed connections) and internal appeals against the Executive Engineer within the DISCOM chain.",
        "escalateWhen": "Escalate if the internal DISCOM chain is exhausted or unresponsive - file with the statutory Consumer Grievance Redressal Forum for a binding, time-bound order."
      },
      {
        "id": "cgrf",
        "title": "Consumer Grievance Redressal Forum (CGRF)",
        "short": "CGRF",
        "level": "utility",
        "jurisdiction": "The DISCOM licence area - statutory forum under Sec. 42(5), Electricity Act 2003",
        "handles": "Independent statutory forum a consumer approaches after the DISCOM's internal process fails; can set aside wrong bills, order refunds/adjustments, direct meter replacement and restoration - free of cost, decided in a fixed period (commonly ~15-45 days).",
        "escalateWhen": "Escalate if dissatisfied with the CGRF order or the DISCOM does not comply - represent to the Electricity Ombudsman."
      },
      {
        "id": "ombudsman",
        "title": "Electricity Ombudsman",
        "short": "Ombudsman",
        "level": "state",
        "jurisdiction": "State-level appellate authority appointed by the State Electricity Regulatory Commission (Sec. 42(6))",
        "handles": "Hears representations against a CGRF decision; issues binding directions to the DISCOM on billing disputes, wrongful disconnection, and unresolved service failures (usually within ~60 days).",
        "escalateWhen": "Escalate if the Ombudsman's finding is unsatisfactory or the matter is systemic/tariff/regulatory rather than an individual grievance - approach the State Regulatory Commission (policy) or a writ/consumer court (the individual order)."
      },
      {
        "id": "serc",
        "title": "State Electricity Regulatory Commission (SERC - e.g., MERC / DERC / UPERC / TNERC)",
        "short": "SERC",
        "level": "state",
        "jurisdiction": "The whole state - apex regulator of the electricity distribution sector",
        "handles": "The state regulator that sets tariffs, licence conditions and standards of performance, and appoints the Ombudsman/CGRFs; approach it for systemic tariff-category, standard-of-performance or policy grievances affecting many consumers (not as a routine appeal against an individual Ombudsman order).",
        "escalateWhen": "Beyond the SERC, remedies lie with the Appellate Tribunal for Electricity (APTEL) and the High Court/Supreme Court, and the State Power/Energy Department for administrative/policy matters - outside the routine consumer chain."
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "DISCOM engineering titles vary by state/utility: the section contact may be a Junior Engineer, Lineman or Assistant Engineer; the divisional head may be XEN/Executive/Divisional Engineer and the circle head SE/Superintending Engineer. Private DISCOMs (BSES/Tata Power in Delhi, Adani in Mumbai) use corporate titles (Zonal/Cluster/Circle Manager) instead of the government engineer cadre, but the statutory CGRF → Ombudsman → SERC ladder under the Electricity Act 2003 is uniform nationwide. CGRF timelines and the number of CGRFs per licence area differ by state regulation.</variesNote>\n<parameter name=\"sources\">[\"Electricity Act 2003, Section 42(5)-(7) (CGRF, Ombudsman)\",\"https://complainthub.org/cgrf-form-for-grievances/\",\"https://mperc.in/page/about-electricity-ombudsman-2\",\"https://www.derc.gov.in/sites/default/files/derc-cgrf-regulations.pdf\",\"https://forumofregulators.gov.in/Data/Reports/FoR%20Consumer%20Protection%20Study%20Report.pdf\",\"https://bhattandjoshiassociates.com/electricity-act2003-critical-analysis/\"]",
    "sources": []
  },
  "pds": {
    "label": "Ration / PDS",
    "icon": "wallet",
    "rungs": [
      {
        "id": "fps-dealer",
        "title": "Fair Price Shop Dealer / Ration Dealer (FPS Dealer)",
        "short": "FPS Dealer",
        "level": "station",
        "jurisdiction": "One ration shop / its cardholder area",
        "handles": "Actually collecting your monthly ration; card entry, quantity, price, and shop timings issues",
        "escalateWhen": "Escalate if the dealer denies entitlement, overcharges, gives short weight, keeps the shop shut, or refuses to fix your card"
      },
      {
        "id": "supply-inspector",
        "title": "Inspector of Supplies / Rationing Inspector / FPS Inspector",
        "short": "Supply Inspector",
        "level": "block",
        "jurisdiction": "A circle of several fair price shops",
        "handles": "Field-level complaints against a dealer, stock verification, ration card corrections and new-card fieldwork",
        "escalateWhen": "Escalate if the inspector does not inspect/act, is complicit with the dealer, or the issue needs authority to suspend the shop"
      },
      {
        "id": "tso",
        "title": "Taluk / Tehsil Supply Officer (TSO) - a.k.a. Assistant Supply Officer",
        "short": "TSO",
        "level": "tehsil",
        "jurisdiction": "One taluk / tehsil / block",
        "handles": "Card issuance and transfer, FPS licensing at taluk level, and complaints the inspector could not resolve",
        "escalateWhen": "Escalate if the taluk office sits on your file, the FPS licence issue is unresolved, or you need district-level enforcement"
      },
      {
        "id": "dso",
        "title": "District Supply Officer / District Food & Supplies Controller / District Supply & Consumer Protection Officer (DSO)",
        "short": "DSO",
        "level": "district",
        "jurisdiction": "The whole district's PDS network",
        "handles": "District-wide ration allocation and shop licensing, action against dealers, and appeals against taluk decisions",
        "escalateWhen": "Escalate if the DSO fails to act on a serious/systemic complaint, or you want the district head or the statutory grievance officer to intervene"
      },
      {
        "id": "dm-collector-dgro",
        "title": "District Magistrate / District Collector / Deputy Commissioner (DM) - also the District Grievance Redressal Officer (DGRO) under NFSA",
        "short": "DM / Collector / DGRO",
        "level": "district",
        "jurisdiction": "The entire district",
        "handles": "Final district authority on PDS; the DGRO is the statutory first appeal for denied NFSA entitlements",
        "escalateWhen": "Escalate if the district administration does not redress a denied entitlement, or the DGRO's order does not satisfy you"
      },
      {
        "id": "commissioner-director",
        "title": "Commissioner / Director of Food & Civil Supplies (State Directorate)",
        "short": "Commissioner/Director",
        "level": "state",
        "jurisdiction": "State-wide PDS administration",
        "handles": "State-level policy, allocation and monitoring; complaints that districts failed to resolve",
        "escalateWhen": "Escalate for policy-level failures, inter-district issues, or when directorate action is inadequate"
      },
      {
        "id": "secretary-state-food-commission",
        "title": "Principal Secretary / Secretary, Food, Civil Supplies & Consumer Affairs Department (State) - with the State Food Commission as the NFSA appellate body",
        "short": "Secretary / State Food Commission",
        "level": "state",
        "jurisdiction": "State government department head; State Food Commission hears NFSA appeals",
        "handles": "Apex state accountability for PDS; the State Food Commission is the statutory second-appeal forum above the DGRO",
        "escalateWhen": "Escalate beyond this via the State Food Commission, CPGRAMS, or the courts if the department does not act"
      }
    ],
    "citizenStartIndex": 0,
    "variesNote": "State nomenclature varies significantly (see field).",
    "sources": [
      "https://nfsa.gov.in/public/frmRegisterPublicGrievance.aspx",
      "https://www.apnilaw.com/legal-articles/what-is-a-case-under-the-national-food-security-act/",
      "https://dfpd.gov.in/public-grievance/en",
      "https://pudukkottai.nic.in/district-supply-consumer-protection-office/"
    ]
  }
};

/** Which chain applies to a problem, split by urban vs rural area. */
export const PROBLEM_CHAIN: Record<ProblemType, { urban: ChainKey; rural: ChainKey }> = {
  "roads": {
    "urban": "urban_civic",
    "rural": "pwd"
  },
  "water": {
    "urban": "urban_civic",
    "rural": "water_phed"
  },
  "sanitation": {
    "urban": "urban_civic",
    "rural": "rural_panchayat"
  },
  "sewerage": {
    "urban": "urban_civic",
    "rural": "water_phed"
  },
  "streetlights": {
    "urban": "urban_civic",
    "rural": "rural_panchayat"
  },
  "police": {
    "urban": "police",
    "rural": "police"
  },
  "health": {
    "urban": "health",
    "rural": "health"
  },
  "school": {
    "urban": "education",
    "rural": "education"
  },
  "certificates": {
    "urban": "revenue",
    "rural": "revenue"
  },
  "land": {
    "urban": "revenue",
    "rural": "revenue"
  },
  "birth_death": {
    "urban": "urban_civic",
    "rural": "rural_panchayat"
  },
  "electricity": {
    "urban": "electricity",
    "rural": "electricity"
  },
  "ration": {
    "urban": "pds",
    "rural": "pds"
  },
  "property_tax": {
    "urban": "urban_civic",
    "rural": "rural_panchayat"
  }
};

/** An existing appointed-office type -> its rung in a chain (to highlight it). */
export const OFFICE_CHAIN_POSITION: Partial<Record<OfficeType, { chain: ChainKey; rungId: string }>> = {
  "sp_district": {
    "chain": "police",
    "rungId": "sp-ssp"
  },
  "dgp": {
    "chain": "police",
    "rungId": "dgp"
  },
  "collector_dm": {
    "chain": "revenue",
    "rungId": "dc-dm-collector"
  },
  "tehsildar_sdm": {
    "chain": "revenue",
    "rungId": "tehsildar"
  },
  "chief_secretary": {
    "chain": "revenue",
    "rungId": "board-of-revenue-pr-secy-revenue"
  },
  "mun_commissioner": {
    "chain": "urban_civic",
    "rungId": "mc"
  },
  "ward_officer": {
    "chain": "urban_civic",
    "rungId": "ae-wo"
  },
  "ee_pwd": {
    "chain": "pwd",
    "rungId": "ee"
  },
  "ee_phed": {
    "chain": "water_phed",
    "rungId": "ee"
  },
  "cdo_ceozp": {
    "chain": "rural_panchayat",
    "rungId": "ceo-zp"
  },
  "bdo": {
    "chain": "rural_panchayat",
    "rungId": "bdo"
  },
  "panchayat_secretary": {
    "chain": "rural_panchayat",
    "rungId": "gp-secretary-vdo"
  },
  "cmo_health": {
    "chain": "health",
    "rungId": "cmo-cmho"
  },
  "deo_education": {
    "chain": "education",
    "rungId": "deo"
  },
  "discom": {
    "chain": "electricity",
    "rungId": "ee-gro"
  },
  "dso_pds": {
    "chain": "pds",
    "rungId": "dso"
  }
};
