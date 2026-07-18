import type { QuizslopCatalogTopic } from "../types";

/**
 * Additional reviewed QuizSlop topic packs. Same authored-content contract as
 * the other topic-catalog-*.ts modules: every fact carries retained source
 * evidence, and canonical keys and content hashes are frozen digests re-derived
 * by catalog tasks. These packs were approved for production by a named human
 * reviewer (Gabriel Ong) on 2026-07-18; agents must never flip approval on their
 * own, only at a reviewer's explicit direction.
 */
export const QUIZSLOP_ADDITIONS_TOPICS: readonly QuizslopCatalogTopic[] = [
  {
    id: "cat-greek-mythology",
    label: "Greek Mythology",
    category: "ARTS_CULTURE",
    scope: "The gods, heroes, and monsters of ancient Greek mythology.",
    exclusions: ["Roman mythology and Roman god names", "Modern fantasy adaptations"],
    canonicalKey: "cc1d601e118fd4f577baae66fe8a6d98472a5b226e1b4f1958b3656bf5cfd3f0",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-greek-mythology-q1",
        tier: "EASY",
        neutralQuestion:
          "Who is the king of the gods in Greek mythology, ruling from Mount Olympus?",
        displayPrompt:
          "Which thunderbolt-slinging king of the Greek gods runs the whole operation from the top of Mount Olympus?",
        choices: ["Zeus", "Poseidon", "Hades", "Apollo"],
        correctIndex: 0,
        canonicalFact:
          "Zeus is the king of the gods in Greek mythology and rules from Mount Olympus.",
        explanation:
          "Zeus rules the Greek gods from Mount Olympus, thunderbolt in hand. His management style leans heavily on smiting first and explaining later.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Zeus",
            title: "Zeus - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "1177066c8a2d2bfbf2d80af0fd6db8669019b5ed5a15d876dbb37c8f976aff12",
            supportExcerpt:
              "Zeus is the sky and thunder god in ancient Greek religion and mythology, who rules as king of the gods of Mount Olympus.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-greek-mythology-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "In Greek myth, which hero was left vulnerable only at the heel after being dipped in the River Styx?",
        displayPrompt:
          "Which Greek hero was dipped in the River Styx for invincibility, spoiled only by the one spot his mother used as a handle?",
        choices: ["Achilles", "Hector", "Perseus", "Odysseus"],
        correctIndex: 0,
        canonicalFact:
          "In later Greek myth, Achilles was invulnerable except at the heel by which his mother held him in the River Styx.",
        explanation:
          "Achilles was dipped in the River Styx to make him invulnerable, but the heel his mother gripped stayed dry. One overlooked spot, one extremely famous idiom.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Achilles",
            title: "Achilles - Wikipedia",
            locator: "Achilles heel",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "95590df53691b88a99d885e7235bf2a5ca8989e21c664de65f28ebbbc2ef0181",
            supportExcerpt:
              "In later legend, Achilles was made invulnerable except for his heel, by which his mother Thetis held him as she dipped him in the River Styx.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-greek-mythology-q3",
        tier: "HARD",
        neutralQuestion:
          "In Greek myth, which many-headed serpent grew two heads for each one cut off, until Heracles defeated it?",
        displayPrompt:
          "Which many-headed swamp serpent answered every beheading by sprouting two more heads, until Heracles finally out-thought it?",
        choices: ["The Lernaean Hydra", "The Chimera", "Cerberus", "The Minotaur"],
        correctIndex: 0,
        canonicalFact:
          "The Lernaean Hydra grew two heads for each one severed and was slain by Heracles as one of his Twelve Labours.",
        explanation:
          "The Lernaean Hydra grew two heads for every one cut off, so Heracles had a helper sear each stump shut. A monster beaten less by muscle than by decent teamwork.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Lernaean_Hydra",
            title: "Lernaean Hydra - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "1e2eed571088fafb916b04015377a685f77a3ba50090e02a675d9d2189a03897",
            supportExcerpt:
              "The Lernaean Hydra was a serpentine water monster that grew two heads for each one cut off; Heracles slew it as the second of his Twelve Labours.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-greek-mythology-q4",
        tier: "INSANE",
        neutralQuestion:
          "In Greek myth, which Titan was condemned to hold up the sky for eternity?",
        displayPrompt:
          "Which Titan drew the eternal punishment of holding up the sky, the least restful posting on any Greek myth org chart?",
        choices: ["Atlas", "Prometheus", "Cronus", "Helios"],
        correctIndex: 0,
        canonicalFact:
          "The Titan Atlas was condemned to hold up the sky, or heavens, for eternity.",
        explanation:
          "Atlas was sentenced to hold up the sky forever after the Titans lost their war with the gods. A permanent posting with no chair, no breaks, and ruinous shoulder posture.",
        comedyDevices: ["AFFECTIONATE_ROAST", "UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Atlas_(mythology)",
            title: "Atlas (mythology) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "ecfaf324f4445cb4d15b6ae021513f16575fc00a887a0e483563c98cd121d361",
            supportExcerpt:
              "In Greek mythology, Atlas is a Titan condemned to hold up the heavens or sky for eternity after the Titanomachy, the war between the Titans and the Olympian gods.",
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
    id: "cat-human-body",
    label: "The Human Body",
    category: "SCIENCE_NATURE",
    scope: "The organs, bones, and systems of the human body.",
    exclusions: ["Specific diseases or conditions", "Individual genetics"],
    canonicalKey: "f05842f68c2206f1afbf3ab525a1013ee1063f6db444197297fce45a68a0e0c9",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-human-body-q1",
        tier: "EASY",
        neutralQuestion:
          "What is the largest organ of the human body?",
        displayPrompt:
          "Which sprawling, waterproof organ is technically the largest one you own, and you wear it on the outside?",
        choices: ["The skin", "The liver", "The heart", "The brain"],
        correctIndex: 0,
        canonicalFact:
          "The skin is the largest organ of the human body.",
        explanation:
          "The skin is the body's largest organ, roughly two square metres in an adult. The only organ you can accidentally leave in the sun too long.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Skin",
            title: "Skin - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "18d379480d31fb2295963e6f3a3e140c3be4fd8f2a7afa812c2cec41eeae5900",
            supportExcerpt:
              "In humans, the skin is the largest organ of the body, with a total area of about two square metres, serving as a barrier against the external environment.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-human-body-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "How many bones are there in a typical adult human skeleton?",
        displayPrompt:
          "A typical adult human skeleton is assembled from roughly how many separate bones?",
        choices: ["206", "150", "312", "98"],
        correctIndex: 0,
        canonicalFact:
          "A typical adult human skeleton has 206 bones.",
        explanation:
          "The adult human skeleton has 206 bones. Babies start with a good many more, but plenty quietly fuse together during growth, trimming the parts list.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Human_skeleton",
            title: "Human skeleton - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "24c269be022247b0f0a32982e1b02c75396ffeacc1a38fe6290d5a67c1026b1e",
            supportExcerpt:
              "The adult human skeleton is composed of 206 bones; at birth the skeleton has more bones, many of which fuse together during growth and development.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-human-body-q3",
        tier: "HARD",
        neutralQuestion:
          "What is the smallest bone in the human body, located in the middle ear?",
        displayPrompt:
          "Which is the smallest bone in the whole human body, tucked away doing quiet work in your middle ear?",
        choices: ["The stapes", "The femur", "The patella", "The clavicle"],
        correctIndex: 0,
        canonicalFact:
          "The stapes, in the middle ear, is the smallest bone in the human body.",
        explanation:
          "The stapes, a stirrup-shaped bone in the middle ear, is the smallest in the body at a few millimetres. It helps you hear and would sit comfortably on a grain of rice.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Stapes",
            title: "Stapes - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "6d6c102a9e0c0e2c713dfc42620fdf45f7f14a66f4ae7f990fb32954079f76c3",
            supportExcerpt:
              "The stapes is a stirrup-shaped bone in the middle ear; it is the smallest and lightest named bone in the human body.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-human-body-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which human organ can regrow much of its mass after part of it is removed?",
        displayPrompt:
          "Which human organ can regrow much of itself after a chunk is removed, making it the closest thing you have to a spare?",
        choices: ["The liver", "The heart", "The brain", "The spleen"],
        correctIndex: 0,
        canonicalFact:
          "The liver can regenerate lost tissue and regrow much of its mass after part of it is removed.",
        explanation:
          "The liver can regenerate, regrowing much of its mass even after a large portion is removed, which is what makes living donation possible. It treats damage like a to-do list.",
        comedyDevices: ["ANTHROPOMORPHISM"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Liver",
            title: "Liver - Wikipedia",
            locator: "Regeneration",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "549903e80137d52d5d4f75bfed433fd5eeae738f2cc668ef1a38f55ac39615ec",
            supportExcerpt:
              "The liver is unusual among organs in its capacity to regenerate, regrowing lost tissue and restoring much of its original mass after partial surgical removal.",
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
    id: "cat-famous-paintings",
    label: "Famous Paintings",
    category: "ARTS_CULTURE",
    scope: "Well-known paintings from art history and the artists who made them.",
    exclusions: ["Art valuations or auction prices", "Living contemporary artists"],
    canonicalKey: "5a1e2fb463bbbc79249e1e6e725f3883121f9aa83e90d9123d9a1332b6822c20",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-famous-paintings-q1",
        tier: "EASY",
        neutralQuestion:
          "Which artist painted the Mona Lisa?",
        displayPrompt:
          "Which Renaissance polymath painted the Mona Lisa, the small portrait now guarded behind a crowd and a lot of glass?",
        choices: ["Leonardo da Vinci", "Michelangelo", "Raphael", "Botticelli"],
        correctIndex: 0,
        canonicalFact:
          "Leonardo da Vinci painted the Mona Lisa.",
        explanation:
          "Leonardo da Vinci painted the Mona Lisa in the early 1500s. It is surprisingly small, a fact every first-time Louvre visitor discovers with visible disappointment.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Mona_Lisa",
            title: "Mona Lisa - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "9bb72c446e1fb82203037c53c9182c26132091dffa6129515f87587ef4c05a7e",
            supportExcerpt:
              "The Mona Lisa is a half-length portrait painting by the Italian artist Leonardo da Vinci; held at the Louvre in Paris, it is famously smaller than many visitors expect.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-famous-paintings-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which Dutch post-Impressionist painter created 'The Starry Night'?",
        displayPrompt:
          "Which Dutch post-Impressionist swirled 'The Starry Night' into being during an 1889 stay at an asylum?",
        choices: ["Vincent van Gogh", "Claude Monet", "Paul Cézanne", "Edvard Munch"],
        correctIndex: 0,
        canonicalFact:
          "Vincent van Gogh painted 'The Starry Night' in 1889.",
        explanation:
          "Vincent van Gogh painted 'The Starry Night' in 1889 from a room at the Saint-Rémy asylum, largely from memory. He sold almost nothing alive and now anchors gift shops worldwide.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Starry_Night",
            title: "The Starry Night - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "5aabccd8294521b0e01d3ecff67167266704722410abc129bdafd8ed5110afb9",
            supportExcerpt:
              "The Starry Night is an oil-on-canvas painting by the Dutch post-Impressionist painter Vincent van Gogh, painted in June 1889, depicting the view from his asylum room at Saint-Rémy.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-famous-paintings-q3",
        tier: "HARD",
        neutralQuestion:
          "Which Surrealist artist painted 'The Persistence of Memory', famous for its melting clocks?",
        displayPrompt:
          "Which moustachioed Surrealist draped soft, melting clocks across a landscape in 'The Persistence of Memory'?",
        choices: ["Salvador Dalí", "René Magritte", "Joan Miró", "Max Ernst"],
        correctIndex: 0,
        canonicalFact:
          "Salvador Dalí painted 'The Persistence of Memory', known for its melting clocks.",
        explanation:
          "Salvador Dalí painted the melting clocks of 'The Persistence of Memory' in 1931. He claimed the soft watches were inspired by a wheel of Camembert melting in the sun.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Persistence_of_Memory",
            title: "The Persistence of Memory - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "743e12039eaeb89de1ada3f7b78419e08375d8a650fff3fbdc5fe222d27e9abb",
            supportExcerpt:
              "The Persistence of Memory is a 1931 painting by the Surrealist Salvador Dalí, one of the most recognisable Surrealist works, known for its depiction of soft, melting pocket watches.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-famous-paintings-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which Dutch Golden Age master painted the large group portrait known as 'The Night Watch'?",
        displayPrompt:
          "Which Dutch Golden Age master painted the enormous militia group portrait now known as 'The Night Watch'?",
        choices: ["Rembrandt", "Johannes Vermeer", "Frans Hals", "Jan Steen"],
        correctIndex: 0,
        canonicalFact:
          "Rembrandt painted 'The Night Watch' in 1642.",
        explanation:
          "Rembrandt finished 'The Night Watch' in 1642. It is not really a night scene; centuries of grime darkened the varnish until people assumed the militia worked the late shift.",
        comedyDevices: ["INCONGRUITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Night_Watch",
            title: "The Night Watch - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "058ea206735e6a8174dc9e8fdb0915ecce29698ebfb2537906f86052b8fc1980",
            supportExcerpt:
              "The Night Watch is a 1642 painting by Rembrandt; its popular name is misleading, as the scene is set in daytime but a darkened varnish long made it appear to be a night scene.",
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
    id: "cat-chinese-cuisine",
    label: "Chinese Cuisine",
    category: "FOOD_DRINK",
    scope: "Chinese cuisine: its famous dishes, ingredients, and traditions.",
    exclusions: ["Specific restaurant chains", "Health or diet claims"],
    canonicalKey: "48c3af0249a7e6b45e0b6c7700b6a26dfaa06afe4e4822f25a253a6638d42715",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-chinese-cuisine-q1",
        tier: "EASY",
        neutralQuestion:
          "Peking duck takes its name from the older Western spelling of which Chinese city?",
        displayPrompt:
          "Peking duck, that lacquered, crispy-skinned classic, is named after the older Western spelling of which city?",
        choices: ["Beijing", "Shanghai", "Hong Kong", "Guangzhou"],
        correctIndex: 0,
        canonicalFact:
          "Peking duck is named after Peking, the older Western spelling of Beijing.",
        explanation:
          "Peking duck is named after Peking, the older romanisation of Beijing. The dish kept the vintage spelling long after the maps quietly updated.",
        comedyDevices: ["WORDPLAY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Peking_duck",
            title: "Peking duck - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "233cec49d79b10037df0f06b228e46be3e5c8e3c7a5edbbfefac09448fcd20f2",
            supportExcerpt:
              "Peking duck is a dish from Beijing that has been prepared since the imperial era; its name uses Peking, the former Western romanisation of the city now written as Beijing.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-chinese-cuisine-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which savoury flavour enhancer, long unfairly blamed for a range of reactions, is used in some Chinese cooking?",
        displayPrompt:
          "Which savoury flavour enhancer, long unfairly blamed for a list of ills, turns up in some Chinese cooking?",
        choices: ["MSG (monosodium glutamate)", "Baking soda", "Cream of tartar", "Saltpetre"],
        correctIndex: 0,
        canonicalFact:
          "MSG, monosodium glutamate, is a savoury flavour enhancer used in some Chinese and other cooking.",
        explanation:
          "MSG, or monosodium glutamate, deepens savoury umami flavour. Decades of scare stories about it have been steadily walked back by the science.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Monosodium_glutamate",
            title: "Monosodium glutamate - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "4ab1d2df2a87e94d0a2ce59f6ad22a6a5fc3f13916b5aaa46e39c6bdf55d27ab",
            supportExcerpt:
              "Monosodium glutamate (MSG) is a flavour enhancer that adds a savoury umami taste; the belief that it causes a distinct set of symptoms has not been supported by scientific evidence.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-chinese-cuisine-q3",
        tier: "HARD",
        neutralQuestion:
          "The fortune cookie, common in American Chinese restaurants, is generally thought to have originated in which country?",
        displayPrompt:
          "The fortune cookie, a staple of American Chinese takeout, is generally traced back to which country rather than China?",
        choices: ["Japan", "China", "Vietnam", "Thailand"],
        correctIndex: 0,
        canonicalFact:
          "Fortune cookies are generally thought to have originated in Japan, not China, before becoming popular in the United States.",
        explanation:
          "The fortune cookie traces back to a 19th-century Japanese cracker, not China, then spread through American restaurants. A Japanese snack, adopted by Chinese takeout, sold worldwide.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Fortune_cookie",
            title: "Fortune cookie - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "935503ed0bc8e115f29f2abe1a966ec1c042cf8eca9839e4d7b2aa843d4b040d",
            supportExcerpt:
              "Fortune cookies are most likely based on a 19th-century Japanese cracker called tsujiura senbei and were popularised in the United States; they are not a traditional Chinese custom.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-chinese-cuisine-q4",
        tier: "INSANE",
        neutralQuestion:
          "Sichuan cuisine is known for a tingling, numbing mouth sensation produced mainly by which ingredient?",
        displayPrompt:
          "Sichuan cooking is famous for a tingling, lip-numbing buzz that comes mainly from which single ingredient?",
        choices: ["Sichuan peppercorn", "Star anise", "Fresh ginger", "Five-spice powder"],
        correctIndex: 0,
        canonicalFact:
          "The tingling, numbing sensation in Sichuan cuisine comes mainly from the Sichuan peppercorn.",
        explanation:
          "The signature numbing tingle of Sichuan food, called 'má', comes from the Sichuan peppercorn, not chili heat. It briefly convinces your lips they have fallen asleep.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Sichuan_pepper",
            title: "Sichuan pepper - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "23b2db473e28d6bba504ef9ce8f4d7227fd9003998171e2212f42ebb6d49a937",
            supportExcerpt:
              "Sichuan pepper produces a tingling, numbing sensation in the mouth, described in Chinese as má, which is a defining characteristic of Sichuan cuisine.",
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
    id: "cat-programming",
    label: "Programming",
    category: "INTERNET_TECH",
    scope: "Programming languages, concepts, and history.",
    exclusions: ["Specific framework version numbers", "Current job-market trends"],
    canonicalKey: "af83b1be62d115ee4f2849677192073323608b0eefa3a3f6f821a2e7460e0c8a",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-programming-q1",
        tier: "EASY",
        neutralQuestion:
          "What is the general term for an error in a program that causes it to behave incorrectly?",
        displayPrompt:
          "What is the general name for a flaw in a program that makes it misbehave, famously immortalised by a moth in 1947?",
        choices: ["A bug", "A byte", "A cache", "A loop"],
        correctIndex: 0,
        canonicalFact:
          "A bug is an error or flaw in a program that causes it to behave incorrectly.",
        explanation:
          "A bug is a flaw that makes a program misbehave. The word stuck after a real moth was taped into a 1947 Harvard logbook as the 'first actual case of bug being found'.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Software_bug",
            title: "Software bug - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "82126fc4ab59121eee5bad4866beb18d3fff686ee23271e57f9531daf4c6ea1c",
            supportExcerpt:
              "A software bug is an error, flaw or fault in a computer program that causes it to produce an incorrect or unexpected result, or to behave in unintended ways.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-programming-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which programming language, released in 1991, is known for readable, indentation-based syntax and was named after a comedy troupe?",
        displayPrompt:
          "Which readable, indentation-based language from 1991 was named after a British comedy troupe rather than the snake?",
        choices: ["Python", "Java", "Ruby", "Cobra"],
        correctIndex: 0,
        canonicalFact:
          "Python, released in 1991 by Guido van Rossum, was named after the comedy group Monty Python.",
        explanation:
          "Python, released in 1991 by Guido van Rossum, took its name from Monty Python's Flying Circus, not the snake. The reptilian logo was a later, slightly confused addition.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Python_(programming_language)",
            title: "Python (programming language) - Wikipedia",
            locator: "History",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "9d30df9ae8cbf8e6e11b2b39420ce755218ba7fce1451576c1b711f79d11f91c",
            supportExcerpt:
              "Python was created by Guido van Rossum and first released in 1991; its name was inspired by the British comedy group Monty Python, not the snake.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-programming-q3",
        tier: "HARD",
        neutralQuestion:
          "Which programming language did Brendan Eich create in about ten days in 1995 for the Netscape browser?",
        displayPrompt:
          "Which language did Brendan Eich prototype in about ten days in 1995 for Netscape, a deadline that explains a lot?",
        choices: ["JavaScript", "Java", "PHP", "Perl"],
        correctIndex: 0,
        canonicalFact:
          "Brendan Eich created the first version of JavaScript in about ten days in 1995 at Netscape.",
        explanation:
          "Brendan Eich built the first JavaScript prototype in roughly ten days in 1995 at Netscape. A language that now runs much of the web was, at first, a two-week deadline.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/JavaScript",
            title: "JavaScript - Wikipedia",
            locator: "History",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "a7cbfab65bd422e80655d4a3050aec90a524d005707b85371cd389485a475762",
            supportExcerpt:
              "JavaScript was created in 1995 by Brendan Eich while he was working at Netscape; he wrote the first prototype of the language in about ten days.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-programming-q4",
        tier: "INSANE",
        neutralQuestion:
          "The name of the 1957 programming language FORTRAN is a contraction of which two words?",
        displayPrompt:
          "FORTRAN, the pioneering 1957 language for scientific computing, took its name as a contraction of which two words?",
        choices: ["Formula Translation", "Formal Transmission", "Forward Transfer", "Formatted Transistor"],
        correctIndex: 0,
        canonicalFact:
          "FORTRAN, released by IBM in 1957, is a contraction of 'Formula Translation'.",
        explanation:
          "FORTRAN, released by IBM in 1957 under John Backus, shortens 'Formula Translation'. One of the first high-level languages, and it still turns up in weather models today.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Fortran",
            title: "Fortran - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "20414078f30478f61761f2ce9e25dca5872e79a2129fc4dd47107eb6f4238ed5",
            supportExcerpt:
              "Fortran is a general-purpose programming language developed by IBM and first released in 1957; its name is derived from Formula Translation.",
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
    id: "cat-nba",
    label: "The NBA",
    category: "SPORTS",
    scope: "The National Basketball Association: its teams, players, and rules.",
    exclusions: ["Current-season standings or stats", "Records set after 2024"],
    canonicalKey: "b36827b2768dbc4bcfe8d03f6bd5a463c467e5e1d8d830d0872583e909333546",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-nba-q1",
        tier: "EASY",
        neutralQuestion:
          "How many players from one team are on the court at a time in an NBA game?",
        displayPrompt:
          "How many players from a single team are on the court at one time in an NBA game?",
        choices: ["Five", "Six", "Seven", "Four"],
        correctIndex: 0,
        canonicalFact:
          "Each NBA team has five players on the court at a time.",
        explanation:
          "Each NBA team fields five players at once. It is a small enough number that one cold shooting night is impossible to hide from the box score.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Basketball",
            title: "Basketball - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "6018c361bfd873dc5608ce1827a2070fbb90870f98ee0bfa7b84c7b56c7aa593",
            supportExcerpt:
              "Basketball is played by two teams of five players each on a rectangular court, and this five-a-side format is used in the National Basketball Association (NBA).",
            primary: true,
          },
        ],
      },
      {
        id: "cat-nba-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "With which team did Michael Jordan win six NBA championships in the 1990s?",
        displayPrompt:
          "Michael Jordan won six NBA championships during the 1990s with which team?",
        choices: ["Chicago Bulls", "Los Angeles Lakers", "Boston Celtics", "Detroit Pistons"],
        correctIndex: 0,
        canonicalFact:
          "Michael Jordan won six NBA championships with the Chicago Bulls in the 1990s.",
        explanation:
          "Michael Jordan won six titles with the Chicago Bulls in the 1990s, in two three-peats. He also retired twice mid-run, which only made the highlight reels longer.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Michael_Jordan",
            title: "Michael Jordan - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "89b20a6883d25faa7642cf009b1c5f7b7ba1bf7ca818746c3679ed123701e429",
            supportExcerpt:
              "Michael Jordan won six NBA championships with the Chicago Bulls during the 1990s, in two separate three-peats from 1991 to 1993 and 1996 to 1998.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-nba-q3",
        tier: "HARD",
        neutralQuestion:
          "Which player scored 100 points in a single NBA game in 1962, a record that still stands?",
        displayPrompt:
          "In 1962, which centre put up a staggering 100 points in a single NBA game, a record still unbeaten?",
        choices: ["Wilt Chamberlain", "Bill Russell", "Kareem Abdul-Jabbar", "Oscar Robertson"],
        correctIndex: 0,
        canonicalFact:
          "Wilt Chamberlain scored 100 points in a single NBA game in 1962, a record that still stands.",
        explanation:
          "Wilt Chamberlain dropped 100 points in one game in 1962, still the record. No video of it survives, only a photo of him holding a paper that reads 100.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Wilt_Chamberlain%27s_100-point_game",
            title: "Wilt Chamberlain's 100-point game - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "dd27ccc18bff0ce3eb568243a03d536578f084983b4ae145cceb48e2d7954e70",
            supportExcerpt:
              "On March 2, 1962, Wilt Chamberlain scored 100 points in a single NBA game for the Philadelphia Warriors, a record that still stands.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-nba-q4",
        tier: "INSANE",
        neutralQuestion:
          "The NBA championship trophy is named after which former NBA commissioner?",
        displayPrompt:
          "The trophy handed to the NBA champions each June is named after which former league commissioner?",
        choices: ["Larry O'Brien", "David Stern", "Adam Silver", "Maurice Podoloff"],
        correctIndex: 0,
        canonicalFact:
          "The NBA championship trophy is the Larry O'Brien Championship Trophy, named after the former commissioner.",
        explanation:
          "The NBA title trophy is the Larry O'Brien Championship Trophy, named for the 1970s commissioner. Millions cheer it every June without ever learning whose name it wears.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Larry_O%27Brien_Championship_Trophy",
            title: "Larry O'Brien Championship Trophy - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "a0087f9be4275e1e471bdfd52f2d62c5eab1c6a9c8e06a2a6090078f46e96db5",
            supportExcerpt:
              "The Larry O'Brien Championship Trophy is awarded to the NBA champions each year; it is named after Larry O'Brien, who served as NBA commissioner from 1975 to 1984.",
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
    id: "cat-music-general",
    label: "Music",
    category: "MUSIC",
    scope: "General music: instruments, terms, and notation.",
    exclusions: ["Chart positions or streaming numbers", "Specific artist discographies"],
    canonicalKey: "5e51243832a29eab802c69398a7c8028fac40a0317ab8dc11dcf1c578f734148",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-music-general-q1",
        tier: "EASY",
        neutralQuestion:
          "How many strings does a standard guitar have?",
        displayPrompt:
          "A standard guitar is strung with how many strings?",
        choices: ["Six", "Four", "Eight", "Twelve"],
        correctIndex: 0,
        canonicalFact:
          "A standard guitar has six strings.",
        explanation:
          "A standard guitar has six strings. Twelve-string guitars exist for anyone who felt six was not quite enough to tune before every gig.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Guitar",
            title: "Guitar - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "aff25c14a8179510cb21d1bceb77b99354daf5f010b43c74ec33ec727b8efb63",
            supportExcerpt:
              "The guitar is a stringed musical instrument; the standard modern guitar typically has six strings, though variants such as the twelve-string guitar also exist.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-music-general-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "How many keys are there on a standard full-size piano?",
        displayPrompt:
          "A standard full-size piano has how many keys, black and white combined?",
        choices: ["88", "61", "100", "76"],
        correctIndex: 0,
        canonicalFact:
          "A standard full-size piano has 88 keys.",
        explanation:
          "A standard piano has 88 keys, 52 white and 36 black. A very specific number that generations of students have counted while avoiding actual practice.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Piano",
            title: "Piano - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "7ad3779e338d6acae79eb62aefcf1206baed2d7d64448026e080cc05ae51c548",
            supportExcerpt:
              "A modern full-size piano usually has 88 keys, spanning 52 white keys and 36 black keys over a range of just over seven octaves.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-music-general-q3",
        tier: "HARD",
        neutralQuestion:
          "Which Italian musical term means to play very loudly?",
        displayPrompt:
          "Which Italian musical term instructs a performer to play very loudly?",
        choices: ["Fortissimo", "Pianissimo", "Allegro", "Legato"],
        correctIndex: 0,
        canonicalFact:
          "In music, 'fortissimo' means to play very loudly.",
        explanation:
          "Fortissimo, marked ff, tells a musician to play very loudly. Its opposite, pianissimo, politely requests the reverse, and orchestras negotiate the gap nightly.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Dynamics_(music)",
            title: "Dynamics (music) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "c0de898f96df41e2607c0bc15e24f79922794c8bb0a73848c65f72d3270a6334",
            supportExcerpt:
              "In music, fortissimo (ff) is a dynamic marking meaning very loud, while pianissimo (pp) means very soft.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-music-general-q4",
        tier: "INSANE",
        neutralQuestion:
          "By international standard, the note A used for tuning is set at which frequency?",
        displayPrompt:
          "Orchestras usually tune to the note A, fixed by international standard at how many hertz?",
        choices: ["440 hertz", "261 hertz", "400 hertz", "512 hertz"],
        correctIndex: 0,
        canonicalFact:
          "The standard tuning pitch A above middle C is set at 440 hertz.",
        explanation:
          "Concert pitch fixes the A above middle C at 440 hertz, the note oboes play so everyone else can tune to it. A whole orchestra agreeing on one number, briefly.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/A440_(pitch_standard)",
            title: "A440 (pitch standard) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "4721074cdf3652ba7a8cb251182c9a31aa698aeb8c6c4b2525778358846c641f",
            supportExcerpt:
              "A440, the musical note A above middle C, has a frequency of 440 Hz and is the international standard pitch to which orchestras commonly tune.",
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
    id: "cat-movies-general",
    label: "Movies",
    category: "FILM_TV",
    scope: "Well-known films and filmmaking, broadly.",
    exclusions: ["Box-office figures", "Releases after 2024"],
    canonicalKey: "dc819cbc9951a9fbbbf4709186cd367caf160b09292f6c5a3f30d973528be9a6",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-movies-general-q1",
        tier: "EASY",
        neutralQuestion:
          "Which 1975 Steven Spielberg film about a great white shark is often called the first summer blockbuster?",
        displayPrompt:
          "Which 1975 Spielberg film about a great white shark practically invented the summer blockbuster?",
        choices: ["Jaws", "Titanic", "Alien", "King Kong"],
        correctIndex: 0,
        canonicalFact:
          "Jaws (1975), directed by Steven Spielberg, is often called the first summer blockbuster.",
        explanation:
          "Spielberg's Jaws (1975) is credited as the first summer blockbuster. The mechanical shark broke down so often that hiding it became the scariest choice in the film.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Jaws_(film)",
            title: "Jaws (film) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "3e0923aad15647be621447528cc2e8bbc5696ae3546abeb520b26c57782994d0",
            supportExcerpt:
              "Jaws is a 1975 American thriller film directed by Steven Spielberg; it is regarded as a watershed film and is often cited as the first summer blockbuster.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-movies-general-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "What was the first feature-length animated film released by Walt Disney, in 1937?",
        displayPrompt:
          "Which 1937 film was Walt Disney's first feature-length animated movie?",
        choices: ["Snow White and the Seven Dwarfs", "Pinocchio", "Cinderella", "Bambi"],
        correctIndex: 0,
        canonicalFact:
          "Snow White and the Seven Dwarfs (1937) was Walt Disney's first feature-length animated film.",
        explanation:
          "Snow White and the Seven Dwarfs (1937) was Disney's first feature-length cartoon. Critics dubbed it 'Disney's Folly' right up until it became a runaway hit.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Snow_White_and_the_Seven_Dwarfs_(1937_film)",
            title: "Snow White and the Seven Dwarfs (1937 film) - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "bdc55780ae4c17db8619253422b7641c73cc17ea86527272b2f76399545a9537",
            supportExcerpt:
              "Snow White and the Seven Dwarfs is a 1937 American animated film; it was the first full-length cel-animated feature film and the earliest Walt Disney animated feature.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-movies-general-q3",
        tier: "HARD",
        neutralQuestion:
          "Which 1939 film features the closing line 'Frankly, my dear, I don't give a damn'?",
        displayPrompt:
          "Which 1939 epic ends with the line 'Frankly, my dear, I don't give a damn'?",
        choices: ["Gone with the Wind", "Casablanca", "The Wizard of Oz", "Citizen Kane"],
        correctIndex: 0,
        canonicalFact:
          "The line 'Frankly, my dear, I don't give a damn' is from the 1939 film Gone with the Wind.",
        explanation:
          "That parting line belongs to Rhett Butler in Gone with the Wind (1939). The word 'damn' was scandalous enough to reportedly cost the studio a fine.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Frankly,_my_dear,_I_don%27t_give_a_damn",
            title: "Frankly, my dear, I don't give a damn - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "a4739054e58b974068619a7981174780e62631b0691691463e126e5a146d96ec",
            supportExcerpt:
              "'Frankly, my dear, I don't give a damn' is a line from the 1939 film Gone with the Wind, spoken by Rhett Butler to Scarlett O'Hara.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-movies-general-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which 1927 film is widely regarded as the first feature-length film with synchronised speech and song?",
        displayPrompt:
          "Which 1927 release is widely regarded as the first feature-length film with synchronised speech and song?",
        choices: ["The Jazz Singer", "Metropolis", "Nosferatu", "The Gold Rush"],
        correctIndex: 0,
        canonicalFact:
          "The Jazz Singer (1927) is widely regarded as the first feature-length film with synchronised speech and song.",
        explanation:
          "The Jazz Singer (1927) is credited as the first feature 'talkie', with synchronised speech and song. It quietly ended many silent-era careers almost overnight.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/The_Jazz_Singer",
            title: "The Jazz Singer - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "a31219c37f558364bfc49c15511715da9931df6218896f24954c5c2a4e120fa9",
            supportExcerpt:
              "The Jazz Singer is a 1927 American film; it was the first feature-length motion picture with synchronised recorded dialogue and singing, marking the decline of the silent film era.",
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
    id: "cat-dinosaurs",
    label: "Dinosaurs",
    category: "SCIENCE_NATURE",
    scope: "Dinosaurs and the prehistoric era, broadly.",
    exclusions: ["Non-dinosaur reptiles like pterosaurs", "Precise dating debates"],
    canonicalKey: "5ac9d54a7375a4dd723d6a4fcd686f2608b560190c9e3c9bf7fe3720f457abeb",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-dinosaurs-q1",
        tier: "EASY",
        neutralQuestion:
          "Which large carnivorous dinosaur's name means 'tyrant lizard king'?",
        displayPrompt:
          "Which fearsome carnivore's scientific name translates as 'tyrant lizard king'?",
        choices: ["Tyrannosaurus rex", "Velociraptor", "Stegosaurus", "Triceratops"],
        correctIndex: 0,
        canonicalFact:
          "The name Tyrannosaurus rex means 'tyrant lizard king'.",
        explanation:
          "Tyrannosaurus rex means 'tyrant lizard king', which is a lot of branding for one animal. Its tiny arms, famously, did not get the same confident treatment.",
        comedyDevices: ["WORDPLAY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Tyrannosaurus",
            title: "Tyrannosaurus - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "b5a11bc3dfc11641211ad863925bcced27c173480172c93473e85084faa72aa4",
            supportExcerpt:
              "The genus name Tyrannosaurus is derived from Greek words meaning 'tyrant lizard', and the species name rex means 'king' in Latin, giving 'tyrant lizard king'.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-dinosaurs-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which plant-eating dinosaur had a row of bony plates along its back and spikes on its tail?",
        displayPrompt:
          "Which plant-eater carried a double row of bony plates along its back and spikes on its tail?",
        choices: ["Stegosaurus", "Triceratops", "Brachiosaurus", "Ankylosaurus"],
        correctIndex: 0,
        canonicalFact:
          "Stegosaurus had bony plates along its back and spikes on its tail.",
        explanation:
          "Stegosaurus wore bony plates along its back and tail spikes now nicknamed the 'thagomizer'. Its brain, for the record, was roughly the size of a walnut.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Stegosaurus",
            title: "Stegosaurus - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "e121af2cd9a83e12cf7b696ba8f0f3a8e14a5fd13d1de0a10f5a4a777b770267",
            supportExcerpt:
              "Stegosaurus was a large, plated, herbivorous dinosaur with distinctive bony plates along its back and a spiked tail used for defence.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-dinosaurs-q3",
        tier: "HARD",
        neutralQuestion:
          "The word 'dinosaur', coined in 1842, comes from Greek words meaning what?",
        displayPrompt:
          "The word 'dinosaur', coined by Richard Owen in 1842, comes from Greek meaning what?",
        choices: ["Terrible lizard", "Ancient giant", "Stone beast", "Great serpent"],
        correctIndex: 0,
        canonicalFact:
          "The word 'dinosaur', coined by Richard Owen in 1842, means 'terrible lizard'.",
        explanation:
          "Richard Owen coined 'dinosaur' in 1842 from Greek for 'terrible', or fearfully great, 'lizard'. Many were neither terrible nor lizards, but the name tested well.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Dinosaur",
            title: "Dinosaur - Wikipedia",
            locator: "History of study",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "e8db373044013ff8483cf85cc78ddcf7ee70a58feffa94153002452b795dcd4d",
            supportExcerpt:
              "The word dinosaur was coined in 1842 by the palaeontologist Richard Owen from Greek elements meaning 'terrible' or 'fearfully great' and 'lizard'.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-dinosaurs-q4",
        tier: "INSANE",
        neutralQuestion:
          "Studies indicate the Velociraptor was roughly the size of which modern animal, smaller than films depict?",
        displayPrompt:
          "Real Velociraptors were feathered and roughly the size of which modern animal, far smaller than the films suggest?",
        choices: ["A turkey", "A horse", "A lion", "An elephant"],
        correctIndex: 0,
        canonicalFact:
          "The real Velociraptor was feathered and roughly the size of a turkey, far smaller than film versions.",
        explanation:
          "The real Velociraptor was feathered and about turkey-sized, nothing like the film monsters, which were based more on the larger Deinonychus. Marketing outgrew the animal.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Velociraptor",
            title: "Velociraptor - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "0d61541849033f1888822a1756e07c4b629463f5c1fc96ec4413d97c448b5fd6",
            supportExcerpt:
              "Velociraptor was a small, feathered dromaeosaurid dinosaur roughly the size of a turkey, considerably smaller than the much larger reptiles portrayed in the Jurassic Park films.",
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
    id: "cat-hot-peppers",
    label: "Hot Peppers & Spice",
    category: "FOOD_DRINK",
    scope: "Chili peppers and spicy food: their heat, varieties, and chemistry.",
    exclusions: ["Current 'world's hottest' title holders", "Brand-name hot sauces"],
    canonicalKey: "78d471a2739d9f5b4ce0f3eb6d9a3c70e017563d31a7cb046e11e0af107429c9",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-hot-peppers-q1",
        tier: "EASY",
        neutralQuestion:
          "Which chemical compound gives chili peppers their spicy heat?",
        displayPrompt:
          "Which chemical compound is responsible for the burning heat of chili peppers?",
        choices: ["Capsaicin", "Caffeine", "Menthol", "Fructose"],
        correctIndex: 0,
        canonicalFact:
          "Capsaicin is the compound that gives chili peppers their heat.",
        explanation:
          "Capsaicin gives chili peppers their heat by triggering the same nerve receptors that sense real burning. Your mouth is essentially filing a false alarm.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Capsaicin",
            title: "Capsaicin - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "6d160b5d3929a30b83e8ccf4201dac0619dbe3c11f3cad8d92f78bcfd522fcbe",
            supportExcerpt:
              "Capsaicin is the active component of chili peppers responsible for their pungent, burning sensation; it activates heat and pain-sensing nerve receptors.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-hot-peppers-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "The heat of a chili pepper is measured in units on which named scale?",
        displayPrompt:
          "A chili pepper's heat is measured in units on which named scale?",
        choices: ["The Scoville scale", "The Richter scale", "The Mohs scale", "The Kelvin scale"],
        correctIndex: 0,
        canonicalFact:
          "Chili pepper heat is measured in Scoville Heat Units on the Scoville scale.",
        explanation:
          "Pepper heat is measured in Scoville Heat Units, devised by pharmacist Wilbur Scoville in 1912. His original test relied on brave humans tasting ever-weaker dilutions.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Scoville_scale",
            title: "Scoville scale - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "b30cc6a3d738ac1747e6901aed78458d4c967e928f9482689464a4b3fab1bfa1",
            supportExcerpt:
              "The Scoville scale measures the pungency of chili peppers in Scoville Heat Units (SHU); it was devised by pharmacist Wilbur Scoville in 1912.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-hot-peppers-q3",
        tier: "HARD",
        neutralQuestion:
          "Roughly how many Scoville Heat Units does a standard sweet bell pepper register?",
        displayPrompt:
          "On the Scoville scale, a standard sweet bell pepper registers roughly how many heat units?",
        choices: ["About 0", "About 5,000", "About 50,000", "About 1 million"],
        correctIndex: 0,
        canonicalFact:
          "A sweet bell pepper registers about 0 Scoville Heat Units, having effectively no capsaicin.",
        explanation:
          "The sweet bell pepper scores about zero on the Scoville scale, since it makes almost no capsaicin. A pepper that showed up to the heat contest and forgot the heat.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Bell_pepper",
            title: "Bell pepper - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "bf737545940059aeaeb79e3cf4ce3b1054003526f923c03ced894d1a1a788487",
            supportExcerpt:
              "The bell pepper is the only member of the Capsicum genus that does not produce capsaicin, and so it registers at essentially zero on the Scoville scale.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-hot-peppers-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which drink relieves chili burn better than water because capsaicin dissolves in fat?",
        displayPrompt:
          "Which drink soothes a chili burn better than water, because capsaicin dissolves in fat rather than water?",
        choices: ["Milk", "Water", "Soda", "Beer"],
        correctIndex: 0,
        canonicalFact:
          "Milk relieves chili burn better than water because capsaicin dissolves in fat, and milk fat helps wash it away.",
        explanation:
          "Milk beats water on a chili burn because capsaicin dissolves in fat, and milk's fat helps carry it off. Water just relocates the fire and wishes you luck.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Capsaicin",
            title: "Capsaicin - Wikipedia",
            locator: "Relief from burning",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "15950fbf116176ed9dcf067841f2cc6b8c2ad770264521d7e75835d15bfb7370",
            supportExcerpt:
              "Capsaicin is not water-soluble but is soluble in fats and oils; dairy products such as milk can relieve the burning sensation more effectively than water.",
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
    id: "cat-cats",
    label: "Cats",
    category: "SCIENCE_NATURE",
    scope: "Domestic cats: their biology, behaviour, and quirks.",
    exclusions: ["Specific pedigree breed standards", "Big wild cats like lions"],
    canonicalKey: "442ca744dceef03299fce141404fa2275942723f9dbb33afb8b447c0909f39b9",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-cats-q1",
        tier: "EASY",
        neutralQuestion:
          "Roughly how many hours a day does the average domestic cat spend sleeping?",
        displayPrompt:
          "Roughly how many hours a day does the average domestic cat spend asleep?",
        choices: ["About 12 to 16 hours", "About 4 hours", "About 20 hours", "About 8 hours"],
        correctIndex: 0,
        canonicalFact:
          "The average domestic cat sleeps roughly 12 to 16 hours a day.",
        explanation:
          "The average cat sleeps 12 to 16 hours a day. It has built an entire reputation for mystery around what is mostly an ambitious nap schedule.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Cat",
            title: "Cat - Wikipedia",
            locator: "Sleep",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "b8ae7af0d28a8efc3e8620e709079cc1ac41dbda51c659c29c824e7acf8d9f88",
            supportExcerpt:
              "Domestic cats are known for sleeping a great deal, on average around 12 to 16 hours per day, considerably more than most other mammals.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-cats-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "A cat's rough tongue is covered in tiny backward-facing spines made of which material?",
        displayPrompt:
          "A cat's rough tongue is covered in tiny backward-facing spines made of which material, the same one in nails?",
        choices: ["Keratin", "Cartilage", "Enamel", "Chitin"],
        correctIndex: 0,
        canonicalFact:
          "The backward-facing spines on a cat's tongue are made of keratin.",
        explanation:
          "A cat's tongue is lined with backward-facing keratin spines, the same protein as your fingernails. They comb the fur, so grooming doubles as light exfoliation.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Cat",
            title: "Cat - Wikipedia",
            locator: "Tongue",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "009f75d70ed4b8e59bf0ec386cf780c63f19561fffe29d3fd2ee0b1f4d662865",
            supportExcerpt:
              "A cat's tongue is covered with small backward-facing spines called papillae, which are made of keratin and help with grooming and rasping meat from bones.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-cats-q3",
        tier: "HARD",
        neutralQuestion:
          "What is the collective noun for a group of cats?",
        displayPrompt:
          "What is the traditional collective noun for a group of cats?",
        choices: ["A clowder", "A pride", "A gaggle", "A pod"],
        correctIndex: 0,
        canonicalFact:
          "A group of cats is traditionally called a clowder.",
        explanation:
          "A group of cats is a clowder. Given how reluctantly cats cooperate, it is a word most people will never have cause to use correctly.",
        comedyDevices: ["WORDPLAY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Cat",
            title: "Cat - Wikipedia",
            locator: "Terminology",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "23449561cd00002d526e8e089d80b8aa5e74a84a727ff4b94fcb9e94d188aa85",
            supportExcerpt:
              "A group of cats is referred to as a clowder, a male cat is called a tom, and a female is called a queen.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-cats-q4",
        tier: "INSANE",
        neutralQuestion:
          "Domestic cats have lost the ability to taste which basic flavour?",
        displayPrompt:
          "Domestic cats have lost the ability to taste which basic flavour, unlike most other mammals?",
        choices: ["Sweetness", "Saltiness", "Bitterness", "Sourness"],
        correctIndex: 0,
        canonicalFact:
          "Domestic cats cannot taste sweetness, due to a non-functional sweet taste receptor gene.",
        explanation:
          "Cats cannot taste sweetness; the gene for the sweet receptor is broken across the whole cat family. Their indifference to dessert is genetic, not personal.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Cat",
            title: "Cat - Wikipedia",
            locator: "Senses",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "42a879b86716ced38067b73fe17db966b2d6783b7a37962643ddcfad15c92736",
            supportExcerpt:
              "Cats lack the ability to taste sweetness because a mutation in a sweet-taste receptor gene is shared across the cat family, leaving them indifferent to sugar.",
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
    id: "cat-pokemon",
    label: "Pokémon",
    category: "GAMES",
    scope: "The Pokémon video game and media franchise.",
    exclusions: ["Competitive metagame tiers", "Games released after 2024"],
    canonicalKey: "f5eff2c8c660a5e4a6cc0fd1c3f55648b0363e0c1c6c8abedc512c9386ea7e4d",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-pokemon-q1",
        tier: "EASY",
        neutralQuestion:
          "Which yellow, electric-type Pokémon is the franchise's most recognisable mascot?",
        displayPrompt:
          "Which yellow, electric-type creature is the most recognisable mascot of the Pokémon franchise?",
        choices: ["Pikachu", "Charizard", "Bulbasaur", "Jigglypuff"],
        correctIndex: 0,
        canonicalFact:
          "Pikachu, a yellow electric-type, is the mascot of the Pokémon franchise.",
        explanation:
          "Pikachu, a yellow electric-type mouse, is the face of Pokémon. It became the mascot despite not being a starter that anyone actually picks first.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Pikachu",
            title: "Pikachu - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "567d7a18aaff986b295cedda4e0208e412e040a6f773505966fe7b43dbc8f466",
            supportExcerpt:
              "Pikachu is a yellow, mouse-like Electric-type Pokémon and serves as the mascot of the Pokémon franchise.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-pokemon-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "In the Pokémon games, the device that records data on each species caught is called the what?",
        displayPrompt:
          "In the games, the in-world device that logs data on every species caught is called the what?",
        choices: ["Pokédex", "Poké Ball", "Poké Center", "PokéGear"],
        correctIndex: 0,
        canonicalFact:
          "In Pokémon, the device that catalogues species is called the Pokédex.",
        explanation:
          "The Pokédex is the in-game encyclopedia that logs every species you catch. The stated goal is to 'catch them all', which is a lot of homework for a child.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Gameplay_of_Pok%C3%A9mon",
            title: "Gameplay of Pokémon - Wikipedia",
            locator: "Pokédex",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "8c4ce4d425a06a88ac766eef0227d5d3f27675f76c4d895c4764e0294c19dfc5",
            supportExcerpt:
              "The Pokédex is an electronic device in the Pokémon games that records data on the different species of Pokémon that the player encounters and catches.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-pokemon-q3",
        tier: "HARD",
        neutralQuestion:
          "How many Pokémon appeared in the original 1996 Generation I games?",
        displayPrompt:
          "How many different Pokémon appeared in the original 1996 Generation I games?",
        choices: ["151", "100", "251", "386"],
        correctIndex: 0,
        canonicalFact:
          "The original 1996 Generation I Pokémon games featured 151 different Pokémon.",
        explanation:
          "The original games shipped with 151 Pokémon, the famous first roster. The number has since grown past a thousand, testing everyone's memory but a child's.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Pok%C3%A9mon_Red_and_Blue",
            title: "Pokémon Red and Blue - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "ec41263cc551ded03c8a6ec0ba37ec3f2ad9c84f09f4942cf2c4af024c4ad8df",
            supportExcerpt:
              "Pokémon Red and Blue, first released in 1996, introduced the original 151 Pokémon species that make up the first generation of the franchise.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-pokemon-q4",
        tier: "INSANE",
        neutralQuestion:
          "The name 'Pokémon' is a contraction of which two English words?",
        displayPrompt:
          "The name 'Pokémon' is a shortened blend of which two English words?",
        choices: ["Pocket Monsters", "Power Monsters", "Popular Monsters", "Portable Monsters"],
        correctIndex: 0,
        canonicalFact:
          "The name 'Pokémon' is a contraction of the English words 'Pocket Monsters'.",
        explanation:
          "Pokémon is short for 'Pocket Monsters', the franchise's original Japanese name. A tidy promise of creatures small enough to carry, then several hundred more of them.",
        comedyDevices: ["WORDPLAY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Pok%C3%A9mon",
            title: "Pokémon - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "306d8ee02ae3cb3fb5f7f2faa461b46695a767f6b974b3b4d57fe43e86a26ae1",
            supportExcerpt:
              "The name Pokémon is a contraction of the words 'Pocket Monsters', which was the franchise's original Japanese title.",
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
    id: "cat-space-exploration",
    label: "Space Exploration",
    category: "SCIENCE_NATURE",
    scope: "Human space exploration and its milestones.",
    exclusions: ["Ongoing private space missions", "Events after 2024"],
    canonicalKey: "d51b77dbce0903df174dc045cfb73a0aab569871e437999887e4722d9b85391e",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-space-exploration-q1",
        tier: "EASY",
        neutralQuestion:
          "Who was the first person to walk on the Moon, in 1969?",
        displayPrompt:
          "Who became the first person to walk on the Moon, back in 1969?",
        choices: ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "John Glenn"],
        correctIndex: 0,
        canonicalFact:
          "Neil Armstrong was the first person to walk on the Moon, in 1969.",
        explanation:
          "Neil Armstrong stepped onto the Moon in July 1969. Buzz Aldrin followed minutes later, forever cast as history's most famous runner-up.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Neil_Armstrong",
            title: "Neil Armstrong - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "8a330c4b7b56fad9d4c5f5a0762294808bc0d163d5033c38513da6bd309e342a",
            supportExcerpt:
              "Neil Armstrong was an American astronaut who, in July 1969, became the first person to walk on the Moon during the Apollo 11 mission.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-space-exploration-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which NASA program landed the first humans on the Moon?",
        displayPrompt:
          "Which NASA program put the first humans on the Moon?",
        choices: ["The Apollo program", "The Gemini program", "The Mercury program", "The Artemis program"],
        correctIndex: 0,
        canonicalFact:
          "NASA's Apollo program landed the first humans on the Moon, with Apollo 11 in 1969.",
        explanation:
          "NASA's Apollo program landed the first humans on the Moon, starting with Apollo 11 in 1969. It ran on computers with less memory than a modern doorbell.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Apollo_program",
            title: "Apollo program - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "02418c6bd4b9a51f43e4f0bd8955af1e0f47c123eb219a2cdb7264c8616210b1",
            supportExcerpt:
              "The Apollo program was the NASA spaceflight program that landed the first humans on the Moon, beginning with Apollo 11 in 1969.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-space-exploration-q3",
        tier: "HARD",
        neutralQuestion:
          "Who became the first human to travel into space, in 1961?",
        displayPrompt:
          "Who, in 1961, became the first human to travel into space?",
        choices: ["Yuri Gagarin", "Alan Shepard", "Neil Armstrong", "Valentina Tereshkova"],
        correctIndex: 0,
        canonicalFact:
          "Soviet cosmonaut Yuri Gagarin became the first human in space in 1961.",
        explanation:
          "Soviet cosmonaut Yuri Gagarin orbited Earth in 1961, the first human in space. The whole flight lasted under two hours, most of it fully automated.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Yuri_Gagarin",
            title: "Yuri Gagarin - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "88b38d00c0e64bf091b8bdd14ade00e420fec8c8beb1e30c7ffba5dfedb7b65e",
            supportExcerpt:
              "Yuri Gagarin was a Soviet cosmonaut who became the first human to journey into outer space, completing one orbit of Earth on 12 April 1961.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-space-exploration-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which artificial satellite, launched by the Soviet Union in 1957, was the first to orbit Earth?",
        displayPrompt:
          "Which satellite, launched by the Soviet Union in 1957, was the first artificial object to orbit Earth?",
        choices: ["Sputnik 1", "Explorer 1", "Vostok 1", "Luna 2"],
        correctIndex: 0,
        canonicalFact:
          "Sputnik 1, launched by the Soviet Union in 1957, was the first artificial satellite to orbit Earth.",
        explanation:
          "Sputnik 1 reached orbit in 1957, the first artificial satellite. It was essentially a metal sphere that beeped, and it managed to unsettle an entire superpower.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Sputnik_1",
            title: "Sputnik 1 - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "e5fb62c14ca45f3de00f2625dabc1660495c00fb90df029f295604edb2df8aa5",
            supportExcerpt:
              "Sputnik 1 was the first artificial Earth satellite, launched by the Soviet Union in 1957; it transmitted a simple radio beep and triggered the Space Race.",
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
    id: "cat-coffee",
    label: "Coffee",
    category: "FOOD_DRINK",
    scope: "Coffee: its beans, preparation, and culture.",
    exclusions: ["Coffee-chain brands", "Commodity prices"],
    canonicalKey: "b453864ba5c7e3e07d5bae781c34e5ccacd1acb12d1f087255ce237286bdcd5a",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-coffee-q1",
        tier: "EASY",
        neutralQuestion:
          "Which natural stimulant in coffee makes it a popular morning drink?",
        displayPrompt:
          "Which natural stimulant in coffee makes it such a popular morning drink?",
        choices: ["Caffeine", "Nicotine", "Fructose", "Melatonin"],
        correctIndex: 0,
        canonicalFact:
          "Caffeine is the natural stimulant in coffee that makes it popular as a morning drink.",
        explanation:
          "Caffeine, a natural stimulant, wakes you up by blocking the brain signals that make you feel sleepy. It does not add energy, it just hides the tiredness for a while.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Coffee",
            title: "Coffee - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "71e0599e909a41260326feaa5ad0d771f6a83d851e40e5229fd4ae9f20f8dd87",
            supportExcerpt:
              "Coffee is a popular beverage brewed from roasted coffee beans; it contains the stimulant caffeine, which is the main reason for its widespread consumption.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-coffee-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "The two most widely grown species of coffee are Arabica and which other?",
        displayPrompt:
          "Most of the world's coffee comes from Arabica and which other widely grown species?",
        choices: ["Robusta", "Liberica", "Excelsa", "Maragogipe"],
        correctIndex: 0,
        canonicalFact:
          "The two most widely grown coffee species are Arabica and Robusta.",
        explanation:
          "Most coffee is either Arabica, prized for flavour, or Robusta, prized for strength and caffeine. The bag rarely says which, which is part of the charm.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Coffee",
            title: "Coffee - Wikipedia",
            locator: "Species",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "bacb0541950907da1f471ac81a14e150f1c1a2e414f857bab6c49a1173f837d0",
            supportExcerpt:
              "The two most commonly grown coffee species are Coffea arabica and Coffea canephora, commonly known as robusta; arabica is prized for flavour and robusta for its strength.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-coffee-q3",
        tier: "HARD",
        neutralQuestion:
          "A traditional cappuccino combines espresso and steamed milk with which topping?",
        displayPrompt:
          "A traditional cappuccino tops espresso and steamed milk with which finishing layer?",
        choices: ["A layer of milk foam", "A scoop of ice cream", "Whipped cream and cinnamon", "A shot of liqueur"],
        correctIndex: 0,
        canonicalFact:
          "A traditional cappuccino is espresso and steamed milk topped with a layer of milk foam.",
        explanation:
          "A cappuccino is espresso, steamed milk, and a cap of milk foam, roughly in thirds. The foam is the whole point, which is why baristas guard it so fiercely.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Cappuccino",
            title: "Cappuccino - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "5bf9a8347d409b0bc5ccf658ec1d22f055c487c477b0b06216bef3a6cb9db954",
            supportExcerpt:
              "A cappuccino is an espresso-based coffee drink prepared with steamed milk and a thick layer of milk foam on top, traditionally in roughly equal parts.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-coffee-q4",
        tier: "INSANE",
        neutralQuestion:
          "According to a popular legend, coffee's energising effect was discovered by an Ethiopian goat herder who noticed what about his goats?",
        displayPrompt:
          "By popular legend, coffee's kick was discovered by an Ethiopian goat herder after he noticed what about his goats?",
        choices: ["They grew lively after eating the berries", "They fell asleep in the field", "They refused to move", "They changed colour"],
        correctIndex: 0,
        canonicalFact:
          "A popular legend credits the discovery of coffee to the Ethiopian goat herder Kaldi, who noticed his goats grew lively after eating coffee berries.",
        explanation:
          "Legend credits an Ethiopian goat herder named Kaldi, who saw his goats grow frisky after eating coffee berries. There is no proof, but it is far too good a story to retire.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/History_of_coffee",
            title: "History of coffee - Wikipedia",
            locator: "Legends",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "690a60f618ee7d374a45ae8e30c3f9ac250d5b48a58c9fad834c295abc53ee0b",
            supportExcerpt:
              "A popular legend attributes the discovery of coffee to Kaldi, an Ethiopian goat herder who noticed his goats becoming energetic after eating the berries of the coffee plant.",
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
    id: "cat-volcanoes",
    label: "Volcanoes",
    category: "GEOGRAPHY",
    scope: "Volcanoes: their types, features, and famous eruptions.",
    exclusions: ["Predictions of future eruptions", "Precise casualty figures"],
    canonicalKey: "94bb62fd1913ce628d7e2611b5794dd7430db74b00c0d589d848a07a7ab21bd5",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-volcanoes-q1",
        tier: "EASY",
        neutralQuestion:
          "What is molten rock that has erupted onto the Earth's surface called?",
        displayPrompt:
          "Molten rock that has erupted onto the Earth's surface goes by which name?",
        choices: ["Lava", "Magma", "Granite", "Ash"],
        correctIndex: 0,
        canonicalFact:
          "Molten rock that has erupted onto the Earth's surface is called lava.",
        explanation:
          "Once molten rock reaches the surface it is called lava; underground, the very same stuff is magma. It changes its name the moment it goes public.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Lava",
            title: "Lava - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "7b603ee1dbc652a5d7bd30a919dbd6109286c9a38eb4d181b18e14d7404debd3",
            supportExcerpt:
              "Lava is molten or partially molten rock that has been expelled from a volcano onto the surface; while still beneath the surface it is called magma.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-volcanoes-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which Italian volcano buried the Roman city of Pompeii in 79 AD?",
        displayPrompt:
          "Which Italian volcano famously buried the Roman city of Pompeii under ash in 79 AD?",
        choices: ["Mount Vesuvius", "Mount Etna", "Mount Fuji", "Krakatoa"],
        correctIndex: 0,
        canonicalFact:
          "Mount Vesuvius buried the Roman city of Pompeii in 79 AD.",
        explanation:
          "Mount Vesuvius buried Pompeii under ash in 79 AD, preserving the city in eerie detail. It remains one of the few volcanoes with a modern city at its feet.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Mount_Vesuvius",
            title: "Mount Vesuvius - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "c19e58b4eb1632466fb3f7eae99124fe158aa3115ed0a69866be08cc41196fee",
            supportExcerpt:
              "Mount Vesuvius is a volcano in Italy best known for its eruption in 79 AD, which buried the Roman towns of Pompeii and Herculaneum under ash and rock.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-volcanoes-q3",
        tier: "HARD",
        neutralQuestion:
          "The horseshoe-shaped zone of volcanoes and earthquakes around the Pacific Ocean is nicknamed the what?",
        displayPrompt:
          "The horseshoe-shaped belt of volcanoes and earthquakes around the Pacific Ocean is nicknamed the what?",
        choices: ["The Ring of Fire", "The Pacific Belt", "The Lava Line", "The Fault Ring"],
        correctIndex: 0,
        canonicalFact:
          "The belt of volcanoes and earthquakes around the Pacific Ocean is nicknamed the Ring of Fire.",
        explanation:
          "The Ring of Fire is a horseshoe of volcanoes and quakes tracing the Pacific rim, home to most of the world's active volcanoes. A very dramatic name that fully earns it.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Ring_of_Fire",
            title: "Ring of Fire - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "28fed702c49511ff7e67ba398c755f8da716cc35b1626f1008d7d2a9223112c2",
            supportExcerpt:
              "The Ring of Fire is a horseshoe-shaped region around the Pacific Ocean where many volcanoes and earthquakes occur, containing most of the world's active volcanoes.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-volcanoes-q4",
        tier: "INSANE",
        neutralQuestion:
          "A volcano that scientists consider very unlikely to erupt again is described with which term?",
        displayPrompt:
          "A volcano judged very unlikely to ever erupt again is described using which term?",
        choices: ["Extinct", "Dormant", "Active", "Latent"],
        correctIndex: 0,
        canonicalFact:
          "A volcano considered very unlikely to erupt again is described as extinct.",
        explanation:
          "An 'extinct' volcano is one not expected to erupt again, unlike a merely 'dormant' one that is only resting. Volcanoes have occasionally disputed the label.",
        comedyDevices: ["ANTHROPOMORPHISM"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Volcano",
            title: "Volcano - Wikipedia",
            locator: "Classification",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "d579bca007873a81cb0f553e72c97c7c3156eab47a6b3e9c1cabf8daf7783585",
            supportExcerpt:
              "Volcanoes are often described as active, dormant, or extinct; an extinct volcano is one that is not expected to erupt again, while a dormant one may erupt in the future.",
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
    id: "cat-words-language",
    label: "Words & Language",
    category: "BOOKS_LANGUAGE",
    scope: "The English language and words: origins, meanings, and quirks.",
    exclusions: ["Prescriptive grammar debates", "Slang likely to date quickly"],
    canonicalKey: "40d61d6a751378ff7df46196b350e41719e909533d94faf6d90648883cadbba8",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-words-language-q1",
        tier: "EASY",
        neutralQuestion:
          "What is a word that reads the same forwards and backwards, like 'racecar', called?",
        displayPrompt:
          "A word that reads the same forwards and backwards, like 'racecar', is called what?",
        choices: ["A palindrome", "An anagram", "A homonym", "A synonym"],
        correctIndex: 0,
        canonicalFact:
          "A word that reads the same forwards and backwards is called a palindrome.",
        explanation:
          "A palindrome reads identically in both directions, like 'racecar' or 'level'. The word 'palindrome' itself, rather cruelly, is not one.",
        comedyDevices: ["WORDPLAY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Palindrome",
            title: "Palindrome - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "0030dfd01c2f7451faa0832d8a3ec44531b006befc2730dd2270fdfccae21b6d",
            supportExcerpt:
              "A palindrome is a word, phrase, number or other sequence of characters that reads the same forwards and backwards, such as 'racecar' or 'level'.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-words-language-q2",
        tier: "MEDIUM",
        neutralQuestion:
          "Which punctuation mark links two closely related complete sentences without a conjunction?",
        displayPrompt:
          "Which punctuation mark links two closely related complete sentences without a joining word?",
        choices: ["A semicolon", "A colon", "An ellipsis", "A hyphen"],
        correctIndex: 0,
        canonicalFact:
          "A semicolon links two closely related independent clauses without a conjunction.",
        explanation:
          "A semicolon joins two related complete sentences where a full stop would feel too final. It is the most feared mark in English, mostly by people busy avoiding it.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Semicolon",
            title: "Semicolon - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "a80b50cec8bd3f9b1a643e1b99c8ab305fe635474f8930918b0bdd026be1d44b",
            supportExcerpt:
              "A semicolon is a punctuation mark commonly used to link two independent clauses that are closely related in thought, without a coordinating conjunction.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-words-language-q3",
        tier: "HARD",
        neutralQuestion:
          "The sentence 'the quick brown fox jumps over the lazy dog' is an example of what?",
        displayPrompt:
          "'The quick brown fox jumps over the lazy dog' is famous as an example of what?",
        choices: ["A pangram", "A palindrome", "A spoonerism", "An oxymoron"],
        correctIndex: 0,
        canonicalFact:
          "'The quick brown fox jumps over the lazy dog' is a pangram, a sentence using every letter of the alphabet.",
        explanation:
          "That fox sentence is a pangram, using every letter of the alphabet at least once. Typists and font designers have leaned on the poor animal for over a century.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Pangram",
            title: "Pangram - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "89b251b2611e29474b11e27006e2adf10123de3fa826b1e3590c26a475cf4fa7",
            supportExcerpt:
              "A pangram is a sentence that uses every letter of the alphabet at least once; the best-known English example is 'the quick brown fox jumps over the lazy dog'.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-words-language-q4",
        tier: "INSANE",
        neutralQuestion:
          "According to a popular but unproven legend, the word 'quiz' was invented to win what?",
        displayPrompt:
          "By a popular but unproven legend, the word 'quiz' was coined to win what?",
        choices: ["A bet", "A spelling contest", "A royal prize", "A card game"],
        correctIndex: 0,
        canonicalFact:
          "A popular but unproven legend claims the word 'quiz' was coined to win a bet that a nonsense word could enter the language.",
        explanation:
          "By legend, a Dublin theatre owner bet he could push a made-up word into common use overnight, and 'quiz' won. Etymologists doubt it, but the story refuses to leave.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Quiz",
            title: "Quiz - Wikipedia",
            locator: "Etymology",
            retrievedAt: "2026-07-18T00:00:00.000Z",
            contentHash: "9733a860803d0eebe78feb3eac10965867ea72b7a3268818246a16d7efc7bde6",
            supportExcerpt:
              "A popular but unverified story claims the word quiz was invented around 1791 by a Dublin theatre owner named Daly, who wagered that he could introduce a nonsense word into the language.",
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
