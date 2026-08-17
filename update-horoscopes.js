// Fetches the monthly horoscope text for all 12 zodiac signs from
// freehoroscopeapi.com, translates it to Czech via a local LibreTranslate
// instance (see setup note at bottom of this file), and writes the result
// to horoscopes.json (same folder as this script — repo root). Run by
// .github/workflows/update-horoscopes.yml three times a day.
// Requires Node 18+ (uses the built-in fetch).

const fs = require('fs');
const path = require('path');

const SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

const OUT_PATH = path.join(__dirname, 'horoscopes.json');
// LibreTranslate container started by the workflow step, listening locally.
const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000/translate';

async function fetchSign(sign) {
  const url = 'https://freehoroscopeapi.com/api/v1/get-horoscope/monthly?sign=' + sign;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(sign + ': HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.data && data.data.horoscope;
  if (!text) throw new Error(sign + ': no horoscope text in response');
  return text;
}

async function waitForLibreTranslate(maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(LIBRETRANSLATE_URL.replace('/translate', '/languages'));
      if (res.ok) return;
    } catch (err) {
      // container not ready yet — keep polling
    }
    await new Promise(function (resolve) { setTimeout(resolve, 2000); });
  }
  throw new Error('LibreTranslate did not become ready within ' + maxWaitMs + 'ms');
}

async function translateToCzech(text) {
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: 'cs',
      format: 'text'
    })
  });
  if (!res.ok) throw new Error('LibreTranslate HTTP ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  if (!data || !data.translatedText) throw new Error('LibreTranslate: no translation in response');
  return data.translatedText;
}

async function main() {
  const fresh = {};       // sign -> original English text (this run)
  const freshCz = {};     // sign -> Czech translation (this run)
  const failed = [];      // fetch failures
  const translateFailed = []; // translation failures (English text still fetched OK)

  try {
    await waitForLibreTranslate(120000);
    console.log('OK   LibreTranslate ready');
  } catch (err) {
    // No point trying per-sign translation if the container never came up —
    // English texts are still fetched below and kept as-is via signsEn/fallback.
    console.error('FAIL LibreTranslate not ready — ' + err.message);
  }

  for (const sign of SIGNS) {
    try {
      fresh[sign] = await fetchSign(sign);
      console.log('OK   fetch ' + sign);
    } catch (err) {
      console.error('FAIL fetch ' + sign + ' — ' + err.message);
      failed.push(sign);
      continue;
    }

    try {
      freshCz[sign] = await translateToCzech(fresh[sign]);
      console.log('OK   translate ' + sign);
    } catch (err) {
      console.error('FAIL translate ' + sign + ' — ' + err.message);
      translateFailed.push(sign);
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

  // Signs that failed this run (fetch or translate) keep whatever value they
  // had before, so a temporary API hiccup doesn't wipe out a working month.
  const mergedSigns = Object.assign({}, existing.signs || {}, freshCz);
  const mergedSignsEn = Object.assign({}, existing.signsEn || {}, fresh);

  const output = {
    generatedAt: new Date().toISOString(),
    month: new Date().toISOString().slice(0, 7), // YYYY-MM
    signs: mergedSigns,      // Czech (what the page displays)
    signsEn: mergedSignsEn   // English originals (kept as a fallback/reference)
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(
    'Wrote ' + OUT_PATH +
    ' — translated: ' + Object.keys(freshCz).length +
    ', fetch failed: ' + (failed.length ? failed.join(', ') : 'none') +
    ', translate failed: ' + (translateFailed.length ? translateFailed.join(', ') : 'none')
  );

  if (failed.length === SIGNS.length) {
    // Every sign failed to fetch this run — flag the run as failed (existing
    // data on disk is left untouched above, so the site keeps serving last-good data).
    process.exitCode = 1;
  }
}

main();

// ---------------------------------------------------------------------
// Setup note: no account, no API key, no limit — LibreTranslate runs as a
// throwaway Docker container inside the GitHub Actions job itself, so
// nothing needs to be provisioned. Add a step BEFORE "Update horoscopes"
// in .github/workflows/update-horoscopes.yml:
//
//   - name: Start LibreTranslate
//     run: |
//       docker run -d -p 5000:5000 --name libretranslate \
//         libretranslate/libretranslate --load-only en,cs
//
//   - name: Update horoscopes
//     run: node scripts/update-horoscopes.js
//
// The --load-only en,cs flag keeps the image from downloading all ~30
// language models (much faster startup, less disk). The script itself
// polls http://localhost:5000/languages for up to 120s until the container
// is ready, so no extra "sleep" step is needed.
// ---------------------------------------------------------------------
