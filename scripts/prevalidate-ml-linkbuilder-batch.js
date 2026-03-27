#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function abs(p, fallback) {
  return p ? path.resolve(p) : path.resolve(fallback);
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map((l) => String(l || '').trim());
}

function isShortMlLink(raw) {
  return /^https:\/\/meli\.la\/[A-Za-z0-9]+$/i.test(String(raw || '').trim());
}

function isProductUrl(raw) {
  return /^https:\/\/www\.mercadolivre\.com\.br\//i.test(String(raw || '').trim());
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function readMapBody(filePath) {
  return readLines(filePath)
    .filter((l) => l && !l.startsWith('#'))
    .map((row) => {
      const [product, short] = row.split('|').map((v) => String(v || '').trim());
      return { product, short, row };
    })
    .filter((r) => r.product && r.short);
}

function writeLines(filePath, lines) {
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function main() {
  const inputFile = abs(argValue('--input'), 'data/ml-linkbuilder-input-30f.txt');
  const outputFile = abs(argValue('--output'), 'data/ml-linkbuilder-output-30f.txt');
  const pairsFile = abs(argValue('--pairs'), outputFile.replace(/\.txt$/i, '-pairs.txt'));
  const reportFile = abs(argValue('--report'), outputFile.replace(/\.txt$/i, '-prevalidate.json'));
  const poolFile = abs(argValue('--pool'), 'mercadolivre-linkbuilder-links.txt');
  const mapFile = abs(argValue('--map'), 'mercadolivre-linkbuilder-map.txt');
  const applyMerge = hasFlag('--apply');

  const inputUrls = readLines(inputFile).filter((l) => l && !l.startsWith('#') && isProductUrl(l));
  const outputRaw = readLines(outputFile).filter((l) => l && !l.startsWith('#'));
  const shortLinks = outputRaw.filter(isShortMlLink);
  const warnings = outputRaw.filter((l) => !isShortMlLink(l));

  const mapRows = readMapBody(mapFile);
  const mapProducts = new Set(mapRows.map((r) => r.product));
  const mapShorts = new Set(mapRows.map((r) => r.short));
  const poolLinks = readLines(poolFile).filter((l) => l && !l.startsWith('#') && isShortMlLink(l));
  const poolSet = new Set(poolLinks);

  const uniqueShort = uniq(shortLinks);
  const duplicatedShort = uniqueShort.length !== shortLinks.length;
  const countMismatch = shortLinks.length !== inputUrls.length;

  const pairs = [];
  let blockedByMapProduct = 0;
  let blockedByMapShort = 0;
  let blockedByPoolShort = 0;

  if (!countMismatch && !duplicatedShort) {
    for (let i = 0; i < inputUrls.length; i++) {
      const product = inputUrls[i];
      const short = shortLinks[i];

      if (mapProducts.has(product)) {
        blockedByMapProduct += 1;
        continue;
      }

      if (mapShorts.has(short)) {
        blockedByMapShort += 1;
        continue;
      }

      if (poolSet.has(short)) {
        blockedByPoolShort += 1;
        continue;
      }

      pairs.push(`${product}|${short}`);
    }
  }

  const integrityApproved = !countMismatch && !duplicatedShort && inputUrls.length > 0 && shortLinks.length > 0;
  const mergeReady = integrityApproved && pairs.length > 0;
  const approved = integrityApproved;
  const report = {
    generatedAt: new Date().toISOString(),
    inputFile,
    outputFile,
    poolFile,
    mapFile,
    applyMerge,
    approved,
    mergeReady,
    checks: {
      inputCount: inputUrls.length,
      outputRawCount: outputRaw.length,
      shortLinksCount: shortLinks.length,
      warningsCount: warnings.length,
      countMismatch,
      duplicatedShort,
      blockedByMapProduct,
      blockedByMapShort,
      blockedByPoolShort,
      pairsReady: pairs.length
    },
    warnings: warnings.slice(0, 50),
    sampleShortLinks: shortLinks.slice(0, 10)
  };

  writeLines(pairsFile, pairs);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  if (mergeReady && applyMerge) {
    const mapHeader = readLines(mapFile).filter((l) => l.startsWith('#'));
    const mapBody = readLines(mapFile).filter((l) => l && !l.startsWith('#'));
    const nextMap = [...mapHeader, ...mapBody, ...pairs];
    writeLines(mapFile, nextMap);

    const nextPool = uniq([...poolLinks, ...shortLinks]);
    writeLines(poolFile, nextPool);
  }

  console.log(`PREVALIDATE_APPROVED=${approved ? '1' : '0'}`);
  console.log(`MERGE_READY=${mergeReady ? '1' : '0'}`);
  console.log(`INPUT_COUNT=${inputUrls.length}`);
  console.log(`SHORT_COUNT=${shortLinks.length}`);
  console.log(`PAIRS_READY=${pairs.length}`);
  console.log(`COUNT_MISMATCH=${countMismatch ? '1' : '0'}`);
  console.log(`DUP_SHORT=${duplicatedShort ? '1' : '0'}`);
  console.log(`REPORT_FILE=${reportFile}`);
  console.log(`PAIRS_FILE=${pairsFile}`);

  if (!approved) {
    process.exit(2);
  }

  if (applyMerge && !mergeReady) {
    console.log('MERGE_SKIPPED=1');
    process.exit(2);
  }
}

main();
