import type { QuizslopCatalogTopic } from "../types";

export const QUIZSLOP_CULTURE_HISTORY_TOPICS: readonly QuizslopCatalogTopic[] = [
  {
    id: "cat-classic-nintendo",
    label: "Classic Nintendo Games",
    category: "GAMES",
    scope: "Classic Nintendo video games and characters through the SNES and N64 era.",
    exclusions: ["Non-Nintendo published games", "Titles released after 2024"],
    canonicalKey: "81309e57d05dac66f8e0875090d01f421f87a3ce311bea815a5b595e7993c65e",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-classic-nintendo-q1",
        tier: "EASY",
        neutralQuestion: "What is the name of Nintendo's mustachioed plumber mascot?",
        displayPrompt:
          "Which mustachioed plumber became Nintendo's mascot despite doing almost no on-screen plumbing?",
        choices: ["Mario", "Luigi", "Wario", "Toad"],
        correctIndex: 0,
        canonicalFact:
          "Mario is Nintendo's mascot, a mustachioed plumber who debuted in the early 1980s.",
        explanation:
          "Mario is Nintendo's plumber mascot, named around 1981. His logged pipe repairs stay suspiciously low; mostly he jumps on things and rescues royalty.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Mario",
            title: "Mario - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "ae8a0c69d06e88b59f30d7ebef4916931d3c81a888beb4048354743ac9e2f6d9",
            supportExcerpt:
              "Mario is a fictional character and the mascot of the Japanese video game company Nintendo, an Italian plumber usually depicted in a red cap and overalls.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-classic-nintendo-q2",
        tier: "MEDIUM",
        neutralQuestion: "In The Legend of Zelda games, what is the name of the playable hero?",
        displayPrompt:
          "In The Legend of Zelda, what is the actual name of the green-clad hero, who is famously not the one called Zelda?",
        choices: ["Link", "Zelda", "Ganon", "Navi"],
        correctIndex: 0,
        canonicalFact:
          "Link is the playable hero of The Legend of Zelda series; Zelda is the princess.",
        explanation:
          "The hero of The Legend of Zelda is Link; Zelda is the princess he rescues. The title names her, which has fuelled decades of people calling the hero Zelda anyway.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Legend_of_Zelda",
            title: "The Legend of Zelda - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "e678b80f7161315c47dc1e97abf10a5740acf5f2c203d5f0786b7ee014c36fd6",
            supportExcerpt:
              "In The Legend of Zelda series the player controls the hero Link, who typically sets out to rescue Princess Zelda and the land of Hyrule.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-classic-nintendo-q3",
        tier: "HARD",
        neutralQuestion:
          "Which 1996 Nintendo 64 launch game is widely credited with defining 3D platforming?",
        displayPrompt:
          "Which 1996 Nintendo 64 launch title basically wrote the rulebook for steering a character around in 3D?",
        choices: ["Super Mario 64", "GoldenEye 007", "Banjo-Kazooie", "Star Fox 64"],
        correctIndex: 0,
        canonicalFact:
          "Super Mario 64 (1996) was a Nintendo 64 launch title credited with establishing 3D platforming conventions.",
        explanation:
          "Super Mario 64 launched with the N64 in 1996 and set the template for 3D platformers, wandering camera and all. Everyone else spent years catching up.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Super_Mario_64",
            title: "Super Mario 64 - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "ecf51acaaa7fbdf6201a818b477ad79f37e55f8af4b8c495c525c1d5496b11a5",
            supportExcerpt:
              "Super Mario 64 is a 1996 platform game and a launch title for the Nintendo 64, widely credited with defining the conventions of 3D platform games.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-classic-nintendo-q4",
        tier: "INSANE",
        neutralQuestion:
          "What was the Japanese name of the 1983 Nintendo console released internationally as the NES?",
        displayPrompt:
          "What was the Japanese name of the 1983 Nintendo console that reached the West two years later as the NES?",
        choices: ["Family Computer (Famicom)", "Super Famicom", "PC Engine", "Color TV-Game"],
        correctIndex: 0,
        canonicalFact:
          "The Nintendo Entertainment System was released in Japan in 1983 as the Family Computer, or Famicom.",
        explanation:
          "Nintendo launched the console in Japan in 1983 as the Family Computer, or Famicom; the West got it as the NES in 1985. Same box, new accent.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "WORDPLAY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Nintendo_Entertainment_System",
            title: "Nintendo Entertainment System - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "310b258d173bb710521ba4c2af194d4689dabc0c5047d343fb213061566147d8",
            supportExcerpt:
              "The Nintendo Entertainment System is an 8-bit home video game console; it was first released in Japan in 1983 as the Family Computer, commonly abbreviated as Famicom.",
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
    id: "cat-ancient-rome",
    label: "Ancient Rome",
    category: "HISTORY",
    scope: "Ancient Roman history, politics, and society from the Republic through the Empire.",
    exclusions: ["The Eastern or Byzantine Empire after 476 AD", "Modern Italy"],
    canonicalKey: "752fb770f37e2d8db295d46336aa7cf4c8e7066bdcd323afcc6450689a004abd",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-ancient-rome-q1",
        tier: "EASY",
        neutralQuestion:
          "According to legend, which twin founded Rome after his brother Remus died?",
        displayPrompt:
          "Roman legend credits which twin with founding the city, right after a fatal falling-out with his brother Remus?",
        choices: ["Romulus", "Remus", "Julius Caesar", "Augustus"],
        correctIndex: 0,
        canonicalFact:
          "According to Roman legend, Romulus founded Rome and killed his twin brother Remus.",
        explanation:
          "Legend credits Romulus with founding Rome in 753 BC after killing his twin Remus. A brotherly boundary dispute that eventually turned into an empire.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Romulus_and_Remus",
            title: "Romulus and Remus - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "f03e136e020f52d90e0227f04baa8724d3d752b5a016717bf066a4b20f1c51fd",
            supportExcerpt:
              "In Roman mythology Romulus and Remus are twin brothers; Romulus founded the city of Rome after killing Remus, and became its first king.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-ancient-rome-q2",
        tier: "MEDIUM",
        neutralQuestion: "In what year was Julius Caesar assassinated?",
        displayPrompt:
          "In which year did a crowd of senators turn the Ides of March into a very bad afternoon for Julius Caesar?",
        choices: ["44 BC", "27 BC", "14 AD", "63 BC"],
        correctIndex: 0,
        canonicalFact: "Julius Caesar was assassinated on the Ides of March, 15 March, in 44 BC.",
        explanation:
          "Julius Caesar was assassinated on 15 March, 44 BC, the Ides of March. Roughly sixty senators took part, which rather rules out a quiet misunderstanding.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Assassination_of_Julius_Caesar",
            title: "Assassination of Julius Caesar - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "1bc412807e4a25f3fdcdd99b467fdddc60a5821d76b5a8b86f55ad99015c0f50",
            supportExcerpt:
              "Julius Caesar was assassinated on the Ides of March, 15 March 44 BC, by a group of Roman senators who stabbed him during a Senate meeting.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-ancient-rome-q3",
        tier: "HARD",
        neutralQuestion:
          "Which Roman emperor ordered the construction of a defensive wall across northern Britain around 122 AD?",
        displayPrompt:
          "Which emperor drew a hard line across northern Britain around 122 AD, building a wall that still carries his name?",
        choices: ["Hadrian", "Trajan", "Nero", "Augustus"],
        correctIndex: 0,
        canonicalFact:
          "Emperor Hadrian ordered the building of Hadrian's Wall across northern Britain, begun around 122 AD.",
        explanation:
          "Hadrian ordered his namesake wall across northern Britain around 122 AD. Few statements of imperial confidence beat naming a 117-kilometre wall after yourself.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Hadrian%27s_Wall",
            title: "Hadrian's Wall - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "afe32801e714eed9d32eb83f17a79900f4c8cd17271bed96e3a09785be9a53df",
            supportExcerpt:
              "Hadrian's Wall is a former defensive fortification of Roman Britain, begun around 122 AD during the reign of the emperor Hadrian, after whom it is named.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-ancient-rome-q4",
        tier: "INSANE",
        neutralQuestion: "Which emperor was the last of the so-called Five Good Emperors of Rome?",
        displayPrompt:
          "Which philosopher-emperor was the last of the 'Five Good Emperors,' just before the run ended with his own son?",
        choices: ["Marcus Aurelius", "Commodus", "Trajan", "Nerva"],
        correctIndex: 0,
        canonicalFact:
          "Marcus Aurelius, who reigned from 161 to 180 AD, was the last of the Five Good Emperors.",
        explanation:
          "Marcus Aurelius, who wrote Meditations, was the last of the Five Good Emperors. He then handed the throne to his son Commodus, and the good run promptly ended.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Nerva%E2%80%93Antonine_dynasty",
            title: "Nerva-Antonine dynasty - Wikipedia",
            locator: "Five Good Emperors",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "d713d7dfee7a0b7e38e9dd618cd4ef3d17eae9d7d0e27719811b3885413ccfea",
            supportExcerpt:
              "The Five Good Emperors were Nerva, Trajan, Hadrian, Antoninus Pius and Marcus Aurelius; Marcus Aurelius was the last of them, succeeded by his son Commodus.",
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
