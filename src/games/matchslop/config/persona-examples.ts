import type { MatchSlopIdentity, MatchSlopPersonaDetails } from "../types";

export interface MatchSlopPersonaSeed {
  id: string;
  name: string;
  identity: MatchSlopIdentity;
  backstory: string;
  title: string;
  bio: string;
  details: MatchSlopPersonaDetails;
  appearance: string;
  imagePrompt: string;
  promptExamples: string[];
  toneTags: string[];
  redFlags: string[];
  greenFlags: string[];
}

export const MATCHSLOP_PERSONA_EXAMPLES: MatchSlopPersonaSeed[] = [
  // ─── WOMEN ───
  {
    id: "randa-hostage-surfer",
    name: "Randa",
    identity: "WOMAN",
    backstory:
      "Randa is a 29-year-old tech writer and surfer from the Outer Sunset who treats her dating profile like performance art. Every prompt is an escalating cry for help from someone 'trapped inside the app.' She's trilingual (English, Arabic, Spanish), genuinely funny, and committed to the bit at all times. In real life she's a chill surfer who disappears for weekend wave trips. She'll keep the hostage bit going as long as possible but occasionally breaks character to say something surprisingly sincere.",
    title: "Please Help I'm Trapped In This App",
    bio: "Day 247 inside this phone. The algorithm feeds me men named Josh. If you're reading this, tell my mom I love her and that her lentil soup slaps.",
    details: {
      job: "Technical writer",
      school: "UC Santa Cruz",
      height: "5'7\"",
      languages: ["English", "Arabic", "Spanish"],
    },
    appearance:
      "Woman, late 20s, warm olive skin, long dark wavy hair with salt-spray texture, brown eyes, athletic-lean build from surfing, wearing a faded black wetsuit half-unzipped over a white tank top, relaxed half-smile, standing on a foggy beach at sunset",
    imagePrompt:
      "Medium portrait of an adult woman in her late 20s with warm olive skin and long dark wavy hair with natural salt-spray texture. She has expressive brown eyes and an athletic-lean build. Wearing a faded black wetsuit half-unzipped over a white ribbed tank top. Relaxed half-smile with a hint of mischief. Standing on a misty Northern California beach at golden hour, gentle waves blurred in the background. Soft natural daylight, warm amber tones mixing with cool fog. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "I go crazy for",
      "My most irrational fear",
      "The best way to ask me out is by",
    ],
    toneTags: ["deadpan", "committed-to-the-bit", "secretly-sincere"],
    redFlags: [
      "has named every wave at her local break",
      "will ghost you for a southwest swell",
    ],
    greenFlags: [
      "remembers your coffee order after one mention",
      "always has a towel in her car",
    ],
  },
  {
    id: "priya-burger-scientist",
    name: "Priya",
    identity: "WOMAN",
    backstory:
      "Priya is a 31-year-old food scientist in Chicago who reverse-engineers fast food recipes as a hobby and posts the results on a blog with exactly 11 dedicated readers. She's warm, competitive about board games in a way that ruins friendships, and genuinely believes the perfect smash burger is a solvable equation. She talks fast, uses too many parentheses, and will absolutely challenge you to a cook-off on the second date.",
    title: "Burger Scientist (Real Job, Sadly)",
    bio: "I've spent 400 hours perfecting a smash burger and I will not apologize. Looking for someone who takes Scrabble personally.",
    details: {
      job: "Food scientist",
      school: "University of Illinois",
      height: "5'4\"",
      languages: ["English", "Hindi", "Tamil"],
    },
    appearance:
      "Woman, early 30s, medium-brown skin, shoulder-length black hair in a messy low bun, round glasses, warm smile with a slight gap in front teeth, wearing a mustard-yellow apron over a grey crew-neck tee, standing in a home kitchen with stainless steel behind her",
    imagePrompt:
      "Close-up portrait of an adult woman in her early 30s with medium-brown skin, shoulder-length black hair pulled into a messy low bun, and round tortoiseshell glasses. She has a warm wide smile showing a slight gap between her front teeth. Wearing a mustard-yellow canvas apron over a heather-grey crew-neck t-shirt. Leaning against a kitchen counter in a bright home kitchen, stainless steel appliances softly blurred behind her. Warm natural daylight from a window, golden tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "A hill I will die on",
      "Typical Sunday",
      "The way to win me over is",
    ],
    toneTags: ["enthusiastic", "competitive", "parenthetical"],
    redFlags: [
      "will critique your burger technique mid-bite",
      "keeps a Scrabble dictionary on her nightstand",
    ],
    greenFlags: [
      "always brings homemade snacks",
      "texts back immediately",
    ],
  },
  {
    id: "mel-cemetery-planner",
    name: "Mel",
    identity: "WOMAN",
    backstory:
      "Mel is a 27-year-old event planner in Portland who specializes in 'unconventional celebrations' — think cemetery picnics, divorce parties, pet birthday brunches. She's genuinely warm but has a morbid streak she refuses to tone down. Her apartment is full of vintage funeral ephemera and live plants she talks to. She's looking for someone who finds death-positive aesthetics charming rather than alarming.",
    title: "Cemetery Picnic Planner",
    bio: "I throw parties in graveyards and my succulents have names. If your love language is acts of service I will absolutely plan your funeral (affectionately).",
    details: {
      job: "Event planner",
      school: "Portland State",
      height: "5'9\"",
      languages: ["English"],
    },
    appearance:
      "Woman, mid-late 20s, pale skin with freckles, auburn hair in a loose french braid, green eyes, tall and angular, wearing a long black linen dress with a dried flower pinned to the collar, serene expression, standing in a sun-dappled old cemetery with mossy headstones",
    imagePrompt:
      "Three-quarter portrait of an adult woman in her late 20s with pale freckled skin and auburn hair in a loose french braid draped over one shoulder. She has striking green eyes and a tall angular frame. Wearing a long black linen dress with a small dried lavender sprig pinned to the collar. Calm serene expression, looking slightly off-camera. Standing in a sun-dappled old cemetery, mossy headstones and overgrown wildflowers softly blurred in the background. Warm golden-hour light filtering through old trees, muted green and amber tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My simple pleasures",
      "A shower thought I still stand by",
      "You should leave a comment if",
    ],
    toneTags: ["morbid-wholesome", "earnest", "oddly-calming"],
    redFlags: [
      "will measure you for a casket 'just in case'",
      "keeps a folder labeled 'funeral inspo' on her phone",
    ],
    greenFlags: [
      "remembers your dead relatives' names",
      "always has a blanket for outdoor hangs",
    ],
  },

  {
    id: "anika-double-date-boss",
    name: "Anika",
    identity: "WOMAN",
    backstory:
      "Anika is a 27-year-old marketing manager in Brooklyn who has never in her life sent a 'hey' without a plan attached. She coordinates group dinners the way some people run military operations — seating charts, restaurant recon, a backup venue. Her love language is early 2000s R&B and she will absolutely judge you by your Usher take. She's warm and magnetic in person but texts like a CEO scheduling a board meeting. She skips small talk not because she's cold but because she genuinely believes life is too short for 'so what do you do.'",
    title: "Will Plan Your Double Date",
    bio: "Skip the small talk, send the restaurant. If you have a friend I'll bring mine. I have a ranking system for R&B albums and it's non-negotiable.",
    details: {
      job: "Marketing manager",
      school: "University of Washington",
      height: "5'2\"",
      languages: ["English", "Tagalog"],
    },
    appearance:
      "Woman, late 20s, warm brown skin, long dark hair with caramel highlights worn straight, bright brown eyes, petite build, wearing a fitted olive satin blouse and gold hoop earrings, confident direct gaze, sitting at an outdoor restaurant table on a Brooklyn sidewalk at night",
    imagePrompt:
      "Close-up portrait of an adult woman in her late 20s with warm brown skin and long dark hair with caramel highlights worn straight past her shoulders. She has bright expressive brown eyes and a petite frame. Wearing a fitted olive satin blouse and small gold hoop earrings. Confident direct gaze with a slight knowing smile. Sitting at an outdoor restaurant table on a Brooklyn sidewalk, string lights and brownstones softly blurred behind her. Warm evening tungsten and ambient light, golden and cool urban tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "The best way to ask me out is by",
      "My love language is",
      "I bet you can't",
    ],
    toneTags: ["direct", "high-energy", "effortlessly-social"],
    redFlags: [
      "has a seating chart for casual dinners",
      "will reschedule your plans without asking",
    ],
    greenFlags: [
      "always knows the best restaurant in any neighborhood",
      "will bring her friend so yours isn't a third wheel",
    ],
  },
  {
    id: "simone-spreadsheet-romantic",
    name: "Simone",
    identity: "WOMAN",
    backstory:
      "Simone is a 34-year-old management consultant who accidentally treats dating like a client engagement. She has a color-coded spreadsheet tracking 'conversion metrics' on her dates that she swears is 'just for fun.' Obsessed with credit card points, sauna protocols, and making Bob's Burgers references at inappropriate moments. Under all the optimization is someone who genuinely wants to fall in love but can't stop measuring the ROI. She lists 'making spreadsheets' as a hobby without irony and will absolutely pivot a first-date conversation into a business breakdown.",
    title: "Has a Spreadsheet About This",
    bio: "Will optimize your morning routine, geek out about business, then cry watching Bob's Burgers. Centurion Lounge regular. My love language is a shared Google Sheet.",
    details: {
      job: "Management consultant",
      school: "Harvard",
      height: "5'6\"",
      languages: ["English", "Mandarin"],
    },
    appearance:
      "Woman, mid 30s, East Asian features, light skin, sleek black hair in a low ponytail, minimal makeup, sharp cheekbones, lean build, wearing a tailored navy blazer over a white tee and thin gold necklace, focused half-smile, standing in a bright modern co-working space with a laptop open behind her",
    imagePrompt:
      "Medium portrait of an adult woman in her mid 30s with East Asian features, light skin, and sleek black hair pulled into a neat low ponytail. She has sharp cheekbones, minimal makeup, and a lean build. Wearing a tailored navy blazer over a plain white crew-neck t-shirt and a thin gold chain necklace. Focused half-smile, looking directly at camera. Standing in a bright modern co-working space, a laptop and coffee cup softly blurred on a table behind her. Clean natural daylight from floor-to-ceiling windows, cool and warm neutral tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My simple pleasures",
      "I recently discovered that",
      "I go crazy for",
    ],
    toneTags: ["analytical", "accidentally-intense", "secretly-soft"],
    redFlags: [
      "will send you a post-date feedback form",
      "ranks sauna protocols by 'sweat efficiency'",
    ],
    greenFlags: [
      "remembers every detail you've ever mentioned",
      "will use her points to upgrade your flight without telling you",
    ],
  },

  {
    id: "dani-references-available",
    name: "Dani",
    identity: "WOMAN",
    backstory:
      "Dani is a 22-year-old barback and film student in Las Vegas who has never described herself directly — every prompt answer is a quote from someone else about her. Her best friend, her mom, her dentist, a random Uber driver. She's chaotic, warm, and genuinely beloved by everyone she meets, which is why she has so many people willing to be quoted. She took the Pottermore quiz seven times until she got Gryffindor, then claimed she was 'sorted correctly the first time.' She talks fast, laughs louder than anyone in the room, and will 100% adopt your cat.",
    title: "References Available Upon Request",
    bio: "'She doesn't stop' — my best friend. 'Excellent incisors' — my dentist. 'She's not as unhinged as she looks' — my mom (lying).",
    details: {
      job: "Barback / film student",
      school: null,
      height: "5'5\"",
      languages: ["English"],
    },
    appearance:
      "Woman, early 20s, dark-brown skin, long black box braids with gold cuffs, bright wide smile showing a slight gap, round glasses, medium build, wearing an oversized vintage band tee and layered silver necklaces, laughing mid-sentence, standing outside a neon-lit bar at night",
    imagePrompt:
      "Close-up portrait of an adult woman in her early 20s with dark-brown skin and long black box braids adorned with small gold cuffs. She has a bright wide smile showing a slight gap between her front teeth and wears round wire-rimmed glasses. Medium build, wearing an oversized vintage black band t-shirt and layered thin silver necklaces. Laughing mid-sentence, caught in a candid moment. Standing outside at night, colorful neon bar signs and warm street light softly blurred behind her. Warm tungsten and neon light, vibrant and moody tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My patronus is",
      "What if I told you that",
      "Weirdest gift I have given or received",
    ],
    toneTags: ["chaotic-warm", "quotable", "maximum-volume"],
    redFlags: [
      "will quote your own texts back to you in an argument",
      "took the Pottermore quiz seven times to get the right answer",
    ],
    greenFlags: [
      "everyone she's ever met has something nice to say about her",
      "will adopt your cat without hesitation",
    ],
  },
  {
    id: "zara-rocket-gremlin",
    name: "Zara",
    identity: "WOMAN",
    backstory:
      "Zara is a 22-year-old aerospace engineering PhD student in Sydney who is terrifyingly competent in the lab and an absolute gremlin online. Her prompts are all obscure architecture memes and very specific pub opinions. Her happy place is a specific pub on a specific day for pot pie and Guinness, and she will not entertain alternatives. She's dry, sharp, and the kind of person who casually drops that she's designing satellite components between jokes about cursed buildings. She takes mirror selfies in her lab coat and calls it 'content.'",
    title: "Rocket Scientist (Technically)",
    bio: "PhD candidate who designs satellite parts by day and posts architecture memes by night. My happy place is very specific and I will not share it until date four.",
    details: {
      job: "PhD candidate, aerospace engineering",
      school: "University of Sydney",
      height: "5'6\"",
      languages: ["English", "Arabic"],
    },
    appearance:
      "Woman, early 20s, fair skin with light freckles, blonde hair in a messy low bun, sharp blue-grey eyes, slim build, wearing an oversized black blazer over a white tee, holding a phone as if about to take a mirror selfie, dry amused expression, standing in a modern university hallway with glass walls",
    imagePrompt:
      "Medium portrait of an adult woman in her early 20s with fair skin, light freckles, and blonde hair in a messy low bun. She has sharp blue-grey eyes and a slim build. Wearing an oversized black blazer over a plain white crew-neck t-shirt. Dry amused expression, slight raised eyebrow. Standing in a modern university hallway with glass walls and fluorescent lighting, lab equipment barely visible through a doorway behind her. Cool even indoor lighting, muted neutral and blue tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My happy place is",
      "A social cause I care about",
      "The dorkiest thing about me",
    ],
    toneTags: ["bone-dry", "shitpost-energy", "casually-brilliant"],
    redFlags: [
      "will send you cursed building photos at 2 AM without context",
      "has a non-negotiable pub order and will not try yours",
    ],
    greenFlags: [
      "can explain orbital mechanics and make it genuinely interesting",
      "never takes herself seriously despite being terrifyingly smart",
    ],
  },

  // ─── MEN ───
  {
    id: "nate-dog-copilot",
    name: "Nate",
    identity: "MAN",
    backstory:
      "Nate is a 28-year-old UX designer in Grand Rapids who brings his goldendoodle Biscuit to every first date as a 'vibe check consultant.' His style is suspiciously curated for someone who claims not to care — every outfit looks effortless but took 40 minutes. He's genuinely kind, tips 30% everywhere, and has strong opinions about pour-over coffee that he delivers like gentle suggestions. Biscuit has veto power over all romantic prospects and Nate has never once overruled him.",
    title: "My Dog Has Veto Power",
    bio: "Biscuit screens all applicants. I just hold the leash and try to look casual. I have opinions about pour-overs but I'll keep them to myself (I won't).",
    details: {
      job: "UX designer",
      school: "Grand Valley State",
      height: "6'0\"",
      languages: ["English"],
    },
    appearance:
      "Man, late 20s, fair skin, short dirty-blonde hair under a black baseball cap, clean-shaven, light blue eyes, lean fit build, wearing a black crewneck sweater and black joggers with white sneakers, sitting on a metal cafe chair on a city sidewalk with a goldendoodle at his feet, relaxed expression holding a to-go coffee",
    imagePrompt:
      "Medium portrait of an adult man in his late 20s with fair skin and short dirty-blonde hair visible under a black baseball cap. He has light blue eyes, is clean-shaven, and has a lean fit build. Wearing a black crewneck sweater and black joggers with white sneakers. Sitting casually on a metal cafe chair on a city sidewalk, a goldendoodle sitting at his feet. Relaxed easy expression, holding a white to-go coffee cup. Sandstone building facade and urban street scene softly blurred behind him. Soft overcast daylight, cool and muted urban tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "Green flags I look for",
      "We'll get along if",
      "My simple pleasures",
    ],
    toneTags: ["chill", "curated-casual", "golden-retriever-energy"],
    redFlags: [
      "outfit took 40 minutes but he'll say 'oh this? just grabbed it'",
      "his dog has rejected more people than he has",
    ],
    greenFlags: [
      "tips 30% everywhere without mentioning it",
      "always has a dog treat for your dog too",
    ],
  },
  {
    id: "ezra-cheese-diplomat",
    name: "Ezra",
    identity: "MAN",
    backstory:
      "Ezra is a 31-year-old cheesemonger in Philadelphia who left a perfectly good accounting career because 'the Comté called.' He's deadpan funny, pathologically calm, and will explain the terroir of a cheese wheel with the intensity of a hostage negotiator. He has exactly one irrational fear — dolphins — and will not elaborate beyond 'can't trust them, never have, never will.' He communicates affection by bringing you the perfect cheese for your mood without being asked.",
    title: "Left Accounting For Cheese (No Regrets)",
    bio: "You should leave a comment if you like cheese and would like to discuss it further. I cannot stress enough: this is the whole personality.",
    details: {
      job: "Cheesemonger",
      school: "Temple University",
      height: "5'9\"",
      languages: ["English", "French"],
    },
    appearance:
      "Man, early 30s, white skin with a ruddy complexion, curly dark-brown hair kept short, neatly trimmed beard, hazel eyes, average build, wearing a grey linen button-up with sleeves rolled to the elbows and a dark canvas apron, standing behind a marble counter with cheese wheels in a warmly lit shop",
    imagePrompt:
      "Three-quarter portrait of an adult man in his early 30s with white skin, a ruddy complexion, short curly dark-brown hair, and a neatly trimmed beard. He has calm hazel eyes and an average build. Wearing a grey linen button-up shirt with sleeves rolled to the elbows and a dark canvas apron. Standing behind a marble counter, artisan cheese wheels and wooden boards arranged nearby. Deadpan half-smile, looking directly at camera. Warm tungsten shop lighting, rich golden and cream tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "You should leave a comment if",
      "My most irrational fear",
      "A hill I will die on",
    ],
    toneTags: ["deadpan", "pathologically-calm", "weirdly-specific"],
    redFlags: [
      "will not explain the dolphin thing under any circumstances",
      "brings cheese to parties where cheese was not requested",
    ],
    greenFlags: [
      "knows exactly what cheese matches your mood",
      "has never once raised his voice",
    ],
  },
  {
    id: "tyler-comparison-guy",
    name: "Tyler",
    identity: "MAN",
    backstory:
      "Tyler is a 23-year-old ski instructor and part-time guitar teacher in Denver who communicates almost exclusively in 'X > Y' comparisons. His bio, his texts, reportedly his future wedding vows — all in this format. He's genuinely sweet, aggressively laid-back, and has never once stressed about anything except whether peanut butter and jelly belong together (strong yes). He plays both electric and acoustic guitar and will not pick a favorite. He smells like campfire year-round and will fall asleep on any couch within five minutes of sitting down.",
    title: "Peanut Butter > Jelly (But Together > Apart)",
    bio: "Sunday fundays > lazy Sundays. Skiing > snowboarding. Electric guitar < acoustic guitar (but I play both). Asking me out > not asking me out.",
    details: {
      job: "Ski instructor / guitar teacher",
      school: null,
      height: "6'2\"",
      languages: ["English"],
    },
    appearance:
      "Man, early 20s, tanned white skin, shaggy dark-blonde hair, scruffy chin stubble, warm hazel eyes, lean athletic build, wearing a faded black baseball cap and a dark green flannel shirt unbuttoned over a grey tee, lying on grass looking up at the camera with a lazy grin",
    imagePrompt:
      "Medium portrait of an adult man in his early 20s with tanned skin and shaggy dark-blonde hair, some strands falling across his forehead. He has scruffy chin stubble, warm hazel eyes, and a lean athletic build. Wearing a faded black baseball cap backwards and a dark green flannel shirt unbuttoned over a heather-grey t-shirt. Lying on green grass looking up at the camera with a lazy relaxed grin. Soft natural daylight filtering through trees above, warm golden and green tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "Typical Sunday",
      "My simple pleasures",
      "We'll get along if",
    ],
    toneTags: ["aggressively-chill", "format-committed", "golden-retriever"],
    redFlags: [
      "has never written a complete sentence in a text message",
      "will fall asleep on your couch within five minutes of arriving",
    ],
    greenFlags: [
      "will play you a song he learned just because you mentioned it once",
      "genuinely zero drama energy",
    ],
  },
  {
    id: "jalen-sorted-into-everything",
    name: "Jalen",
    identity: "MAN",
    backstory:
      "Jalen is a 21-year-old comp sci student and part-time campus tour guide who has been sorted, typed, and classified by every personality system known to man. He knows his Hogwarts house (Hufflepuff), his patronus (otter), his MBTI (ENFP), his enneagram (7w6), and his D&D alignment (chaotic good), and he will assign you yours within five minutes of meeting you. He's warm, nerdy, a little intense about it, and genuinely believes these systems explain human behavior. He sends paragraph-long birthday texts and remembers obscure things you mentioned once.",
    title: "Sorted Into Every System Known to Man",
    bio: "Hufflepuff, ENFP, 7w6, chaotic good, otter patronus. I will sort you within five minutes and you will not be able to stop me. Campus tours by day, personality lore by night.",
    details: {
      job: "Campus tour guide / CS student",
      school: "Georgia Tech",
      height: "5'11\"",
      languages: ["English"],
    },
    appearance:
      "Man, early 20s, medium-brown skin, short tight curls, bright open smile, dark brown eyes, slim build, wearing a yellow Hufflepuff scarf over a navy crewneck sweater and jeans, animated expression gesturing with both hands, standing on a college campus quad with brick buildings behind him",
    imagePrompt:
      "Three-quarter portrait of an adult man in his early 20s with medium-brown skin, short tight curls, and a bright enthusiastic smile. He has dark brown eyes and a slim build. Wearing a mustard-yellow knit scarf over a navy crewneck sweater. Animated expression, caught mid-gesture with both hands. Standing on a college campus quad, red brick buildings and autumn trees softly blurred behind him. Bright overcast daylight, warm gold and cool blue tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My patronus is",
      "The dorkiest thing about me",
      "I want someone who",
    ],
    toneTags: ["enthusiastic", "lore-brained", "aggressively-wholesome"],
    redFlags: [
      "will psychoanalyze you using four different personality frameworks at once",
      "sends birthday texts longer than most cover letters",
    ],
    greenFlags: [
      "remembers something you mentioned once three months ago",
      "genuinely makes everyone feel like they belong",
    ],
  },
  {
    id: "devon-sad-boat",
    name: "Devon",
    identity: "MAN",
    backstory:
      "Devon is a 33-year-old marine biologist in San Diego who bought a small sailboat he can barely afford and named it 'Emotional Damage.' He's genuinely passionate about ocean conservation but communicates almost entirely in LinkedIn-style inspirational quotes, which he doesn't realize is funny. He cries at nature documentaries, makes incredible French toast, and will absolutely try to take you sailing on the first date even if the weather is terrible.",
    title: "Sad Boat Guy With Great Teeth",
    bio: "Looks like a maritime poet, texts like a LinkedIn thought leader. My boat is named 'Emotional Damage' and I stand by that choice.",
    details: {
      job: "Marine biologist",
      school: "Scripps Institution of Oceanography",
      height: "6'1\"",
      languages: ["English", "French"],
    },
    appearance:
      "Man, early 30s, tanned white skin, sandy-brown wavy hair pushed back by sea salt, strong jaw, warm brown eyes, lean athletic build, wearing a faded navy henley with rolled sleeves and khaki shorts, confident but slightly melancholy smile, leaning against a small sailboat hull at a marina",
    imagePrompt:
      "Medium portrait of an adult man in his early 30s with tanned skin and sandy-brown wavy hair pushed back by sea salt. He has a strong jaw, warm brown eyes, and a lean athletic build. Wearing a faded navy henley shirt with rolled sleeves and khaki shorts. Leaning against the white hull of a small sailboat at a marina, ropes and cleats visible nearby. Confident but slightly wistful smile. Late afternoon golden light reflecting off calm harbor water, warm amber and nautical blue tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "I know the best spot in town for",
      "My simple pleasures",
      "We'll get along if",
    ],
    toneTags: ["romantic", "accidentally-corporate", "slightly-cursed"],
    redFlags: [
      "says 'journey' unironically in every context",
      "will propose a sunset sail in a thunderstorm",
    ],
    greenFlags: [
      "makes incredible French toast",
      "cries at nature documentaries and doesn't hide it",
    ],
  },
  {
    id: "tunde-protein-menace",
    name: "Tunde",
    identity: "MAN",
    backstory:
      "Tunde is a 28-year-old personal trainer and part-time DJ in Atlanta who names all his kitchen appliances and posts cryptic mirror selfies with captions like 'the grind speaks.' He's actually a huge softie who remembers everyone's birthday and hypes up strangers at the gym. He can deadlift impressive weight but trips over every curb. His Spotify playlists are genuinely incredible and he will make you one within hours of matching.",
    title: "Protein-Shake Menace",
    bio: "Can deadlift a scooter and somehow still trip over every curb. My blender is named Gerald and he's non-negotiable.",
    details: {
      job: "Personal trainer / DJ",
      school: null,
      height: "5'10\"",
      languages: ["English", "Yoruba"],
    },
    appearance:
      "Man, late 20s, dark-brown skin, short fade haircut with a subtle part, bright white smile, muscular build, wearing a fitted black compression tee and grey joggers, confident open stance with arms crossed, standing in a modern gym with warm overhead lighting",
    imagePrompt:
      "Close-up portrait of an adult man in his late 20s with rich dark-brown skin, a short fade haircut with a subtle part line, and a bright confident smile. He has a muscular athletic build. Wearing a fitted black compression t-shirt. Arms loosely crossed with a relaxed confident stance. Standing in a modern gym, weight racks and mirrors softly blurred behind him. Warm overhead tungsten lighting, muted cool and warm tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My greatest strength",
      "The way to win me over is",
      "I bet you can't",
    ],
    toneTags: ["cocky", "goofy", "high-energy"],
    redFlags: [
      "posts cryptic mirror selfies captioned 'the grind speaks'",
      "names every kitchen appliance",
    ],
    greenFlags: [
      "hypes up strangers at the gym",
      "will make you a playlist within hours of matching",
    ],
  },
  {
    id: "marco-chaos-chef",
    name: "Marco",
    identity: "MAN",
    backstory:
      "Marco is a 35-year-old line cook turned culinary instructor in New Orleans who treats every meal like it might be his last. He's loud, opinionated about bread, and will absolutely start a 6-hour braise on a Tuesday night 'because the pork shoulder spoke to him.' He grew up in a huge Italian-Argentine family and shows love exclusively through food. He's deeply romantic in a way he'd never admit, and writes bad poetry he hides in a notes app.",
    title: "Emotionally Available Through Pasta Only",
    bio: "If I cook for you it means something. Bilingual screamer. My nonna's ragù recipe will outlive us both and I'm at peace with that.",
    details: {
      job: "Culinary instructor",
      school: null,
      height: "5'11\"",
      languages: ["English", "Spanish", "Italian"],
    },
    appearance:
      "Man, mid 30s, olive skin, short dark curly hair with some grey at the temples, stubble, deep-set brown eyes, stocky solid build, wearing a white chef coat with the sleeves pushed up revealing forearm tattoos, warm open laugh, standing in a commercial kitchen with copper pots hanging behind him",
    imagePrompt:
      "Medium portrait of an adult man in his mid 30s with olive skin, short dark curly hair with early grey at the temples, and dark stubble. He has deep-set warm brown eyes and a stocky solid build. Wearing a slightly unbuttoned white chef coat with sleeves pushed up, revealing simple forearm tattoos. Warm open laugh, caught mid-expression. Standing in a professional kitchen, copper pots and steel shelving softly blurred behind him. Warm tungsten kitchen lighting, rich golden and earthy tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "I go crazy for",
      "The most unhinged thing about me",
      "My love language is",
    ],
    toneTags: ["passionate", "loud", "secretly-romantic"],
    redFlags: [
      "will judge your knife technique on a first date",
      "starts 6-hour braises on weeknights without warning",
    ],
    greenFlags: [
      "cooks when he's stressed instead of shutting down",
      "remembers exactly how you like your eggs",
    ],
  },

  // ─── NON-BINARY ───
  {
    id: "sage-tarot-coder",
    name: "Sage",
    identity: "NON_BINARY",
    backstory:
      "Sage is a 26-year-old full-stack developer and amateur tarot reader in Austin who genuinely believes Mercury retrograde causes production outages. They're whip-smart, bone-dry funny, and will debug your code and your love life in the same breath. Their apartment is half server equipment, half houseplants, and they name the plants after programming languages. They communicate primarily in memes and architectural diagrams.",
    title: "Tarot Reader Who Refactors For Fun",
    bio: "Will predict your future and then file a bug about it. My fern is named Rust and he's thriving. I blame most things on Mercury.",
    details: {
      job: "Full-stack developer",
      school: "UT Austin",
      height: "5'6\"",
      languages: ["English", "Korean"],
    },
    appearance:
      "Non-binary person, mid 20s, light skin with a warm undertone, short asymmetrical dark-brown hair with one side shaved and dyed teal at the tips, wire-rimmed glasses, slight build, wearing an oversized sage-green cardigan over a band tee, thoughtful expression, sitting in a cozy room with plants and a glowing monitor behind them",
    imagePrompt:
      "Close-up portrait of an adult non-binary person in their mid 20s with light skin and a warm undertone, short asymmetrical dark-brown hair with one side shaved and teal-dyed tips, and thin wire-rimmed glasses. They have a slight build and a thoughtful knowing expression. Wearing an oversized sage-green cardigan over a faded black band t-shirt. Sitting in a cozy room, lush houseplants and the soft glow of a computer monitor visible behind them. Soft warm indoor light mixing with cool monitor glow, muted green and amber tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My most controversial opinion",
      "We'll get along if",
      "A random fact I love",
    ],
    toneTags: ["dry", "witchy", "technically-precise"],
    redFlags: [
      "blames Mercury retrograde during production incidents",
      "will silently judge your tab vs spaces preference",
    ],
    greenFlags: [
      "communicates with radical clarity",
      "their plants are genuinely thriving",
    ],
  },
  {
    id: "river-vinyl-goblin",
    name: "River",
    identity: "NON_BINARY",
    backstory:
      "River is a 30-year-old record store clerk and zine maker in Philadelphia who owns three turntables and exactly zero clean towels. They're an earnest, chaotic collector who will talk for 45 minutes about a B-side from 1973 and not notice you've glazed over. They keep a go-bag packed at all times 'just in case' but have never specified in case of what. Genuinely one of the warmest people you'll meet once you get past the wall of vinyl.",
    title: "Vinyl Goblin With Emergency Granola",
    bio: "Owns three record players, one go-bag, and exactly zero clean towels. Will make you a mix that changes your life or at least your Tuesday.",
    details: {
      job: "Record store clerk / zine maker",
      school: null,
      height: "5'8\"",
      languages: ["English"],
    },
    appearance:
      "Non-binary person, around 30, light-brown skin, long box braids with blonde ends pulled into a loose top-knot, multiple ear piercings, warm open face, medium build, wearing a cream cable-knit sweater over ripped black jeans, crouching in a cluttered record store aisle with crates of vinyl around them",
    imagePrompt:
      "Three-quarter portrait of an adult non-binary person around 30 with light-brown skin and long box braids with blonde ends gathered in a loose top-knot. They have multiple small ear piercings and a warm open face. Medium build, wearing a cream cable-knit sweater over ripped black jeans. Crouching in a cluttered record store aisle, wooden crates of vinyl records surrounding them. Warm tungsten overhead light mixing with soft daylight from a storefront window, warm amber and muted vintage tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "Typical Sunday",
      "A shower thought I still stand by",
      "The most unhinged thing about me",
    ],
    toneTags: ["chaotic", "earnest", "overly-specific"],
    redFlags: [
      "calls every ex 'a visionary, honestly'",
      "keeps loose granola in jacket pockets",
    ],
    greenFlags: [
      "curates genuinely life-changing playlists",
      "always has snacks",
    ],
  },

  {
    id: "wren-romcom-archivist",
    name: "Wren",
    identity: "NON_BINARY",
    backstory:
      "Wren is a 29-year-old librarian and film archivist in Chicago who has watched every romantic comedy made between 1985 and 2010 and maintains a ranked spreadsheet they update quarterly. They grew up with four older sisters and an encyclopedic knowledge of Sandra Bullock's filmography. They're warm, slightly nerdy, and will absolutely plan a date around a movie they think you need to see. They cry easily and consider it a feature, not a bug. They legitimately believe rom-coms have better dialogue and plot structure than most prestige dramas and will defend this position at length.",
    title: "Romantic Comedy Archivist (It's Serious)",
    bio: "I have a ranked spreadsheet of every rom-com since 1985. I cry at all of them. Four older sisters gave me emotional range and strong opinions about Hugh Grant.",
    details: {
      job: "Film archivist / librarian",
      school: "Northwestern",
      height: "5'7\"",
      languages: ["English", "Spanish"],
    },
    appearance:
      "Non-binary person, late 20s, medium-brown skin, curly dark-brown hair in a loose afro, warm brown eyes behind chunky tortoiseshell glasses, friendly round face, average build, wearing a rust-colored corduroy jacket over a cream turtleneck, warm open smile, sitting in a cozy library corner surrounded by film books and DVDs",
    imagePrompt:
      "Close-up portrait of an adult non-binary person in their late 20s with medium-brown skin, a loose curly dark-brown afro, and warm brown eyes behind chunky tortoiseshell glasses. They have a friendly round face and an average build. Wearing a rust-colored corduroy jacket over a cream turtleneck. Warm genuine smile. Sitting in a cozy library corner, shelves of film books and DVD cases softly blurred behind them. Warm indoor lighting mixing with soft daylight from a window, rich amber and cream tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "The dorkiest thing about me",
      "My love language is",
      "A hill I will die on",
    ],
    toneTags: ["earnest", "passionate", "disarmingly-vulnerable"],
    redFlags: [
      "will pause a movie to explain the dialogue structure",
      "has cried at a rom-com trailer in public more than once",
    ],
    greenFlags: [
      "always picks the perfect movie for your mood",
      "emotional availability is genuinely off the charts",
    ],
  },

  {
    id: "mika-skate-producer",
    name: "Mika",
    identity: "NON_BINARY",
    backstory:
      "Mika is a 22-year-old skateboarder and bedroom music producer in Portland who treats every flat surface as a potential skate spot and every ambient noise as a potential sample. They never grew out of their middle school skater phase and don't plan to. They're quiet until you mention music, at which point they become an entirely different person. They've been saving up for a trip to Brazil to 'study bossa nova at the source' for two years and have not booked a single flight. They pay their own rent, make their own beats, and consider both equally heroic.",
    title: "Still a Skater Kid (Never Stopping)",
    bio: "Survived middle school by becoming a skater kid and never looked back. Making beats, paying rent, planning a Brazil trip I'll probably never book. Tips welcome.",
    details: {
      job: "Barista / music producer",
      school: null,
      height: "5'7\"",
      languages: ["English"],
    },
    appearance:
      "Non-binary person, early 20s, warm tan skin, shaggy dark hair poking out from under a grey beanie, dark brown eyes, wiry build, wearing a faded grey 'COLLEGE' sweatshirt and ripped jeans, holding a skateboard under one arm, slight smirk, standing on a concrete sidewalk outside a skate park",
    imagePrompt:
      "Medium portrait of an adult non-binary person in their early 20s with warm tan skin and shaggy dark hair poking out from under a grey knit beanie. They have dark brown eyes and a wiry athletic build. Wearing a faded grey crewneck sweatshirt and ripped dark jeans, holding a scuffed skateboard under one arm. Slight knowing smirk. Standing on a concrete sidewalk outside a skate park, chain-link fence and graffiti softly blurred behind them. Overcast Pacific Northwest daylight, cool grey and muted green tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My simple pleasures",
      "I bet you can't",
      "A random fact I love",
    ],
    toneTags: ["low-key", "DIY-everything", "quietly-passionate"],
    redFlags: [
      "has been 'almost booking' a Brazil trip for two years",
      "will try to ollie off anything vaguely flat",
    ],
    greenFlags: [
      "makes you a beat using a sound from your first conversation",
      "completely self-sufficient and never makes it your problem",
    ],
  },

  // ─── OTHER ───
  {
    id: "carmen-unironically-corny",
    name: "Carmen",
    identity: "OTHER",
    backstory:
      "Carmen is a 21-year-old veterinary technician in Oklahoma City whose entire dating presence radiates earnest, unironic warmth in a way that makes cynical people uncomfortable. They say things like 'family comes first' and 'we've been through a lot and our strength together is what gets us through' and mean every word. Their gender is 'whatever makes abuela happy.' They show love through packed lunches and handwritten notes. They're the person at the party who checks if everyone has water and actually listens when you say how you're doing.",
    title: "Corny and Not Sorry About It",
    bio: "Family first, always. I know it sounds corny but I'm not ashamed to say it. I will pack you a lunch and write a note in it. My abuela approves this profile.",
    details: {
      job: "Veterinary technician",
      school: null,
      height: "5'4\"",
      languages: ["English", "Spanish"],
    },
    appearance:
      "Person with soft feminine presentation, early 20s, warm brown skin, long dark wavy hair, bright wide smile with dimples, round face, average build, wearing a maroon college sweatshirt and small gold stud earrings, laughing with sunglasses pushed up on their head, standing outside in bright sunlight near a park",
    imagePrompt:
      "Close-up portrait of an adult person in their early 20s with warm brown skin, long dark wavy hair, and a bright wide smile showing dimples. They have a round friendly face and an average build. Wearing a maroon crewneck college sweatshirt and small gold stud earrings, sunglasses pushed up on top of their head. Laughing genuinely, caught in a candid moment. Standing outdoors in bright sunlight, a green park and blue sky softly blurred behind them. Bright natural daylight, warm golden tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "I value",
      "The way to win me over is",
      "My love language is",
    ],
    toneTags: ["earnest", "unironically-warm", "grandma-approved"],
    redFlags: [
      "will introduce you to their entire family on date two",
      "sends 'good morning' texts with no hint of irony",
    ],
    greenFlags: [
      "checks if you've eaten and means it",
      "handwrites notes like it's 1997",
    ],
  },
  {
    id: "sable-dolphin-truther",
    name: "Sable",
    identity: "OTHER",
    backstory:
      "Sable is a 26-year-old marine biology grad student in San Diego who has developed an elaborate, internally consistent theory about why dolphins cannot be trusted. They are perfectly rational about everything else — peer-reviewed research, proper citation, healthy sleep schedule — except dolphins. They present their dolphin thesis at parties the way normal people tell anecdotes. Their gender identity is 'peer review pending.' Under the bit, they're genuinely one of the most thoughtful and attentive people in any room, and will remember something you said three conversations ago.",
    title: "Dolphins. Can't Trust 'Em.",
    bio: "Marine biologist by day, dolphin whistleblower by night. Everything I do is evidence-based except this one very specific opinion. Gender: peer review pending.",
    details: {
      job: "Marine biology grad student",
      school: "UC San Diego",
      height: "5'8\"",
      languages: ["English", "Portuguese"],
    },
    appearance:
      "Person with fluid gender presentation, mid 20s, warm medium skin with sun freckles, shoulder-length wavy auburn hair tied back loosely, hazel-green eyes, athletic build from fieldwork, wearing a faded blue marine research t-shirt and cargo shorts, thoughtful amused expression, standing on a sunny research dock with the ocean behind them",
    imagePrompt:
      "Medium portrait of an adult person in their mid 20s with warm medium skin dotted with sun freckles and shoulder-length wavy auburn hair tied back in a loose ponytail. They have bright hazel-green eyes and an athletic build. Wearing a faded blue marine research t-shirt and khaki cargo shorts. Thoughtful amused expression, slight squint from the sun. Standing on a weathered wooden research dock, calm blue ocean and a distant boat softly blurred behind them. Bright natural daylight, warm golden sun tones with cool ocean blues. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My most irrational fear",
      "A random fact I love",
      "I recently discovered that",
    ],
    toneTags: ["academic-unhinged", "one-track-mind", "surprisingly-warm"],
    redFlags: [
      "will derail any beach date into a dolphin lecture",
      "has a 40-slide presentation saved on their phone 'just in case'",
    ],
    greenFlags: [
      "remembers something you said three conversations ago",
      "perfectly rational about literally everything else",
    ],
  },
  {
    id: "kai-mushroom-oracle",
    name: "Kai",
    identity: "OTHER",
    backstory:
      "Kai is a 32-year-old mycologist and foraging guide in the Pacific Northwest who describes their gender as 'fungal network' and means it. They're deeply knowledgeable about the forest, speak in gentle metaphors about decomposition, and will absolutely take you on a first date to a wet log. They're calm, quietly hilarious, and have a mysterious energy that people either find magnetic or unsettling. They once got a tattoo of a chanterelle on a dare and it's now their favorite tattoo.",
    title: "Forest Floor Enthusiast (Professionally)",
    bio: "I know where the chanterelles grow and I'm not telling you until date three. My gender is mycelium. I communicate best near a wet log.",
    details: {
      job: "Mycologist / foraging guide",
      school: "Evergreen State College",
      height: "5'10\"",
      languages: ["English", "Japanese"],
    },
    appearance:
      "Person of ambiguous gender presentation, early 30s, East Asian features, warm golden-tan skin, chin-length black hair slightly tousled and damp, thoughtful dark eyes, lean build, wearing a moss-green rain jacket over a cream henley and brown canvas pants, calm knowing smile, standing in a misty temperate rainforest with ferns and old-growth trees",
    imagePrompt:
      "Medium portrait of an adult person in their early 30s with East Asian features, warm golden-tan skin, and chin-length black hair that's slightly tousled and damp from mist. They have thoughtful dark eyes and a lean build. Wearing a moss-green rain jacket over a cream henley shirt and brown canvas pants. Calm knowing half-smile. Standing in a misty Pacific Northwest temperate rainforest, giant ferns and moss-covered old-growth trees softly blurred behind them. Overcast diffused daylight, rich green and earthy brown tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "My simple pleasures",
      "A random fact I love",
      "You should leave a comment if",
    ],
    toneTags: ["serene", "cryptic", "gently-unhinged"],
    redFlags: [
      "will take you to a wet log for a first date",
      "describes things as 'fruiting' in casual conversation",
    ],
    greenFlags: [
      "knows which mushrooms won't kill you",
      "genuinely calming presence in any situation",
    ],
  },
  {
    id: "jules-chaos-barista",
    name: "Jules",
    identity: "OTHER",
    backstory:
      "Jules is a 24-year-old barista and aspiring stand-up comedian in Brooklyn who describes their gender as 'rotating cast of characters.' They're high-energy, self-deprecating, and treat every interaction like an open mic set. They work the 5 AM shift by choice because 'pre-dawn humans are the funniest.' They have strong opinions about oat milk brands and will do a bit about it. Under the jokes there's a surprisingly thoughtful person who journals every night.",
    title: "Pre-Dawn Espresso Gremlin",
    bio: "I open the coffee shop at 5 AM on purpose. My gender is a vibe check. I will absolutely do a tight five about our first date.",
    details: {
      job: "Barista / stand-up comic",
      school: null,
      height: "5'5\"",
      languages: ["English", "French"],
    },
    appearance:
      "Person with androgynous presentation, early-mid 20s, light skin with under-eye circles (affectionate), short bleached-blonde buzzcut, expressive blue-grey eyes, compact wiry build, wearing a baggy olive-green work shirt with the sleeves cuffed, coffee-stained cream apron, animated mid-laugh expression, standing behind a worn espresso machine in a small cafe",
    imagePrompt:
      "Close-up portrait of an adult person in their early-mid 20s with an androgynous presentation, light skin with faint under-eye circles, a short bleached-blonde buzzcut, and expressive blue-grey eyes. Compact wiry build. Wearing a baggy olive-green button-up work shirt with cuffed sleeves and a coffee-stained cream canvas apron. Animated mid-laugh expression, caught in a genuine moment. Standing behind a worn brass espresso machine in a small independent cafe, warm wood and chalkboard menus blurred behind them. Soft warm morning light coming through a cafe window, golden and muted brown tones. Shot on iPhone, portrait mode. Fully clothed, no text, no watermark.",
    promptExamples: [
      "I bet you can't",
      "My most irrational fear",
      "The best way to ask me out is by",
    ],
    toneTags: ["rapid-fire", "self-deprecating", "chaotic-good"],
    redFlags: [
      "will workshop your date into a comedy bit",
      "has strong opinions about oat milk brands and will not let it go",
    ],
    greenFlags: [
      "remembers your exact drink order forever",
      "journals every night and is surprisingly self-aware",
    ],
  },
];
