import type { QuizslopCatalogTopic } from "../types";

export const QUIZSLOP_FLAGS_FILM_TOPICS: readonly QuizslopCatalogTopic[] = [
  {
    id: "cat-studio-ghibli",
    label: "Studio Ghibli Films",
    category: "FILM_TV",
    scope: "Animated feature films produced by Japan's Studio Ghibli.",
    exclusions: ["Non-Ghibli anime films", "Releases after 2024"],
    canonicalKey: "1cc03c1d32c8897e0cf03f33ae79cd8d588e13661e923bc8cf0f0e725dfcfa5c",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-studio-ghibli-q1",
        tier: "EASY",
        neutralQuestion:
          "What is the name of the large forest spirit in the film My Neighbor Totoro?",
        displayPrompt:
          "In one of Ghibli's most beloved films, what is the name of the giant, mostly silent forest spirit who adopts two young sisters?",
        choices: ["Totoro", "Ponyo", "Jiji", "Calcifer"],
        correctIndex: 0,
        canonicalFact:
          "Totoro is the large forest spirit in Studio Ghibli's 1988 film My Neighbor Totoro.",
        explanation:
          "Totoro is the giant forest spirit of the 1988 classic and Ghibli's mascot. His documented skills are napping, growing trees overnight, and waiting at bus stops.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/My_Neighbor_Totoro",
            title: "My Neighbor Totoro - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "a057f248deb496c56d959ed6200b6f0065a668582c4c7579f726f37e28cfb22a",
            supportExcerpt:
              "My Neighbor Totoro is a 1988 Japanese animated film by Studio Ghibli; Totoro is the large forest spirit befriended by the two young sisters, and became the studio's mascot.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-studio-ghibli-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which Studio Ghibli film was the first to win the Academy Award for Best Animated Feature?",
        displayPrompt:
          "Which Studio Ghibli film became the first to take home the Oscar for Best Animated Feature?",
        choices: ["Spirited Away", "Princess Mononoke", "Howl's Moving Castle", "Ponyo"],
        correctIndex: 0,
        canonicalFact:
          "Spirited Away (2001) was the first Studio Ghibli film to win the Academy Award for Best Animated Feature, at the 2003 ceremony.",
        explanation:
          "Spirited Away won Best Animated Feature at the 2003 Oscars, the first Ghibli film to do so. A hand-drawn, subtitled bathhouse story beat the flashier field.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Spirited_Away",
            title: "Spirited Away - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "c92f8108824e1f96ac9fd79b16c0930ee3cd408451f012e8939d565c4d159cf5",
            supportExcerpt:
              "Spirited Away won the Academy Award for Best Animated Feature at the 75th Academy Awards in 2003, making it the first and only hand-drawn and non-English-language film to win the category at the time.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-studio-ghibli-q3",
        tier: "HARD",
        neutralQuestion:
          "Which Studio Ghibli film directed by Isao Takahata retells the folktale of a girl found inside a bamboo stalk?",
        displayPrompt:
          "Which hand-drawn Ghibli film from Isao Takahata retells the old folktale of a princess found glowing inside a bamboo stalk?",
        choices: [
          "The Tale of the Princess Kaguya",
          "Grave of the Fireflies",
          "Only Yesterday",
          "Whisper of the Heart",
        ],
        correctIndex: 0,
        canonicalFact:
          "The Tale of the Princess Kaguya (2013) is Isao Takahata's Ghibli film based on The Tale of the Bamboo Cutter.",
        explanation:
          "The Tale of the Princess Kaguya (2013), by Isao Takahata, adapts the classic Bamboo Cutter folktale in a watercolour style. Years of painstaking sketching, all for a baby in a plant.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Tale_of_the_Princess_Kaguya",
            title: "The Tale of the Princess Kaguya - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "29a35f339527547e4d26d2b0361ad19cf837652a02fc3ee00d1507afb8057a75",
            supportExcerpt:
              "The Tale of the Princess Kaguya is a 2013 Japanese animated film directed by Isao Takahata for Studio Ghibli, based on the folktale The Tale of the Bamboo Cutter.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-studio-ghibli-q4",
        tier: "INSANE",
        neutralQuestion: "In what year was Studio Ghibli founded?",
        displayPrompt:
          "In which year did Hayao Miyazaki and Isao Takahata formally found Studio Ghibli?",
        choices: ["1985", "1988", "1979", "1997"],
        correctIndex: 0,
        canonicalFact:
          "Studio Ghibli was founded in 1985 by Hayao Miyazaki, Isao Takahata, and Toshio Suzuki.",
        explanation:
          "Studio Ghibli was founded in June 1985 after the success of Nausicaä. Its name comes from an Italian word for a hot Saharan wind, chosen to promise a fresh gust through anime.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Studio_Ghibli",
            title: "Studio Ghibli - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "398de6d80bf33284af621eb0d66c26e79267d9ac33cd26ce06ba26b0e0bef34a",
            supportExcerpt:
              "Studio Ghibli was founded on 15 June 1985 by directors Hayao Miyazaki and Isao Takahata and producer Toshio Suzuki, taking its name from the Italian word for a hot Saharan wind.",
            primary: true,
          },
        ],
      },
    ],
    review: {
      approved: true,
      reviewer: "Gabriel Ong",
      reviewedAt: "2026-07-18T20:00:00.000Z",
      factualState: "APPROVED",
      comedyState: "APPROVED",
      comedyRating: "WITTY",
    },
  },
  {
    id: "cat-pixar-films",
    label: "Pixar Films",
    category: "FILM_TV",
    scope: "Feature films produced by Pixar Animation Studios.",
    exclusions: ["Non-Pixar animated films", "Releases after 2024"],
    canonicalKey: "cd934fb06868700ab5e78ff25ac0ad3bc88f2338f50b58c0f9be903720f12e98",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-pixar-films-q1",
        tier: "EASY",
        neutralQuestion: "In the film Toy Story, what type of character is the toy Woody?",
        displayPrompt:
          "In Pixar's first feature, Woody the pull-string toy is styled as which kind of character?",
        choices: ["A cowboy", "An astronaut", "A dinosaur", "A race car"],
        correctIndex: 0,
        canonicalFact: "Woody, from Toy Story (1995), is a pull-string cowboy doll.",
        explanation:
          "Woody is a pull-string cowboy doll and the reluctant leader of Andy's toys. His authority holds right up until a self-described space ranger moves in.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Toy_Story",
            title: "Toy Story - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "3c0602c501d8442931c2f10812e9df348bef11343c01fde23cc8916512a27ea8",
            supportExcerpt:
              "Toy Story is a 1995 Pixar film; its protagonist Woody is a pull-string cowboy doll who leads the other toys in Andy's room.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-pixar-films-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which Pixar film centres on a rat named Remy who wants to become a chef in Paris?",
        displayPrompt:
          "Which Pixar film asks the audience to root for a Parisian rat who dreams of running a fine-dining kitchen?",
        choices: ["Ratatouille", "Finding Nemo", "Up", "Cars"],
        correctIndex: 0,
        canonicalFact:
          "Ratatouille (2007) follows Remy, a rat who aspires to be a gourmet chef in Paris.",
        explanation:
          "Ratatouille (2007) follows Remy, a rat with a refined palate, cooking in a top Paris restaurant. Every health inspector in France declined to comment.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Ratatouille_(film)",
            title: "Ratatouille (film) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "6072bef396b0f76a678e42489d9c206b1de2f0305de680db97fd0b299ff7e9a1",
            supportExcerpt:
              "Ratatouille is a 2007 Pixar film about Remy, an idealistic rat who dreams of becoming a chef and cooks in a restaurant in Paris.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-pixar-films-q3",
        tier: "HARD",
        neutralQuestion:
          "Which Pixar film was the first from the studio to win the Academy Award for Best Animated Feature?",
        displayPrompt:
          "Which Pixar film was the first from the studio to win the Oscar for Best Animated Feature?",
        choices: ["Finding Nemo", "Monsters, Inc.", "Toy Story", "The Incredibles"],
        correctIndex: 0,
        canonicalFact:
          "Finding Nemo (2003) was the first Pixar film to win the Academy Award for Best Animated Feature.",
        explanation:
          "Finding Nemo (2003) was Pixar's first Best Animated Feature winner. Solid work for a film about a fish crossing an ocean to locate one specific other fish.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Finding_Nemo",
            title: "Finding Nemo - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "4cc2acde67f958bf4c67a2de4773c713bafdafbf9911ab71e51cb697013c9d00",
            supportExcerpt:
              "Finding Nemo won the Academy Award for Best Animated Feature at the 76th Academy Awards, becoming the first Pixar film to win the category.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-pixar-films-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which composer wrote the scores for the Pixar films The Incredibles and Ratatouille?",
        displayPrompt:
          "Which composer wrote the brassy, jazz-tinged scores for both The Incredibles and Ratatouille?",
        choices: ["Michael Giacchino", "Randy Newman", "Thomas Newman", "Hans Zimmer"],
        correctIndex: 0,
        canonicalFact:
          "Michael Giacchino composed the scores for The Incredibles (2004) and Ratatouille (2007).",
        explanation:
          "Michael Giacchino scored The Incredibles and Ratatouille, then won an Oscar for Up. Two Newmans sit on the answer list purely to be suspected.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Michael_Giacchino",
            title: "Michael Giacchino - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "689c3c9ce7db705c991f2a07fd5592b6dec646ba04234d501532a5ff9d27b1c7",
            supportExcerpt:
              "Michael Giacchino composed the scores for Pixar films including The Incredibles and Ratatouille, and won the Academy Award for Best Original Score for Up.",
            primary: true,
          },
        ],
      },
    ],
    review: {
      approved: true,
      reviewer: "Gabriel Ong",
      reviewedAt: "2026-07-18T20:00:00.000Z",
      factualState: "APPROVED",
      comedyState: "APPROVED",
      comedyRating: "WITTY",
    },
  },
];
