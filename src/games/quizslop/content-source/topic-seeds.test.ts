import { describe, expect, it } from "vite-plus/test";
import {
  QUIZSLOP_SEED_QUESTIONS_PER_TIER_TARGET,
  QUIZSLOP_TOPIC_SEEDS,
  getQuizSlopTopicSeed,
} from "./topic-seeds";

const REQUESTED_TOPIC_IDS = [
  "cocktails",
  "horology",
  "cars",
  "cryptids",
  "marsupials",
  "reality-dating-shows",
  "anime",
  "young-adult-novels",
  "hair-products",
  "mma",
  "horse-racing",
  "cryptocurrencies",
  "machine-learning-llms",
  "math",
  "pharmaceuticals",
  "home-audio-equipment",
  "deep-sea-fishing",
  "deep-sea-oil-drilling",
  "deadly-australian-wildlife",
  "fermented-foods",
  "chess",
  "competitive-dog-grooming",
  "elevators",
  "forklift-certification",
  "container-shipping-port-logistics",
  "vending-machines",
  "pigeons-war-sport",
  "bird-courtship-rituals",
  "medieval-medicine",
  "conspiracy-theories-hoaxes",
  "military-rations",
  "corporate-jargon-office-bureaucracy",
  "taxidermy",
  "distilled-spirits",
  "dictators-authoritarian-regimes",
  "high-end-furniture",
  "sleep-science",
  "ergonomics",
  "furry-culture",
  "germ-theory",
  "office-supplies",
] as const;

describe("QuizSlop topic seeds", () => {
  it("covers every requested topic plus the specificity expansion", () => {
    expect(QUIZSLOP_TOPIC_SEEDS).toHaveLength(53);
    for (const id of REQUESTED_TOPIC_IDS) expect(getQuizSlopTopicSeed(id)).not.toBeNull();
  });

  it("keeps all authored seeds draft-only and targets twelve questions per topic", () => {
    expect(QUIZSLOP_SEED_QUESTIONS_PER_TIER_TARGET).toBe(3);
    expect(
      QUIZSLOP_TOPIC_SEEDS.every(
        (seed) =>
          !seed.review.approved &&
          seed.review.state === "DRAFT" &&
          seed.questionsPerTierTarget === 3,
      ),
    ).toBe(true);
  });

  it("uses stable unique IDs and exam titles", () => {
    expect(new Set(QUIZSLOP_TOPIC_SEEDS.map((seed) => seed.id)).size).toBe(
      QUIZSLOP_TOPIC_SEEDS.length,
    );
    expect(new Set(QUIZSLOP_TOPIC_SEEDS.map((seed) => seed.examTitle)).size).toBe(
      QUIZSLOP_TOPIC_SEEDS.length,
    );
  });

  it("encodes the sensitive-topic editorial boundaries", () => {
    expect(getQuizSlopTopicSeed("conspiracy-theories-hoaxes")?.safetyNotes.join(" ")).toMatch(
      /debunking context/iu,
    );
    expect(getQuizSlopTopicSeed("dictators-authoritarian-regimes")?.safetyNotes.join(" ")).toMatch(
      /never punchlines/iu,
    );
    expect(getQuizSlopTopicSeed("furry-culture")?.safetyNotes.join(" ")).toMatch(
      /respectful, nonsexual/iu,
    );
    for (const id of ["pharmaceuticals", "sleep-science", "ergonomics", "germ-theory"]) {
      expect(getQuizSlopTopicSeed(id)?.safetyNotes.join(" ")).toMatch(
        /no .*medical|no diagnosis/iu,
      );
    }
  });
});
