import type { SparkGroup } from "./types";

export interface SparkCatalogItem {
  id: string;
  title: string;
  description: string;
  groups: string[];
}

export function buildSparkCatalog(groups: SparkGroup[]): SparkCatalogItem[] {
  const byId = new Map<string, SparkCatalogItem>();

  for (const group of groups) {
    for (const spark of group.sparks) {
      const groupTitle = spark.group ?? group.title ?? "";
      const existing = byId.get(spark.id);
      if (existing) {
        if (groupTitle && !existing.groups.includes(groupTitle)) {
          existing.groups.push(groupTitle);
        }
        continue;
      }

      byId.set(spark.id, {
        id: spark.id,
        title: spark.title,
        description: spark.description ?? "",
        groups: groupTitle ? [groupTitle] : [],
      });
    }
  }

  return [...byId.values()];
}

export function summarizeSparkGroups(groups: SparkGroup[]) {
  return {
    groupCount: groups.length,
    sparkCount: groups.reduce((count, group) => count + group.sparks.length, 0),
    groups: groups.map((group) => ({
      title: group.title,
      descriptionChars: group.description?.length ?? 0,
      sparkCount: group.sparks.length,
    })),
  };
}

export function summarizeSparkCatalog(groups: SparkGroup[], catalog: SparkCatalogItem[]) {
  return {
    ...summarizeSparkGroups(groups),
    uniqueSparkCount: catalog.length,
  };
}

export function buildSparkCatalogText(sparks: SparkCatalogItem[]): string {
  return sparks
    .map((spark, index) =>
      [
        `${index + 1}.`,
        `id=${compactText(spark.id)}`,
        `title=${compactText(spark.title)}`,
        `desc=${compactText(spark.description)}`,
        `groups=${compactText(spark.groups.join(", "))}`,
      ].join(" ")
    )
    .join("\n");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
