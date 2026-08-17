// Fetches the monthly horoscope text for all 12 zodiac signs from
// freehoroscopeapi.com and writes the result to horoscopes.json at the
// repo root. Run by .github/workflows/update-horoscopes.yml three times
// a day. Requires Node 18+ (uses the built-in fetch).

const fs = require('fs');
const path = require('path');

const SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const OUT_PATH = path.join(__dirname, '..', 'horoscopes.json');

async function fetchSign(sign) {
  const url = 'https://freehoroscopeapi.com/api/v1/get-horoscope/monthly?sign=' + sign;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(sign + ': HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.data && data.data.horoscope;
  if (!text) throw new Error(sign + ': no horoscope text in response');
  return text;
}

async function main() {
  const fresh = {};
  const failed = [];

  for (const sign of SIGNS) {
    try {
      fresh[sign] = await fetchSign(sign);
      console.log('OK   ' + sign);
    } catch (err) {
      console.error('FAIL ' + sign + ' — ' + err.message);
      failed.push(sign);
    }
  }

  let existing = {};
  if (fs.existsSync(OUT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    } catch (err) {
      console.warn('Could not parse existing horoscopes.json, starting fresh:', err.message);
    }
  }

  // Signs that failed this run keep whatever value they had before, so a
  // temporary API hiccup for one sign doesn't wipe out a working month for it.
  const mergedSigns = Object.assign({}, existing.signs || {}, fresh);

  const output = {
    generatedAt: new Date().toISOString(),
    month: new Date().toISOString().slice(0, 7), // YYYY-MM
    signs: mergedSigns
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(
    'Wrote ' + OUT_PATH + ' — updated: ' + Object.keys(fresh).length +
    ', failed: ' + (failed.length ? failed.join(', ') : 'none')
  );

  if (failed.length === SIGNS.length) {
    // Every sign failed this run — flag the run as failed (existing data on
    // disk is left untouched above, so the site keeps serving last-good data).
    process.exitCode = 1;
  }
}

main();
