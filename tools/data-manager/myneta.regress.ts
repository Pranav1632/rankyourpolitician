/**
 * Regression suite for the join rules in myneta.ts - the code that decides whose
 * sworn affidavit gets published under whose name. Every MUST-NOT case below is
 * a real pair that a previous version of these rules fused, publishing one
 * person's declaration under another's. Run it after touching nameMatches,
 * translitKey, consKey or seatClose.
 *
 * Usage:  npx tsx tools/data-manager/myneta.regress.ts
 */
import { nameMatches, consKey, seatClose, money } from './myneta';

const NAME_SAME: [string, string][] = [
  ['Mandali Buddha Prasad', 'Buddhaprasad Mandali'],
  ['Nimmakayala Chinarajappa', 'China Rajappa Nimmakayala'],
  ['Aduram Meghwal', 'ADU RAM MEGHWAL'],
  ['Suresh Mhatre', 'Suresh Gopinath Mhatre Alias Balya Mama'],
  ['R. Sachidanandam', 'Sachithanantham R'],
  ['Bhupendra Bhayani', 'Bhupendrabhai Gandubhai Bhayani'],
  ['Daggubati Purandeswari', 'Daggubati Purandheshwari'],
  ['E. T. Muhammed Basheer', 'E.T. Mohammed Basheer'],
  ['Shivraj Singh Chauhan', 'Shivraj Singh Chouhan'],
  ['Bapi Halder', 'Bapi Haldar'],
  ['Ravi Kishan', 'Ravindra Shukla Alias Ravi Kishan'],
  ['Kirti Azad', 'Azad Kirti Jha'],
  ['Yusuf Pathan', 'Pathan Yusuf'],
  ['Akshay Patel', 'Akshaykumar Ishvarbhai Patel'],
  ['Dinesh Thakor', 'Thakor Dineshbhai Ataji'],
  ['Karshan Solanki', 'Karsanbhai Punjabhai Solanki'],
  ['Harsh Sanghavi', 'HARSH RAMESH SANGHVI'],
  ['Rajbir Singh Fartiya', 'RAJBIR FARTIA'],
  ['Damodar Raja Narasimha', 'C. Damodar Rajanarsimha'],
];

// Each of these fused two DIFFERENT sitting members at some point.
const NAME_DIFFERENT: [string, string][] = [
  ['Vanlalthlana', 'Vanlalhlana'],            // adjacent Mizoram seats - the compact-edit rule fused them
  ['Damodar Raja Narasimha', 'Ram Rao Pawar'], // fuzzy token pairing at 2-of-3
  ['Ajay Dangi', 'Ajay Kumar'],
  ['Ajit Singh', 'Ajit Kumar'],
  ['Bablu Mandal', 'Bablu Kumar'],
  ['K. E. Shyam Babu', 'K.E. Shyam Kumar'],
  ['Anil Kumar', 'Sunil Kumar'],
  ['Amit Shah', 'Ajit Shah'],
  ['Sunita Devi', 'Sarita Devi'],
  ['Ramesh Yadav', 'Suresh Yadav'],
  ['Vijay Kumar Singh', 'Ajay Kumar Singh'],
  ['Ram Singh', 'Shyam Singh'],
  ['Rajesh Verma', 'Rajesh Gupta'],
  ['P. Karthikeyan', 'V. Karthikeyan'],        // two Puducherry MLAs, different seats
  ['K. Ramkumar', 'V. K. Ramkumar'],           // two Tamil Nadu MLAs, different seats
];

const SEAT_SAME: [string, string][] = [
  ['AIZAWL NORTH-II (ST)', 'Aizawl North 2'],  // roman vs arabic must key-match
  ['MANDSOUR', 'Mandsaur'],
  ['ARAMBAG (SC)', 'Arambagh'],
  ['NARSAPURAM', 'Narasapuram'],
  ['BURDWAN - DURGAPUR', 'Bardhaman-Durgapur'],
];
const SEAT_DIFFERENT: [string, string][] = [
  ['AIZAWL NORTH-I (ST)', 'Aizawl North 2'],   // one char apart, different seats
  ['AIZAWL NORTH-III (ST)', 'Aizawl North 2'],
  ['MUDHOLE', 'Andole'],                       // 3 edits - fused before
  ['SAKRA (SC)', 'Parbatta'],
  ['GADAG', 'Sedam'],
];

let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.log('  ✗ ' + msg); } };

console.log('nameMatches - MUST match (same person):');
for (const [a, b] of NAME_SAME) check(nameMatches(a, b), `"${a}" should match "${b}"`);
console.log('nameMatches - MUST NOT match (different people):');
for (const [a, b] of NAME_DIFFERENT) check(!nameMatches(a, b), `"${a}" must NOT match "${b}"`);
console.log('seat keys - MUST be the same seat:');
for (const [a, b] of SEAT_SAME) check(seatClose(consKey(a), consKey(b)), `"${a}" should be "${b}" (${consKey(a)} vs ${consKey(b)})`);
console.log('seat keys - MUST be different seats:');
for (const [a, b] of SEAT_DIFFERENT) check(!seatClose(consKey(a), consKey(b)), `"${a}" must NOT be "${b}" (${consKey(a)} vs ${consKey(b)})`);
console.log('money - anchored:');
check(money('Others 72') === null, 'money("Others 72") must be null, got ' + money('Others 72'));
check(money('Rs 68,27,489 68 Lacs+') === '₹68,27,489 (~68 Lacs)', 'grand-total cell');
check(money('Rs 15,05,37,706 ~15 Crore+') === '₹15,05,37,706 (~15 Crore)', 'header cell');
check(money('Nil') === '₹0', 'Nil -> ₹0');

const total = NAME_SAME.length + NAME_DIFFERENT.length + SEAT_SAME.length + SEAT_DIFFERENT.length + 4;
console.log(fails ? `\n✗ ${fails} of ${total} rules FAILED` : `\n✓ all ${total} join rules behave`);
process.exit(fails ? 1 : 0);
