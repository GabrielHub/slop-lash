import type { QuizslopCatalogTopic } from "../types";

export const QUIZSLOP_SCIENCE_GEOGRAPHY_TOPICS: readonly QuizslopCatalogTopic[] = [
  {
    id: "cat-solar-system",
    label: "The Solar System",
    category: "SCIENCE_NATURE",
    scope: "The eight planets of our Solar System, the Sun, and their major moons.",
    exclusions: ["Exoplanets and other star systems", "Discoveries after 2024"],
    canonicalKey: "904241f285260bdbb917373980cb0667f1ee48b6acb87183ad14065f93c22fec",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-solar-system-q1",
        tier: "EASY",
        neutralQuestion: "Which planet orbits closest to the Sun?",
        displayPrompt:
          "Which planet drew the short straw and orbits closest to the Sun, sunburn and all?",
        choices: ["Mercury", "Venus", "Mars", "Earth"],
        correctIndex: 0,
        canonicalFact: "Mercury is the planet closest to the Sun.",
        explanation:
          "Mercury is the closest planet to the Sun, orbiting at about 58 million kilometres. Somebody has to take the front-row seat.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Mercury_(planet)",
            title: "Mercury (planet) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "a279b171d59f9377916ec831cfed470167d5e8ca9fb18695b7498170055b4392",
            supportExcerpt:
              "Mercury is the first planet from the Sun and the smallest in the Solar System, orbiting the Sun at an average distance of about 58 million kilometres.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-solar-system-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which planet has an axial tilt of about 98 degrees, effectively rotating on its side?",
        displayPrompt:
          "Which planet gave up sitting upright and rolls around the Sun tilted almost fully on its side?",
        choices: ["Uranus", "Neptune", "Saturn", "Mars"],
        correctIndex: 0,
        canonicalFact:
          "Uranus has an axial tilt near 98 degrees, so it rotates almost on its side.",
        explanation:
          "Uranus is tilted about 98 degrees, so it essentially rotates on its side. It commits to the bit for its entire 84-year orbit.",
        comedyDevices: ["ANTHROPOMORPHISM"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Uranus",
            title: "Uranus - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "34ef768584071602fd731fb402009c7a0fe79bd81446d3341d81347a199e2fa6",
            supportExcerpt:
              "Uranus has a unique configuration because its axis of rotation is tilted sideways, nearly into the plane of its solar orbit, at about 98 degrees.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-solar-system-q3",
        tier: "HARD",
        neutralQuestion: "Which moon is the largest in the Solar System?",
        displayPrompt:
          "Which moon is so oversized it outbulks the planet Mercury, quietly embarrassing an entire planet?",
        choices: ["Ganymede", "Titan", "Callisto", "Europa"],
        correctIndex: 0,
        canonicalFact:
          "Ganymede, a moon of Jupiter, is the largest moon in the Solar System and is larger than the planet Mercury.",
        explanation:
          "Ganymede, one of Jupiter's moons, is the Solar System's largest moon and bigger than Mercury. A moon outgrew a planet and nobody brings it up.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Ganymede_(moon)",
            title: "Ganymede (moon) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "308682b8d987e9eccf8e0f21764bb2725354f0b0b40c2cb7654e555b5c96bf8b",
            supportExcerpt:
              "Ganymede is the largest and most massive natural satellite in the Solar System, and is larger than the planet Mercury, though less massive.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-solar-system-q4",
        tier: "INSANE",
        neutralQuestion:
          "About how many Earth days does one full rotation, a sidereal day, on Venus take?",
        displayPrompt:
          "A day on Venus outlasts its own year. Roughly how many Earth days does a single Venus rotation drag on for?",
        choices: [
          "About 243 Earth days",
          "About 88 Earth days",
          "About 24 Earth hours",
          "About 59 Earth days",
        ],
        correctIndex: 0,
        canonicalFact:
          "Venus takes about 243 Earth days to complete one sidereal rotation, longer than its roughly 225-day orbit.",
        explanation:
          "Venus takes roughly 243 Earth days to spin once, longer than its 225-day orbit around the Sun. Its day is genuinely older than its year.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Venus",
            title: "Venus - Wikipedia",
            locator: "Orbit and rotation",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "c34594eea21bcff1e600dbf54ac653b32f43f2f462a980d24fab528ff8f4b755",
            supportExcerpt:
              "Venus rotates once every 243 Earth days, the slowest rotation of any planet, and its sidereal day is longer than its orbital period of about 225 Earth days.",
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
    id: "cat-sharks-ocean",
    label: "Sharks & Ocean Life",
    category: "SCIENCE_NATURE",
    scope: "Sharks and ocean creatures: their biology, sizes, and behaviour.",
    exclusions: ["Freshwater species", "Prehistoric species such as megalodon"],
    canonicalKey: "f615ce97b77ea2785f57872c9f40158d6682c4ab8395d1b37fc1c11605436785",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-sharks-ocean-q1",
        tier: "EASY",
        neutralQuestion: "What is the largest living species of fish?",
        displayPrompt:
          "Which spotted heavyweight holds the title of largest fish in the sea while posing basically zero threat to swimmers?",
        choices: ["Whale shark", "Great white shark", "Basking shark", "Blue marlin"],
        correctIndex: 0,
        canonicalFact:
          "The whale shark is the largest living fish species, reaching lengths over 12 metres.",
        explanation:
          "The whale shark is the largest living fish, reaching over 12 metres. It filter-feeds on plankton, a diet remarkably humble for its size.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Whale_shark",
            title: "Whale shark - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "297ed42aeefc09ad605b94f0de4f0d7c8c8f61dbe9df1577744c3f8748a703a0",
            supportExcerpt:
              "The whale shark is a slow-moving, filter-feeding carpet shark and the largest known extant fish species, with the largest confirmed individuals reaching lengths over 12 metres.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-sharks-ocean-q2",
        tier: "MEDIUM",
        neutralQuestion: "How many hearts does an octopus have?",
        displayPrompt:
          "An octopus runs its circulatory system on how many hearts, because apparently eight arms needed backup?",
        choices: ["Three", "One", "Two", "Eight"],
        correctIndex: 0,
        canonicalFact: "An octopus has three hearts: two branchial hearts and one systemic heart.",
        explanation:
          "An octopus has three hearts, two pumping blood through the gills and one for the rest of the body. The main heart even stops beating when it swims.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Octopus",
            title: "Octopus - Wikipedia",
            locator: "Circulatory system",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "1d51898a39442848c32f6f47f2b6f2fb1388b9dc4e9739e93996db54e37791f6",
            supportExcerpt:
              "An octopus has three hearts: two branchial hearts pump blood through each of the two gills, while the third systemic heart pumps blood through the body.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-sharks-ocean-q3",
        tier: "HARD",
        neutralQuestion:
          "Shark skeletons are made primarily of what flexible material rather than bone?",
        displayPrompt:
          "Sharks skip bone entirely and build their whole skeleton out of which lighter, bendier material?",
        choices: ["Cartilage", "Keratin", "Chitin", "Enamel"],
        correctIndex: 0,
        canonicalFact:
          "Sharks are cartilaginous fish; their skeletons are made of cartilage instead of bone.",
        explanation:
          "Sharks are cartilaginous fish, so their skeletons are built from cartilage instead of bone. It keeps them light enough to avoid simply sinking.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Chondrichthyes",
            title: "Chondrichthyes - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "440769b6264a3bc16ea88817124ee11f1568c4f89fd2f20c22361530b91b1be8",
            supportExcerpt:
              "Chondrichthyes, which includes sharks, rays and skates, are jawed fish with paired fins and skeletons made of cartilage rather than bone.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-sharks-ocean-q4",
        tier: "INSANE",
        neutralQuestion:
          "The Greenland shark is estimated to reach sexual maturity at roughly what age?",
        displayPrompt:
          "The unhurried Greenland shark only reaches maturity at roughly what age, making human adolescence look brisk?",
        choices: ["About 150 years", "About 15 years", "About 50 years", "About 400 years"],
        correctIndex: 0,
        canonicalFact:
          "Greenland sharks are estimated to reach sexual maturity at around 150 years of age.",
        explanation:
          "Greenland sharks are thought to reach sexual maturity near 150 years old. They treat middle age as a distant rumour.",
        comedyDevices: ["AFFECTIONATE_ROAST", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Greenland_shark",
            title: "Greenland shark - Wikipedia",
            locator: "Longevity",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "d84438352b9396434b36b562e83de67ce1fcff5aee5f460187b7ff2386c57bda",
            supportExcerpt:
              "Radiocarbon analysis of eye lenses estimated the age at sexual maturity of the Greenland shark to be at least about 150 years, with lifespans potentially reaching several centuries.",
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
    id: "cat-world-capitals",
    label: "World Capitals",
    category: "GEOGRAPHY",
    scope: "The current national capital cities of countries around the world.",
    exclusions: ["Former or historical capitals", "Disputed capital claims"],
    canonicalKey: "862a9ab92b2703b4fc6efa5b9665a62126d77e1adaa1c76949077c785b813b0e",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-world-capitals-q1",
        tier: "EASY",
        neutralQuestion: "What is the capital city of Japan?",
        displayPrompt:
          "Which sprawling metropolis serves as Japan's capital and busiest transit puzzle?",
        choices: ["Tokyo", "Kyoto", "Osaka", "Seoul"],
        correctIndex: 0,
        canonicalFact: "Tokyo is the capital of Japan.",
        explanation:
          "Tokyo is Japan's capital and largest city. Kyoto held the title for over a thousand years before Tokyo took over in 1868.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Tokyo",
            title: "Tokyo - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "11811a1b4327cd2ad45615768991c83a16895643409672742d7631ce371e6d85",
            supportExcerpt:
              "Tokyo is the capital and most populous city of Japan, having become the de facto capital when the emperor moved there from Kyoto in 1868.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-world-capitals-q2",
        tier: "MEDIUM",
        neutralQuestion: "What is the capital city of Australia?",
        displayPrompt:
          "Which planned city is Australia's capital, chosen mainly so Sydney and Melbourne would stop bickering?",
        choices: ["Canberra", "Sydney", "Melbourne", "Perth"],
        correctIndex: 0,
        canonicalFact:
          "Canberra is the capital of Australia, a planned city sited between Sydney and Melbourne.",
        explanation:
          "Canberra is Australia's capital, purpose-built as a compromise between rivals Sydney and Melbourne. A whole city as a peace treaty.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Canberra",
            title: "Canberra - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "bf299e6de4ec5b6c2c2e05dea109d0540f75ea33947696303c41f5963df4f467",
            supportExcerpt:
              "Canberra is the capital city of Australia, a planned city whose location was selected in 1908 as a compromise between the rivals Sydney and Melbourne.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-world-capitals-q3",
        tier: "HARD",
        neutralQuestion: "What is the capital city of Brazil?",
        displayPrompt:
          "Which purpose-built inland city became Brazil's capital in 1960, laid out from above in the shape of an aeroplane?",
        choices: ["Brasília", "Rio de Janeiro", "São Paulo", "Salvador"],
        correctIndex: 0,
        canonicalFact:
          "Brasília has been the capital of Brazil since 1960; its pilot plan resembles an aeroplane.",
        explanation:
          "Brazil moved its capital to the newly built Brasília in 1960. Its master plan famously resembles an aeroplane, ambition included.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Bras%C3%ADlia",
            title: "Brasília - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "82fe9889605f878dbf0ac1977c89eb18805b413ea35dc8f854f937b6febd6612",
            supportExcerpt:
              "Brasília is the federal capital of Brazil, inaugurated in 1960; its Pilot Plan, designed by Lúcio Costa, is often described as resembling the shape of an aeroplane.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-world-capitals-q4",
        tier: "INSANE",
        neutralQuestion: "What is the capital city of Myanmar?",
        displayPrompt:
          "Which purpose-built city quietly replaced Yangon as Myanmar's capital around 2006, famous for eerily empty 20-lane roads?",
        choices: ["Naypyidaw", "Yangon", "Mandalay", "Bagan"],
        correctIndex: 0,
        canonicalFact:
          "Naypyidaw became the capital of Myanmar around 2005-2006, replacing Yangon.",
        explanation:
          "Myanmar shifted its capital to the newly constructed Naypyidaw around 2005-2006. Its enormous, near-empty highways are the stuff of travel legend.",
        comedyDevices: ["INCONGRUITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Naypyidaw",
            title: "Naypyidaw - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "2a3e44e661aecab92b9b58609a7812c541520bb5a4a0885ce87f01e3cc23e4ca",
            supportExcerpt:
              "Naypyidaw is the capital city of Myanmar; the government officially designated it as the capital in 2006, replacing the former capital Yangon.",
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
