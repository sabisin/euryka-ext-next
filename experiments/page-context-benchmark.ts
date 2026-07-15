import {
  type CompactedPageContent,
  type PageContentBlock,
  compactPageContent,
  compactPageContentV2,
  serializePageBlocks,
} from "../lib/page-context";
import { compactPageContentAdaptive } from "../lib/page-context-experimental";

type BenchmarkCase = {
  name: string;
  query: string;
  blocks: PageContentBlock[];
  requiredFacts: string[];
  supportingFacts: string[];
  noiseMarkers: string[];
};

type Algorithm = {
  name: string;
  run: (
    blocks: PageContentBlock[],
    text: string,
    query: string,
    limit: number
  ) => CompactedPageContent;
};

type BenchmarkResult = {
  case: string;
  limit: number;
  algorithm: string;
  requiredRecall: number;
  supportingRecall: number;
  noiseRate: number;
  score: number;
  outputChars: number;
  selectedChunks: number;
  elapsedMs: number;
};

const LIMITS = [700, 1_500, 4_000, 10_000];
const algorithms: Algorithm[] = [
  {
    name: "trim",
    run: (blocks, text, _query, limit) => ({
      text: text.slice(0, limit),
      compacted: text.length > limit,
      selectedChunkCount: blocks.length > 0 ? 1 : 0,
      totalChunkCount: blocks.length,
      originalCharCount: text.length,
    }),
  },
  { name: "compact", run: compactPageContent },
  { name: "compact-v2", run: compactPageContentV2 },
  { name: "adaptive-experimental", run: compactPageContentAdaptive },
];

const cases = [
  createMuayThaiGenericCase(),
  createMuayThaiWomenCase(),
  createMuayThaiRulesCase(),
  createPolicyCase(),
  createDocumentationCase(),
  createUnstructuredCase(),
];

const results: BenchmarkResult[] = [];
for (const benchmarkCase of cases) {
  const fallbackText = serializePageBlocks(benchmarkCase.blocks);
  for (const limit of LIMITS) {
    for (const algorithm of algorithms) {
      const startedAt = performance.now();
      const output = algorithm.run(benchmarkCase.blocks, fallbackText, benchmarkCase.query, limit);
      const elapsedMs = performance.now() - startedAt;
      const requiredRecall = recall(output.text, benchmarkCase.requiredFacts);
      const supportingRecall = recall(output.text, benchmarkCase.supportingFacts);
      const noiseRate = recall(output.text, benchmarkCase.noiseMarkers);
      const score = requiredRecall * 75 + supportingRecall * 25 - noiseRate * 15;
      results.push({
        case: benchmarkCase.name,
        limit,
        algorithm: algorithm.name,
        requiredRecall,
        supportingRecall,
        noiseRate,
        score,
        outputChars: output.text.length,
        selectedChunks: output.selectedChunkCount,
        elapsedMs,
      });
    }
  }
}

console.log("\nOverall (all cases and limits)");
console.table(aggregate(results));
for (const limit of LIMITS) {
  console.log(`\nCharacter limit: ${limit}`);
  console.table(aggregate(results.filter((result) => result.limit === limit)));
}

console.log("\nPer-case winners");
console.table(
  cases.flatMap((benchmarkCase) =>
    LIMITS.map((limit) => {
      const candidates = results
        .filter((result) => result.case === benchmarkCase.name && result.limit === limit)
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.requiredRecall - left.requiredRecall ||
            left.outputChars - right.outputChars
        );
      return {
        case: benchmarkCase.name,
        limit,
        winner: candidates[0].algorithm,
        score: round(candidates[0].score),
        requiredRecall: percent(candidates[0].requiredRecall),
      };
    })
  )
);

function aggregate(rows: BenchmarkResult[]) {
  return algorithms
    .map((algorithm) => {
      const matching = rows.filter((row) => row.algorithm === algorithm.name);
      return {
        algorithm: algorithm.name,
        score: round(average(matching.map((row) => row.score))),
        requiredRecall: percent(average(matching.map((row) => row.requiredRecall))),
        supportingRecall: percent(average(matching.map((row) => row.supportingRecall))),
        noiseRate: percent(average(matching.map((row) => row.noiseRate))),
        averageChars: Math.round(average(matching.map((row) => row.outputChars))),
        averageMs: round(average(matching.map((row) => row.elapsedMs))),
      };
    })
    .sort((left, right) => right.score - left.score);
}

function createMuayThaiGenericCase(): BenchmarkCase {
  const blocks = muayThaiBlocks();
  return {
    name: "wiki-generic-summary",
    query: "Summarize this page",
    blocks,
    requiredFacts: [
      "art of eight limbs",
      "Muay Boran is the ancient precursor",
      "Wai Kru and Ram Muay",
      "groin strikes are prohibited",
      "women now compete under the same rules",
      "Muay Chaiya and Muay Korat",
    ],
    supportingFacts: [
      "national sport of Thailand",
      "Thai distinguished it from Western boxing",
      "international recognition expanded",
    ],
    noiseMarkers: ["REFERENCE_NOISE", "EXTERNAL_LINK_NOISE"],
  };
}

function createMuayThaiWomenCase(): BenchmarkCase {
  return {
    name: "wiki-target-late-section",
    query: "How has women's participation in Muay Thai changed?",
    blocks: muayThaiBlocks(),
    requiredFacts: [
      "women were historically prohibited from approaching the ring",
      "women now compete under the same rules",
    ],
    supportingFacts: ["pay remains lower", "traditional restrictions have weakened"],
    noiseMarkers: ["REFERENCE_NOISE", "EXTERNAL_LINK_NOISE"],
  };
}

function createMuayThaiRulesCase(): BenchmarkCase {
  return {
    name: "wiki-target-middle-section",
    query: "Which strikes are prohibited and how is a fight scored?",
    blocks: muayThaiBlocks(),
    requiredFacts: ["groin strikes are prohibited", "speed power and focus determine scoring"],
    supportingFacts: ["weight categories", "referee may stop the contest"],
    noiseMarkers: ["REFERENCE_NOISE", "EXTERNAL_LINK_NOISE"],
  };
}

function createPolicyCase(): BenchmarkCase {
  const blocks: PageContentBlock[] = [
    title("Subscription and billing policy", 0),
    paragraph(`General service overview. ${filler("account service", 90)}`, 1, ["Overview"]),
    paragraph(`Available monthly and annual plans. ${filler("plan feature", 90)}`, 2, ["Plans"]),
    paragraph(
      `Invoices are issued at the beginning of each billing cycle. ${filler("invoice", 80)}`,
      3,
      ["Billing"]
    ),
    paragraph(
      `Cancellation requests qualify for a full refund within 45 days of purchase. Partial refunds are not offered after that window. ${filler("cancellation process", 35)}`,
      4,
      ["Cancellation", "Refunds"]
    ),
    paragraph(
      `Enterprise customers contact account management. ${filler("enterprise support", 75)}`,
      5,
      ["Enterprise"]
    ),
    paragraph(`POLICY_REFERENCE_NOISE ${filler("legal citation", 100)}`, 6, ["References"]),
  ];
  return {
    name: "policy-target-refund",
    query: "How long is the cancellation refund window?",
    blocks,
    requiredFacts: ["full refund within 45 days", "after that window"],
    supportingFacts: ["Cancellation", "purchase"],
    noiseMarkers: ["POLICY_REFERENCE_NOISE"],
  };
}

function createDocumentationCase(): BenchmarkCase {
  const blocks: PageContentBlock[] = [
    title("Distributed worker configuration", 0),
    paragraph(`Architecture and installation overview. ${filler("worker architecture", 85)}`, 1, [
      "Introduction",
    ]),
    paragraph(
      `Authentication uses short-lived service tokens. ${filler("authentication token", 85)}`,
      2,
      ["Authentication"]
    ),
    paragraph(`Queue consumers acknowledge completed jobs. ${filler("queue consumer", 85)}`, 3, [
      "Queues",
    ]),
    paragraph(
      `Set retryBackoffMs to 2500 and maxRetryAttempts to 6 for transient failures. Jitter is enabled by default. ${filler("retry configuration", 30)}`,
      4,
      ["Failure recovery", "Retries"]
    ),
    paragraph(`Metrics use OpenTelemetry exporters. ${filler("metric exporter", 85)}`, 5, [
      "Observability",
    ]),
    paragraph(`DOC_REFERENCE_NOISE ${filler("api reference", 100)}`, 6, ["References"]),
  ];
  return {
    name: "documentation-target-config",
    query: "What retry backoff and maximum attempts should I configure?",
    blocks,
    requiredFacts: ["retryBackoffMs to 2500", "maxRetryAttempts to 6"],
    supportingFacts: ["Jitter is enabled", "transient failures"],
    noiseMarkers: ["DOC_REFERENCE_NOISE"],
  };
}

function createUnstructuredCase(): BenchmarkCase {
  const parts = [
    `Unstructured incident report. ${filler("opening context", 75)}`,
    `Timeline observations. ${filler("timeline event", 80)}`,
    `The root cause was connection pool exhaustion after a deployment changed the default from 80 to 12. ${filler("database connection", 45)}`,
    `Mitigation increased the pool to 60 and added saturation alerts. ${filler("mitigation step", 45)}`,
    `UNSTRUCTURED_NOISE ${filler("appendix log", 100)}`,
  ];
  const blocks = parts.map((text, documentIndex) => paragraph(text, documentIndex));
  return {
    name: "unstructured-target-root-cause",
    query: "What caused the incident and how was it mitigated?",
    blocks,
    requiredFacts: ["connection pool exhaustion", "increased the pool to 60"],
    supportingFacts: ["default from 80 to 12", "saturation alerts"],
    noiseMarkers: ["UNSTRUCTURED_NOISE"],
  };
}

function muayThaiBlocks(): PageContentBlock[] {
  return [
    title("Muay Thai", 0),
    paragraph(
      `Muay Thai is the national sport of Thailand and is known as the art of eight limbs. ${filler("combat striking tradition", 50)}`,
      1
    ),
    paragraph(
      `The word Thai distinguished it from Western boxing in the twentieth century. ${filler("etymology language", 55)}`,
      2,
      ["Etymology"]
    ),
    paragraph(
      `Muay Boran is the ancient precursor to modern Muay Thai. ${filler("historical development", 70)}`,
      3,
      ["History and evolution"]
    ),
    paragraph(
      `International recognition expanded during the twentieth century. ${filler("global competition", 60)}`,
      4,
      ["History and evolution"]
    ),
    paragraph(
      `Wai Kru and Ram Muay honor teachers and seek spiritual protection. ${filler("ritual tradition", 65)}`,
      5,
      ["Rituals"]
    ),
    paragraph(
      `Fighters develop strength endurance concentration and confidence. ${filler("athlete conditioning", 65)}`,
      6,
      ["The fighter"]
    ),
    paragraph(
      `Punches elbows knees shins clinch work and defensive movement form the technical system. ${filler("technical movement", 70)}`,
      7,
      ["Techniques"]
    ),
    paragraph(
      `Groin strikes are prohibited and speed power and focus determine scoring. Weight categories apply and the referee may stop the contest. ${filler("competition regulation", 55)}`,
      8,
      ["Rules and regulations"]
    ),
    paragraph(
      `Western schools use colored armbands for progression. ${filler("grading system", 60)}`,
      9,
      ["Graduation"]
    ),
    paragraph(
      `Training camps remain central to professional practice in Thailand. ${filler("training culture", 60)}`,
      10,
      ["Muay Thai in Thailand"]
    ),
    paragraph(
      `Women were historically prohibited from approaching the ring, but traditional restrictions have weakened. Women now compete under the same rules, although pay remains lower. ${filler("female participation", 55)}`,
      11,
      ["Women's participation"]
    ),
    paragraph(
      `Muay Chaiya and Muay Korat are prominent regional styles. ${filler("regional fighting style", 55)}`,
      12,
      ["Styles"]
    ),
    paragraph(
      `Thai terminology documents commands techniques and equipment. ${filler("terminology glossary", 60)}`,
      13,
      ["Terminology"]
    ),
    paragraph(`REFERENCE_NOISE ${filler("citation bibliography", 120)}`, 14, ["References"]),
    paragraph(`EXTERNAL_LINK_NOISE ${filler("external website", 100)}`, 15, ["External links"]),
  ];
}

function recall(text: string, facts: string[]): number {
  if (facts.length === 0) return 1;
  const normalized = text.toLocaleLowerCase();
  return (
    facts.filter((fact) => normalized.includes(fact.toLocaleLowerCase())).length / facts.length
  );
}

function title(text: string, documentIndex: number): PageContentBlock {
  return { type: "title", text, headingPath: [], documentIndex };
}

function paragraph(
  text: string,
  documentIndex: number,
  headingPath: string[] = []
): PageContentBlock {
  return { type: "paragraph", text, headingPath, documentIndex };
}

function filler(term: string, repetitions: number): string {
  return Array.from({ length: repetitions }, (_, index) => `${term} detail ${index}.`).join(" ");
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
