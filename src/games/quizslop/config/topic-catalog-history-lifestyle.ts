import type { QuizslopCatalogTopic } from "../types";

export const QUIZSLOP_HISTORY_LIFESTYLE_TOPICS: readonly QuizslopCatalogTopic[] = [
  {
    id: "cat-ancient-egypt",
    label: "Ancient Egypt",
    category: "HISTORY",
    scope: "Ancient Egyptian civilisation: its pharaohs, monuments, and daily life.",
    exclusions: ["Greco-Roman Egypt after 30 BC", "Modern Egypt"],
    canonicalKey: "f549d19c5e8fff17d173b7feebfe1490b8f9a101910d84de32d1cb94a99ff316",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-ancient-egypt-q1",
        tier: "EASY",
        neutralQuestion:
          "What massive stone tombs did the ancient Egyptians build on the Giza plateau?",
        displayPrompt:
          "Which massive stone tombs did the ancient Egyptians pile up on the Giza plateau, giving tourists neck cramps ever since?",
        choices: ["Pyramids", "Ziggurats", "Pagodas", "Colosseums"],
        correctIndex: 0,
        canonicalFact:
          "The ancient Egyptians built pyramids as royal tombs, most famously at Giza.",
        explanation:
          "The Egyptians built pyramids as royal tombs, the Giza pyramids being the most famous. The Great Pyramid stood as the tallest human structure for millennia.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Egyptian_pyramids",
            title: "Egyptian pyramids - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "0b6c77253ee8bda783220c8af35b81fac7ef135ebe8e315c412938a7f8a2c177",
            supportExcerpt:
              "The Egyptian pyramids are ancient masonry structures built as royal tombs; the most famous are the pyramids of the Giza plateau, including the Great Pyramid.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-ancient-egypt-q2",
        tier: "MEDIUM",
        neutralQuestion: "Which artifact was key to deciphering ancient Egyptian hieroglyphs?",
        displayPrompt:
          "Which slab of stone, carrying the same decree in three scripts, finally cracked the code of Egyptian hieroglyphs?",
        choices: [
          "The Rosetta Stone",
          "The Dead Sea Scrolls",
          "The Code of Hammurabi",
          "The Behistun Inscription",
        ],
        correctIndex: 0,
        canonicalFact:
          "The Rosetta Stone, inscribed in three scripts, was key to deciphering Egyptian hieroglyphs.",
        explanation:
          "The Rosetta Stone repeats one decree in hieroglyphic, Demotic, and Greek, letting scholars finally read hieroglyphs. A cheat sheet carved in stone.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Rosetta_Stone",
            title: "Rosetta Stone - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "14c906a2327a61cda304cfc09981c580d99580c379aadd4d2201028caa82054a",
            supportExcerpt:
              "The Rosetta Stone is inscribed with the same decree in three scripts, and its Greek text allowed scholars to decipher Egyptian hieroglyphs.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-ancient-egypt-q3",
        tier: "HARD",
        neutralQuestion: "Which pharaoh's nearly intact tomb did Howard Carter discover in 1922?",
        displayPrompt:
          "Which young pharaoh's nearly intact tomb did Howard Carter uncover in 1922, treasure and all?",
        choices: ["Tutankhamun", "Ramesses II", "Khufu", "Akhenaten"],
        correctIndex: 0,
        canonicalFact: "Howard Carter discovered the nearly intact tomb of Tutankhamun in 1922.",
        explanation:
          "Howard Carter found Tutankhamun's largely intact tomb in 1922, packed with gold. The boy king became far more famous dead than he ever was alive.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Tutankhamun",
            title: "Tutankhamun - Wikipedia",
            locator: "Tomb",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "ca520feb5955e819255bf90c16a164a78121d050d38e2b9f2037e74342e15716",
            supportExcerpt:
              "The nearly intact tomb of the pharaoh Tutankhamun was discovered by the archaeologist Howard Carter in 1922 in the Valley of the Kings.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-ancient-egypt-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which long-reigning female pharaoh of the Eighteenth Dynasty was often depicted wearing a false ceremonial beard?",
        displayPrompt:
          "Which powerful female pharaoh of the Eighteenth Dynasty had herself depicted wearing the traditional royal false beard?",
        choices: ["Hatshepsut", "Nefertiti", "Cleopatra VII", "Nefertari"],
        correctIndex: 0,
        canonicalFact:
          "Hatshepsut, a female pharaoh of Egypt's Eighteenth Dynasty, was often depicted wearing the royal false beard.",
        explanation:
          "Hatshepsut ruled as pharaoh in the Eighteenth Dynasty and was shown with the ceremonial false beard of kingship. She adopted the dress code and kept the throne for two decades.",
        comedyDevices: ["UNDERSTATEMENT", "UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Hatshepsut",
            title: "Hatshepsut - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "6f2062ce0535f868e22e7fd4163ef9ec5fe57747568ab44c47b6f9a540baf17a",
            supportExcerpt:
              "Hatshepsut was the fifth pharaoh of the Eighteenth Dynasty of Egypt and one of its most successful rulers; she was frequently depicted with the traditional false beard of a pharaoh.",
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
    id: "cat-cheese-dairy",
    label: "Cheese & Dairy",
    category: "FOOD_DRINK",
    scope: "Cheeses and dairy products: their origins, styles, and production.",
    exclusions: ["Vegan or plant-based imitations", "Brand-specific products"],
    canonicalKey: "261e487e98d61d4c9218fa111543353acb3e9d3731d99f9d4adfd116d1185f51",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-cheese-dairy-q1",
        tier: "EASY",
        neutralQuestion: "Which firm cheese takes its name from a village in Somerset, England?",
        displayPrompt:
          "Which firm, crumbly cheese borrowed its name from a Somerset village and then conquered sandwiches worldwide?",
        choices: ["Cheddar", "Brie", "Mozzarella", "Feta"],
        correctIndex: 0,
        canonicalFact:
          "Cheddar cheese originated in and is named after the village of Cheddar in Somerset, England.",
        explanation:
          "Cheddar is named after the Somerset village where it originated and is now made worldwide. The village gave up naming rights and got nothing in return.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Cheddar_cheese",
            title: "Cheddar cheese - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "ec338fc34f4c0a59c51867c82d5cc1b03605a890ce5a63e1b1f58a081d9f77b9",
            supportExcerpt:
              "Cheddar cheese is a natural, firm cheese that originated in the English village of Cheddar in Somerset, and is now produced around the world.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-cheese-dairy-q2",
        tier: "MEDIUM",
        neutralQuestion: "Which Italian cheese is the traditional base for the dessert tiramisu?",
        displayPrompt:
          "Which rich Italian cheese quietly holds tiramisu together while the coffee and cocoa get all the attention?",
        choices: ["Mascarpone", "Ricotta", "Parmesan", "Provolone"],
        correctIndex: 0,
        canonicalFact: "Mascarpone is the traditional cheese used to make tiramisu.",
        explanation:
          "Mascarpone gives tiramisu its rich, creamy layers. The unsung structural support behind a very photogenic dessert.",
        comedyDevices: ["DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Tiramisu",
            title: "Tiramisu - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "56453bfae99242b3446064c478cd2ea6e8260b77db7111f9e59e1a952d6005a6",
            supportExcerpt:
              "Tiramisu is an Italian dessert made of ladyfingers dipped in coffee, layered with a whipped mixture of eggs, sugar, and mascarpone cheese.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-cheese-dairy-q3",
        tier: "HARD",
        neutralQuestion:
          "In Swiss cheeses like Emmental, what traditionally creates the characteristic holes?",
        displayPrompt:
          "In Emmental and similar Swiss cheeses, what actually forms those famous holes during ripening?",
        choices: [
          "Gas released by bacteria",
          "Air injection machines",
          "Hand-drilled holes",
          "Melting fat pockets",
        ],
        correctIndex: 0,
        canonicalFact:
          "The holes, or eyes, in Swiss cheeses like Emmental form from carbon dioxide released by bacteria during ripening.",
        explanation:
          "The holes in Emmental come from carbon dioxide that bacteria release as the cheese ripens. Tiny microbes, quietly burping art into your sandwich.",
        comedyDevices: ["INCONGRUITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Swiss_cheese",
            title: "Swiss cheese - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "3f0851a505ea271d04fc9526c65bdc06bad1d855bfee0da3ed42afb233673a8e",
            supportExcerpt:
              "The characteristic holes, or eyes, in Swiss-type cheeses such as Emmental are formed by carbon dioxide gas released by bacteria during the ripening process.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-cheese-dairy-q4",
        tier: "INSANE",
        neutralQuestion:
          "Which French blue cheese is traditionally ripened in the natural caves of Roquefort-sur-Soulzon using Penicillium roqueforti?",
        displayPrompt:
          "Which French blue cheese is legally ripened in specific natural caves and veined by one very particular mould?",
        choices: ["Roquefort", "Gorgonzola", "Stilton", "Camembert"],
        correctIndex: 0,
        canonicalFact:
          "Roquefort is a French blue cheese made from sheep's milk and aged in the caves of Roquefort-sur-Soulzon with Penicillium roqueforti.",
        explanation:
          "Roquefort is ripened in the natural caves of Roquefort-sur-Soulzon and veined with Penicillium roqueforti mould. Protected by law, because the French take their mould seriously.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY", "AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Roquefort",
            title: "Roquefort - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "c3aa08696a257845f32c5c3f93935da8f1278b1a8c41598f60024593610ca337",
            supportExcerpt:
              "Roquefort is a sheep milk blue cheese from the south of France, traditionally ripened in the natural caves of Roquefort-sur-Soulzon and made with the mould Penicillium roqueforti.",
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
    id: "cat-olympic-games",
    label: "The Olympic Games",
    category: "SPORTS",
    scope: "The modern Olympic Games: their history, traditions, and events.",
    exclusions: ["Specific medal counts or records", "Games after 2024"],
    canonicalKey: "66c486ef5ff1bc728cc6396747b021ff08fc2dc1d73aae06b36e5201eba02038",
    packVersion: 1,
    retired: false,
    questions: [
      {
        id: "cat-olympic-games-q1",
        tier: "EASY",
        neutralQuestion: "How many interlocking rings appear on the Olympic flag?",
        displayPrompt:
          "How many interlocking rings make up the famous Olympic flag, one for roughly each inhabited continent?",
        choices: ["Five", "Four", "Six", "Three"],
        correctIndex: 0,
        canonicalFact:
          "The Olympic flag features five interlocking rings, representing the inhabited continents.",
        explanation:
          "The Olympic flag has five interlocking rings for the inhabited continents of the world. Antarctica, predictably, was left off the guest list.",
        comedyDevices: ["AFFECTIONATE_ROAST"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Olympic_symbols",
            title: "Olympic symbols - Wikipedia",
            locator: "The rings",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "e4dfe6ce65d31651d330101c05944a01aa023a59022b1cdcbb129d30da63c8ee",
            supportExcerpt:
              "The Olympic flag features five interlaced rings on a white background, which represent the five inhabited continents of the world.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-olympic-games-q2",
        tier: "MEDIUM",
        neutralQuestion: "In which city were the first modern Olympic Games held in 1896?",
        displayPrompt:
          "Which city hosted the very first modern Olympic Games in 1896, keeping things fittingly Greek?",
        choices: ["Athens", "Paris", "London", "Olympia"],
        correctIndex: 0,
        canonicalFact: "The first modern Olympic Games were held in Athens, Greece, in 1896.",
        explanation:
          "Athens hosted the first modern Olympics in 1896, a nod to the games' Greek roots. The ancient site of Olympia had to sit this revival out.",
        comedyDevices: ["UNDERSTATEMENT"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/1896_Summer_Olympics",
            title: "1896 Summer Olympics - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "268835a1868b8f29e4691029387b9b8cc230ddb35d9cc9320c9fd8f75e0f478a",
            supportExcerpt:
              "The 1896 Summer Olympics, held in Athens, Greece, were the first modern Olympic Games and the first international Olympic event.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-olympic-games-q3",
        tier: "HARD",
        neutralQuestion: "What is the standardised distance of an Olympic marathon?",
        displayPrompt:
          "What oddly precise distance became the official length of the Olympic marathon?",
        choices: ["42.195 kilometres", "40 kilometres", "26 kilometres", "50 kilometres"],
        correctIndex: 0,
        canonicalFact:
          "The standardised Olympic marathon distance is 42.195 kilometres, about 26.2 miles.",
        explanation:
          "The marathon was fixed at 42.195 kilometres, a length shaped by the 1908 London course. An oddly specific number blamed largely on royal viewing preferences.",
        comedyDevices: ["UNEXPECTED_SPECIFICITY"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Marathon",
            title: "Marathon - Wikipedia",
            locator: "The distance",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "7e80911a091abc0f1d7f5569ded86441ec7f807b3fcafaaacca7916d3effa4f4",
            supportExcerpt:
              "The official marathon distance was standardised at 42.195 kilometres, roughly 26.2 miles, a length influenced by the route used at the 1908 London Olympics.",
            primary: true,
          },
        ],
      },
      {
        id: "cat-olympic-games-q4",
        tier: "INSANE",
        neutralQuestion:
          "The traditional Olympic motto is 'Citius, Altius, ___' - what is the third Latin word, meaning 'Stronger'?",
        displayPrompt:
          "The classic Olympic motto runs 'Citius, Altius, ___' - faster, higher, and which third Latin word meaning stronger?",
        choices: ["Fortius", "Fortis", "Maximus", "Potentius"],
        correctIndex: 0,
        canonicalFact:
          "The traditional Olympic motto is 'Citius, Altius, Fortius', meaning Faster, Higher, Stronger; the third word is Fortius.",
        explanation:
          "The traditional Olympic motto is 'Citius, Altius, Fortius' - Faster, Higher, Stronger. In 2021 they bolted on a fourth word, 'Communiter', because three apparently felt lonely.",
        comedyDevices: ["INCONGRUITY", "DRY_ASIDE"],
        sources: [
          {
            url: "https://en.wikipedia.org/wiki/Citius,_Altius,_Fortius",
            title: "Citius, Altius, Fortius - Wikipedia",
            locator: "lead section",
            retrievedAt: "2026-07-16T00:00:00.000Z",
            contentHash: "e707e7e87de7412a8c1df5d997345ee88ce038ec1817d3e6b0adcf29769ee98e",
            supportExcerpt:
              "Citius, Altius, Fortius is the traditional Olympic motto, Latin for 'Faster, Higher, Stronger'; in 2021 the word Communiter, meaning 'Together', was added.",
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
