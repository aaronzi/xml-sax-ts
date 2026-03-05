import { readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { XmlSaxParser, parseXmlString } from "../dist/index.js";

const rounds = Number.parseInt(process.env.BENCH_ROUNDS ?? "5", 10);
const minDurationMs = Number.parseInt(process.env.BENCH_MIN_MS ?? "1200", 10);
const warmupRuns = Number.parseInt(process.env.BENCH_WARMUP ?? "10", 10);

function loadFixture(name) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
}

function formatNumber(value, digits = 2) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatGiB(bytes) {
  return `${formatNumber(bytes / (1024 ** 3), 1)} GiB`;
}

function nowNs() {
  return process.hrtime.bigint();
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / values.length;
  const median =
    values.length % 2 === 0
      ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
      : sorted[(values.length - 1) / 2];
  const variance = values.reduce((acc, value) => acc + (value - mean) * (value - mean), 0) / values.length;

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    stddev: Math.sqrt(variance)
  };
}

function runTimed(fn) {
  for (let i = 0; i < warmupRuns; i += 1) {
    fn();
  }

  const start = nowNs();
  const endLimit = start + BigInt(minDurationMs) * 1000000n;
  let iterations = 0;
  let checksum = 0;

  while (nowNs() < endLimit) {
    checksum += fn();
    iterations += 1;
  }

  const end = nowNs();
  const durationMs = Number(end - start) / 1e6;
  const opsPerSec = iterations / (durationMs / 1000);

  return { opsPerSec, iterations, durationMs, checksum };
}

function runScenario(name, fn) {
  const roundsData = [];
  for (let i = 0; i < rounds; i += 1) {
    roundsData.push(runTimed(fn));
  }

  const opRates = roundsData.map((roundData) => roundData.opsPerSec);
  const distribution = stats(opRates);
  const last = roundsData[roundsData.length - 1];

  return {
    name,
    rounds: roundsData,
    distribution,
    checksum: last ? last.checksum : 0,
    sampleIterations: last ? last.iterations : 0
  };
}

function runScenarioGroup(scenarios) {
  return scenarios.map((scenario) => ({
    ...runScenario(scenario.name, scenario.fn),
    group: scenario.group,
    model: scenario.model
  }));
}

function walkValue(value) {
  if (value === null || value === undefined) {
    return 1;
  }

  if (typeof value === "string") {
    return value.length;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return 1;
  }

  if (Array.isArray(value)) {
    let total = 1;
    for (const item of value) {
      total += walkValue(item);
    }
    return total;
  }

  if (typeof value === "object") {
    let total = 1;
    for (const key of Object.keys(value)) {
      total += key.length;
      total += walkValue(value[key]);
    }
    return total;
  }

  return 1;
}

function repeatDocuments(documents, repeat) {
  const result = [];
  for (let i = 0; i < repeat; i += 1) {
    for (const document of documents) {
      result.push(document);
    }
  }
  return result;
}

function totalChars(documents) {
  return documents.reduce((acc, document) => acc + document.length, 0);
}

function runSax(xml, options = {}) {
  let textLen = 0;
  let openCount = 0;
  let closeCount = 0;

  const parser = new XmlSaxParser({
    xmlns: options.xmlns ?? true,
    coalesceText: options.coalesceText ?? false,
    trackPosition: options.trackPosition ?? true,
    onOpenTag: () => {
      openCount += 1;
    },
    onCloseTag: () => {
      closeCount += 1;
    },
    onText: (text) => {
      textLen += text.length;
    }
  });

  const chunkSize = options.chunkSize ?? 0;
  if (chunkSize > 0) {
    for (let i = 0; i < xml.length; i += chunkSize) {
      parser.feed(xml.slice(i, i + chunkSize));
    }
  } else {
    parser.feed(xml);
  }

  parser.close();
  return openCount + closeCount + textLen;
}

function runSaxDocuments(documents, options = {}) {
  let total = 0;
  for (const xml of documents) {
    total += runSax(xml, options);
  }
  return total;
}

function runTree(xml) {
  const root = parseXmlString(xml, { includeNamespaceAttributes: true });
  return walkValue(root);
}

function runTreeDocuments(documents) {
  let total = 0;
  for (const xml of documents) {
    total += runTree(xml);
  }
  return total;
}

function runExternalParserDocuments(runner, documents) {
  let total = 0;
  for (const xml of documents) {
    total += runner.run(xml);
  }
  return total;
}

async function createFastXmlParserRunner() {
  try {
    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true,
      parseAttributeValue: true,
      trimValues: false,
      processEntities: true,
      preserveOrder: false
    });

    return {
      available: true,
      run(xml) {
        const value = parser.parse(xml);
        return walkValue(value);
      }
    };
  } catch {
    return {
      available: false,
      run() {
        return 0;
      }
    };
  }
}

async function createSaxRunner(xmlns) {
  try {
    const mod = await import("sax");
    const sax = mod.default ?? mod;

    return {
      available: true,
      run(xml) {
        let textLen = 0;
        let openCount = 0;
        let closeCount = 0;

        const parser = sax.parser(true, {
          xmlns,
          trim: false,
          normalize: false
        });
        parser.onopentag = () => {
          openCount += 1;
        };
        parser.onclosetag = () => {
          closeCount += 1;
        };
        parser.ontext = (text) => {
          textLen += text.length;
        };

        parser.write(xml).close();
        return openCount + closeCount + textLen;
      }
    };
  } catch {
    return {
      available: false,
      run() {
        return 0;
      }
    };
  }
}

async function createSaxesRunner(xmlns) {
  try {
    const { SaxesParser } = await import("saxes");

    return {
      available: true,
      run(xml) {
        let textLen = 0;
        let openCount = 0;
        let closeCount = 0;

        const parser = new SaxesParser({ xmlns });
        parser.on("opentag", () => {
          openCount += 1;
        });
        parser.on("closetag", () => {
          closeCount += 1;
        });
        parser.on("text", (text) => {
          textLen += text.length;
        });

        parser.write(xml);
        parser.close();
        return openCount + closeCount + textLen;
      }
    };
  } catch {
    return {
      available: false,
      run() {
        return 0;
      }
    };
  }
}

function printTable(results, baselineMedian, title) {
  console.log(`\n${title}`);
  console.log("| Scenario | Median ops/s | Mean ops/s | StdDev | Relative |");
  console.log("| --- | ---: | ---: | ---: | ---: |");

  for (const result of results) {
    const relative = baselineMedian > 0 ? result.distribution.median / baselineMedian : 0;
    console.log(
      `| ${result.name} | ${formatNumber(result.distribution.median)} | ${formatNumber(result.distribution.mean)} | ${formatNumber(result.distribution.stddev)} | ${formatNumber(relative, 3)}x |`
    );
  }
}

function printMachineInfo() {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? "unknown";
  console.log("Machine", `${os.platform()} ${os.release()} | ${os.arch()}`);
  console.log("CPU", `${cpuModel} | logical cores=${cpus.length}`);
  console.log("RAM", formatGiB(os.totalmem()));
}

async function main() {
  const basic = loadFixture("basic.xml");
  const mixed = loadFixture("mixed.xml");
  const namespaces = loadFixture("namespaces.xml");

  // Keep shared corpus doctype-free and parse each fixture as a standalone valid XML document.
  const comparableDocuments = repeatDocuments([basic, mixed, namespaces], 25);
  const entityHeavy = `<root>${"&amp;A&#x41;&#65;".repeat(7000)}</root>`;

  const fastXml = await createFastXmlParserRunner();
  const saxFalse = await createSaxRunner(false);
  const saxTrue = await createSaxRunner(true);
  const saxesFalse = await createSaxesRunner(false);
  const saxesTrue = await createSaxesRunner(true);

  const scenarios = [
    {
      name: "xml-sax-ts:sax single-feed xmlns=true",
      group: "sax",
      model: "sax",
      fn: () => runSaxDocuments(comparableDocuments, { xmlns: true })
    },
    {
      name: "xml-sax-ts:sax single-feed xmlns=false",
      group: "sax",
      model: "sax",
      fn: () => runSaxDocuments(comparableDocuments, { xmlns: false })
    },
    {
      name: "xml-sax-ts:sax single-feed xmlns=false no-position",
      group: "sax",
      model: "sax",
      fn: () => runSaxDocuments(comparableDocuments, { xmlns: false, trackPosition: false })
    },
    {
      name: "xml-sax-ts:sax chunked-16",
      group: "sax",
      model: "sax",
      fn: () => runSaxDocuments(comparableDocuments, { chunkSize: 16 })
    },
    {
      name: "xml-sax-ts:sax chunked-16 coalesce",
      group: "sax",
      model: "sax",
      fn: () => runSaxDocuments(comparableDocuments, { chunkSize: 16, coalesceText: true })
    },
    {
      name: "xml-sax-ts:tree parseXmlString",
      group: "object",
      model: "tree",
      fn: () => runTreeDocuments(comparableDocuments)
    },
    {
      name: "xml-sax-ts:sax entity-heavy",
      group: "sax",
      model: "sax",
      fn: () => runSax(entityHeavy)
    }
  ];

  if (saxFalse.available) {
    scenarios.push({
      name: "sax:single-feed xmlns=false",
      group: "sax",
      model: "sax",
      fn: () => runExternalParserDocuments(saxFalse, comparableDocuments)
    });
  }

  if (saxTrue.available) {
    scenarios.push({
      name: "sax:single-feed xmlns=true",
      group: "sax",
      model: "sax",
      fn: () => runExternalParserDocuments(saxTrue, comparableDocuments)
    });
  }

  if (saxesFalse.available) {
    scenarios.push({
      name: "saxes:single-feed xmlns=false",
      group: "sax",
      model: "sax",
      fn: () => runExternalParserDocuments(saxesFalse, comparableDocuments)
    });
  }

  if (saxesTrue.available) {
    scenarios.push({
      name: "saxes:single-feed xmlns=true",
      group: "sax",
      model: "sax",
      fn: () => runExternalParserDocuments(saxesTrue, comparableDocuments)
    });
  }

  if (fastXml.available) {
    scenarios.push(
      {
        name: "fast-xml-parser:object parse",
        group: "object",
        model: "object",
        fn: () => runExternalParserDocuments(fastXml, comparableDocuments)
      },
      {
        name: "fast-xml-parser:object entity-heavy",
        group: "object",
        model: "object",
        fn: () => fastXml.run(entityHeavy)
      }
    );
  }

  console.log("xml benchmark");
  console.log("Node", process.version);
  printMachineInfo();
  console.log("Rounds", rounds, "| minDurationMs", minDurationMs, "| warmup", warmupRuns);
  console.log(
    "Corpus",
    `comparable=${comparableDocuments.length} docs / ${totalChars(comparableDocuments)} chars`,
    `entity-heavy=1 doc / ${entityHeavy.length} chars`
  );
  console.log("fast-xml-parser", fastXml.available ? "enabled" : "not installed");
  console.log("sax", saxFalse.available && saxTrue.available ? "enabled" : "not installed");
  console.log("saxes", saxesFalse.available && saxesTrue.available ? "enabled" : "not installed");

  const results = runScenarioGroup(scenarios);

  const saxResults = results.filter((result) => result.group === "sax");
  const saxBaselineMedian = saxResults[0]?.distribution.median ?? 0;
  printTable(saxResults, saxBaselineMedian, "SAX / Streaming Results (median of rounds)");

  const objectResults = results.filter((result) => result.group === "object");
  const objectBaselineMedian = objectResults[0]?.distribution.median ?? 0;
  if (objectResults.length > 0) {
    printTable(objectResults, objectBaselineMedian, "Object / Tree Results (median of rounds)");
  }

  const saxComparable = results.find((result) => result.name === "xml-sax-ts:sax single-feed xmlns=false");
  const saxComparableXmlns = results.find((result) => result.name === "xml-sax-ts:sax single-feed xmlns=true");
  const saxPkgComparable = results.find((result) => result.name === "sax:single-feed xmlns=false");
  const saxPkgComparableXmlns = results.find((result) => result.name === "sax:single-feed xmlns=true");
  const saxesComparable = results.find((result) => result.name === "saxes:single-feed xmlns=false");
  const saxesComparableXmlns = results.find((result) => result.name === "saxes:single-feed xmlns=true");
  const fastComparable = results.find((result) => result.name === "fast-xml-parser:object parse");

  if (saxComparable && saxPkgComparable) {
    const ratio = saxComparable.distribution.median / saxPkgComparable.distribution.median;
    console.log(`\nComparable SAX ratio (xmlns=false, xml-sax-ts vs sax): ${formatNumber(ratio, 3)}x`);
  }
  if (saxComparableXmlns && saxPkgComparableXmlns) {
    const ratio = saxComparableXmlns.distribution.median / saxPkgComparableXmlns.distribution.median;
    console.log(`Comparable SAX ratio (xmlns=true, xml-sax-ts vs sax): ${formatNumber(ratio, 3)}x`);
  }
  if (saxComparable && saxesComparable) {
    const ratio = saxComparable.distribution.median / saxesComparable.distribution.median;
    console.log(`Comparable SAX ratio (xmlns=false, xml-sax-ts vs saxes): ${formatNumber(ratio, 3)}x`);
  }
  if (saxComparableXmlns && saxesComparableXmlns) {
    const ratio = saxComparableXmlns.distribution.median / saxesComparableXmlns.distribution.median;
    console.log(`Comparable SAX ratio (xmlns=true, xml-sax-ts vs saxes): ${formatNumber(ratio, 3)}x`);
  }
  if (saxComparable && fastComparable) {
    const ratio = saxComparable.distribution.median / fastComparable.distribution.median;
    console.log(
      `\nComparable parse ratio (xml-sax-ts:sax vs fast-xml-parser:object): ${formatNumber(ratio, 3)}x`
    );
    console.log("Note: this compares SAX event parsing vs object materialization; use tree mode for closer semantics.");
  }
}

await main();
