import type { QuizslopCatalogTopic } from "../types";

export const QUIZSLOP_CULTURE_HISTORY_TOPICS: readonly QuizslopCatalogTopic[] = [
  {
    id: "cat-the-beatles",
    label: "The Beatles",
    category: "MUSIC",
    scope: "The English rock band The Beatles: their members, albums, and songs.",
    exclusions: ["Solo careers after the 1970 breakup", "Releases after 2024"],
    canonicalKey: "1b6d59dec8941e7f9ed091d7494c681a4724bc2832ac31b41192d9b9f835b69c",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-the-beatles-q1",
        tier: "EASY",
        neutralQuestion: "How many members made up the classic lineup of The Beatles?",
        displayPrompt:
          "How many mop-topped members made up the classic, chart-dominating lineup of The Beatles?",
        choices: ["Four", "Three", "Five", "Two"],
        correctIndex: 0,
        canonicalFact:
          "The classic lineup of The Beatles had four members: John Lennon, Paul McCartney, George Harrison, and Ringo Starr.",
        explanation:
          "The Beatles' classic lineup was four: Lennon, McCartney, Harrison, and Starr. Earlier lineups cycled through members like a revolving door before the fame hit.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Beatles",
            title: "The Beatles - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "829c19b7d16902e20d0ba6642b1017b377f552634f75705076e0f542a694574a",
            supportExcerpt:
              "The Beatles were an English rock band whose classic and final lineup comprised John Lennon, Paul McCartney, George Harrison and Ringo Starr.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-the-beatles-q2",
        tier: "MEDIUM",
        neutralQuestion: "Which drummer joined The Beatles in 1962, replacing Pete Best?",
        displayPrompt:
          "Which drummer stepped in for Pete Best in 1962 and rode along for the entire Beatlemania wave?",
        choices: ["Ringo Starr", "Pete Best", "George Martin", "Stuart Sutcliffe"],
        correctIndex: 0,
        canonicalFact: "Ringo Starr joined The Beatles as drummer in 1962, replacing Pete Best.",
        explanation:
          "Ringo Starr replaced Pete Best on drums in 1962, just before the band exploded. Timing, as they say, is everything.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Ringo_Starr",
            title: "Ringo Starr - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "2bcbc41efa96e1e2e212c492626c95623fe11eebd031e1d2c347f508c3cbb762",
            supportExcerpt:
              "Ringo Starr joined the Beatles in 1962, replacing Pete Best as the band's drummer shortly before their rise to international fame.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-the-beatles-q3",
        tier: "HARD",
        neutralQuestion: "Which 1969 album was the last one The Beatles recorded together?",
        displayPrompt:
          "Which 1969 album was the final record The Beatles actually recorded together, even though another was released later?",
        choices: ["Abbey Road", "Let It Be", "The White Album", "Revolver"],
        correctIndex: 0,
        canonicalFact:
          "Abbey Road (1969) was the last album The Beatles recorded together, though Let It Be was released later in 1970.",
        explanation:
          "Abbey Road (1969) was the last album the band recorded together; Let It Be came out later but was mostly taped earlier. The paperwork outlived the band.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Abbey_Road",
            title: "Abbey Road - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "f410488651e4eef6eef45be1fc30fa71b25ccac260a1663eb2b2d38a9d7c6088",
            supportExcerpt:
              "Abbey Road is the eleventh studio album by the Beatles, released in 1969; it was the last album the group recorded together, although Let It Be was the last released.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-the-beatles-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which 1964 Beatles album was the first to consist entirely of original compositions?",
        displayPrompt:
          "Which 1964 Beatles album was the first with zero cover versions, written entirely in-house by the band?",
        choices: ["A Hard Day's Night", "Please Please Me", "With the Beatles", "Beatles for Sale"],
        correctIndex: 0,
        canonicalFact:
          "A Hard Day's Night (1964) was the first Beatles album composed entirely of original Lennon-McCartney songs.",
        explanation:
          "A Hard Day's Night (1964) was the first Beatles album with no cover versions, all Lennon-McCartney originals. They finally stopped borrowing the setlist.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/A_Hard_Day%27s_Night_(album)",
            title: "A Hard Day's Night (album) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "528173818aed01603f0b7afd834f461e4e44056ebe36a57fd86e037a4db587a5",
            supportExcerpt:
              "A Hard Day's Night is the first Beatles album to feature entirely original compositions, and the only one on which every song was written by Lennon-McCartney.",
            primary: true,
          },
        ],
      },
    ],
    review: {
      approved: false,
      reviewer: null,
      reviewedAt: null,
      factualState: "DRAFT",
      comedyState: "DRAFT",
      comedyRating: null,
    },
  },
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
          "Which mustachioed plumber became Nintendo's mascot, despite doing almost no visible plumbing?",
        choices: ["Mario", "Luigi", "Wario", "Toad"],
        correctIndex: 0,
        canonicalFact:
          "Mario is Nintendo's mascot, a mustachioed plumber who debuted in the early 1980s.",
        explanation:
          "Mario is Nintendo's plumber mascot, first named around 1981. His actual pipe-repair record remains suspiciously thin.",
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
          "In The Legend of Zelda, what is the actual name of the green-clad hero, who is famously not named Zelda?",
        choices: ["Link", "Zelda", "Ganon", "Navi"],
        correctIndex: 0,
        canonicalFact:
          "Link is the playable hero of The Legend of Zelda series; Zelda is the princess.",
        explanation:
          "The hero of The Legend of Zelda is Link; Zelda is the princess he rescues. The title refers to her, which has fuelled a lasting name mix-up.",
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
          "Which 1996 Nintendo 64 launch title basically wrote the rulebook for moving a character around in 3D?",
        choices: ["Super Mario 64", "GoldenEye 007", "Banjo-Kazooie", "Star Fox 64"],
        correctIndex: 0,
        canonicalFact:
          "Super Mario 64 (1996) was a Nintendo 64 launch title credited with establishing 3D platforming conventions.",
        explanation:
          "Super Mario 64 launched with the N64 in 1996 and set the template for 3D platformers, camera struggles included. Everyone else spent years catching up.",
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
          "What was the Japanese name of the 1983 Nintendo console that reached the West as the NES?",
        choices: ["Family Computer (Famicom)", "Super Famicom", "PC Engine", "Color TV-Game"],
        correctIndex: 0,
        canonicalFact:
          "The Nintendo Entertainment System was released in Japan in 1983 as the Family Computer, or Famicom.",
        explanation:
          "Nintendo launched the console in Japan in 1983 as the Family Computer (Famicom); the West received it as the NES in 1985. Same box, different accent.",
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
      approved: false,
      reviewer: null,
      reviewedAt: null,
      factualState: "DRAFT",
      comedyState: "DRAFT",
      comedyRating: null,
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
          "Roman legend says the city was founded by which twin, right after a fatal disagreement with his brother Remus?",
        choices: ["Romulus", "Remus", "Julius Caesar", "Augustus"],
        correctIndex: 0,
        canonicalFact:
          "According to Roman legend, Romulus founded Rome and killed his twin brother Remus.",
        explanation:
          "Legend credits Romulus with founding Rome in 753 BC after killing his twin Remus. A sibling squabble that escalated into an empire.",
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
          "In which year did a group of senators turn the Ides of March into a very bad day for Julius Caesar?",
        choices: ["44 BC", "27 BC", "14 AD", "63 BC"],
        correctIndex: 0,
        canonicalFact: "Julius Caesar was assassinated on the Ides of March, 15 March, in 44 BC.",
        explanation:
          "Julius Caesar was assassinated on 15 March, 44 BC, the Ides of March. Roughly sixty conspirators turned up, which is not subtle.",
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
          "Which emperor drew a hard line across northern Britain around 122 AD, building a wall that still bears his name?",
        choices: ["Hadrian", "Trajan", "Nero", "Augustus"],
        correctIndex: 0,
        canonicalFact:
          "Emperor Hadrian ordered the building of Hadrian's Wall across northern Britain, begun around 122 AD.",
        explanation:
          "Hadrian ordered his namesake wall across northern Britain around 122 AD. Nothing says imperial confidence like naming a wall after yourself.",
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
          "Which philosopher-emperor was the last of the 'Five Good Emperors,' right before the streak ended with his son?",
        choices: ["Marcus Aurelius", "Commodus", "Trajan", "Nerva"],
        correctIndex: 0,
        canonicalFact:
          "Marcus Aurelius, who reigned from 161 to 180 AD, was the last of the Five Good Emperors.",
        explanation:
          "Marcus Aurelius, the philosopher-emperor who wrote Meditations, was the last of the Five Good Emperors. His son Commodus promptly ended the good run.",
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
      approved: false,
      reviewer: null,
      reviewedAt: null,
      factualState: "DRAFT",
      comedyState: "DRAFT",
      comedyRating: null,
    },
  },
];
