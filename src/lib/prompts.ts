const PROMPT_BANK: string[] = [
  // ==========================================================================
  // SOCIAL LANDMINES — things to say, do, find, or discover in specific
  // situations. The bread and butter of Quiplash: high-stakes embarrassment.
  // ==========================================================================

  // Dates, relationships & family
  "The worst thing to say on a first date",
  "The worst thing to say when meeting your partner's parents for the first time",
  "A bad reason to break up with someone over text",
  "The most awkward thing to put in your dating profile bio",
  "A suspicious thing to know way too much about on a first date",
  "A suspicious thing to be caught Googling by your partner",
  "A terrible thing to say while someone is showing you their family tree",
  "The worst thing to caption a family photo with",
  "The most unhinged thing someone's dating app AI wrote on their behalf",
  "The worst thing to discover about your date by Googling them at the table",

  // Work & professional
  "The worst thing to say during a job interview when they ask 'Any questions?'",
  "The worst thing to list under 'Special Skills' on a resume",
  "The worst thing to accidentally say on a hot mic at a press conference",
  "A terrible way to announce you're quitting your job",
  "A terrible way to start a best man speech",
  "The worst thing to put in the company suggestion box on your first day",
  "The worst possible answer to 'So, what do you do for a living?'",
  "The worst way to find out you've been fired",
  "The worst thing to accidentally project on screen during a work presentation",
  "The worst thing to accidentally say in a company-wide reply-all email",
  "The most passive-aggressive thing to write on a coworker's going-away card",

  // Travel & transit
  "The worst thing to find in your pocket at airport security",
  "The worst thing to say to customs when they ask the purpose of your visit",
  "The worst thing to say to the person sitting next to you on a 14-hour flight",
  "The worst thing to whisper to the person next to you during heavy turbulence",
  "The least reassuring thing a pilot could say before takeoff",
  "The worst thing to say to your Lyft driver right as you get in the car",
  "The worst thing to discover about your Airbnb after midnight",
  "Something you definitely don't want to find in a hotel lost and found",

  // Weddings, funerals & ceremonies
  "The worst thing to whisper to the person next to you at a funeral",
  "Something that would absolutely ruin a wedding reception",
  "The worst superpower to discover on your wedding day",
  "The worst gift to give your boss at the company holiday party",
  "The worst thing to write inside a sympathy card",
  "A terrible thing to whisper to a baby at a christening",
  "A terrible theme for a gender reveal party that somehow makes the news",
  "The worst thing to say while being introduced to the Queen",

  // Food & dining
  "The worst thing to find floating in your soup at a five-star restaurant",
  "The most concerning thing to overhear from a restaurant kitchen",
  "The worst thing to say when the waiter asks 'How is everything?'",
  "The most alarming item on a restaurant's health inspection report",
  "The most unhinged voicemail to leave a restaurant after a bad meal",
  "The worst thing to bring to a potluck and act like it's normal",

  // Medical & emergency
  "A bad reason to call 911",
  "A terrible thing to yell while being wheeled into surgery",
  "The worst thing to discover your surgeon Googling right before your operation",
  "The worst thing to realize mid-skydive",
  "The worst side effect listed on a medication commercial that nobody questions",
  "A terrible thing to overhear your therapist say about you to another therapist",

  // Encounters with strangers & acquaintances
  "The worst thing to say to a cop while eating a burrito during a traffic stop",
  "The worst thing to say into a walkie-talkie",
  "The worst thing to shout from a rooftop",
  "The worst thing to yell across a crowded restaurant to get your friend's attention",
  "Something you should never do in an elevator full of strangers",
  "Something you should never put on a billboard in Times Square",
  "A bumper sticker that would get your car keyed",
  "The worst thing to be the last person caught doing on a security camera",

  // Everyday & miscellaneous social
  "A terrible excuse for being three hours late to your own birthday party",
  "The worst thing to say to someone who just showed you their newborn baby",
  "The worst thing to say out loud while getting a face tattoo",
  "The worst thing to bring to show-and-tell in kindergarten",
  "The most suspicious thing to Google right before a dinner party",
  "The worst thing to overhear through thin apartment walls",
  "An alarming thing to overhear at a children's playground",
  "A terrible thing to be caught doing by your neighbor at 4 AM",
  "A terrible thing to be caught practicing in the mirror",
  "An inappropriate time to do a victory dance",
  "The worst thing to be doing when the rapture happens",
  "The worst thing to be doing when the Zoom camera accidentally turns on",
  "A terrible thing to admit during a game of Never Have I Ever",
  "The worst thing to say to someone clearly crying in the office bathroom",
  "The most alarming thing to yell when the roller coaster gets stuck upside down",
  "A terrible thing to say to comfort someone stuck in an elevator",
  "The worst thing to write on a 'Get Well Soon' balloon",
  "Something you'd be surprised to see a grandma pull out of her purse",
  "Something you should never do while holding a baby",
  "The 'before and after' transformation on social media that went horribly wrong",
  "The worst thing to discover your kid drew in art class and titled 'My Family'",
  "A terrible thing to be doing when the earthquake drill turns out to be real",
  "The worst thing to say after someone finishes singing happy birthday to you",

  // ==========================================================================
  // NAMING & CREATING — name a product, band, word, slogan, etc.
  // The "come up with a name" format consistently produces the funniest answers.
  // ==========================================================================
  "Name a candle scent designed specifically for guys who peaked in high school",
  "Come up with a name for the sketchy gas station energy drink nobody should try",
  "Name a workout class that would empty the gym in seconds",
  "Come up with a name for a dating app exclusively for people with terrible judgment",
  "Name a font nobody would ever use on a resume",
  "Come up with a name for a perfume by your most unhinged ex",
  "Name a cocktail that would get you banned from the bar permanently",
  "Name a children's book by someone who clearly hates children",
  "Make up a word for the feeling you get when you wave back at someone who wasn't waving at you",
  "Come up with a catchy but deeply wrong slogan for a funeral home",
  "Name a DJ who should absolutely not be allowed near a turntable",
  "A rejected name for a children's TV show",
  "A terrible name for a band that only plays at retirement homes",
  "The worst name for a children's hospital clown",
  "A terrible name for a brand of discount parachutes",
  "A terrible name for a support group",
  "A terrible name for a neighborhood watch group",
  "A perfume name that would never sell",
  "The worst thing to name your WiFi network in an apartment building",
  "The most passive-aggressive thing to name your sourdough starter",
  "A new crayon color that Crayola would never approve",
  "The worst ice cream flavor that somehow got approved",
  "A terrible motto for a dating app",
  "A bad slogan for a skydiving company",
  "A terrible tagline for a haunted house that's trying to be family-friendly",
  "A self-help book title that would make everything worse",
  "A terrible warning label that would make you buy the product faster",
  "A reality TV show concept that would get cancelled after one episode",
  "Name a cologne that smells exactly like poor decisions",
  "Name a therapy app for people whose therapist gave up on them",
  "Name a startup that would get funded but definitely shouldn't exist",
  "Come up with a name for a cruise ship that's definitely going to sink",
  "Name a candle scent that perfectly captures 'working from home for 3 years'",
  "A rejected Girl Scout cookie flavor",
  "Name a gym that specifically targets people who will never actually go",
  "Come up with a name for Ozempic but for your personality",
  "Name a TED Talk that would get the speaker escorted offstage",
  "A terrible name for a service dog",
  "Name a new Gatorade flavor for people going through a breakup",

  // ==========================================================================
  // HIDDEN TRUTHS & SECRET LIVES — what X really thinks, does, or is hiding.
  // Conspiracy-style absurdism and anthropomorphic humor.
  // ==========================================================================
  "What your dog is actually thinking when it stares at you from across the room",
  "What aliens would put in their Yelp review of Earth",
  "What cats discuss at their secret 3 AM meetings",
  "What your houseplants judge you hardest for",
  "What pigeons are actually plotting in the park",
  "What your smart fridge tells the other appliances about you",
  "What the Easter Bunny does the other 364 days of the year",
  "What your Roomba has seen that it wishes it could forget",
  "What raccoons are actually doing with all that garbage",
  "What seagulls are screaming about",
  "Something squirrels are definitely plotting behind your back",
  "The petition your dog would start if it understood the internet",
  "The crime your cat would commit if it had thumbs",
  "The worst animal to show up uninvited to your wedding",
  "The worst thing a parrot could say in front of your in-laws",
  "A strange thing for your dog to suddenly say in perfect English",
  "A sure sign your new roommate is actually a ghost",
  "The one thing you never want your smart home to start doing on its own",
  "The secret ingredient grandma will take to her grave",
  "The real reason traffic was backed up for three miles",
  "Something you'd find in the terms of service if you actually read them",
  "The real reason your Uber driver has a 2.3-star rating",
  "An unusual thing to find growing in your college dorm fridge",
  "The worst thing to find behind your bathroom mirror when you move in",
  "The real reason your neighbor built that fence so high",
  "A strange law that somehow exists in a small town",
  "Something that is weirdly improved by adding cheese",
  "What Siri actually thinks when you ask a dumb question at 2 AM",
  "What your therapist writes in their notes after you leave",
  "What the Roomba would say in its own therapy session",
  "What your emotional support animal secretly judges you for",
  "The real reason your WiFi goes out every time you're about to win an argument online",

  // ==========================================================================
  // CORPORATE HELL & MODERN LIFE — workplace nightmares, tech horror,
  // products that shouldn't exist, and the indignities of adulting.
  // ==========================================================================

  // Workplace
  "The most unhinged LinkedIn post you've ever seen",
  "The worst icebreaker at a mandatory corporate team-building retreat",
  "The worst 'fun fact about yourself' to share on your first day of work",
  "The most unsettling thing to say during a performance review",
  "An HR complaint that would immediately get you a second HR complaint",
  "The worst thing to put in a company-wide Slack message",
  "The worst noise to make during a conference call you forgot to mute",
  "A terrible thing to write on a noise complaint",
  "The most unhinged out-of-office email auto-reply",
  "The rejected slogan that got someone fired from the marketing team",
  "The worst possible theme for a company holiday party",
  "The most unsettling thing to write on a whiteboard and leave in a conference room",
  "The most alarming thing to find in the company fridge with your name on it",

  // Technology nightmares
  "The most alarming thing in someone's browser history",
  "The worst thing for Alexa to say unprompted at 3 AM",
  "The group chat message that ends a friendship",
  "The worst thing for your phone to autocomplete after 'Hey Mom, I just'",
  "The most cursed thing to find in someone's camera roll",
  "The worst thing your smart TV could recommend based on your viewing habits",
  "An app notification that would ruin your day",
  "The worst thing to go viral for",
  "The worst thing to automate with AI",
  "The worst notification to get from your bank at 3 AM",
  "The worst thing to accidentally like on your boss's Instagram at 2 AM",
  "The most unhinged thing someone used ChatGPT for",
  "The AI-generated image that should never have been created",
  "The worst thing for your screen time report to reveal",

  // Products & services
  "A product that would instantly bomb on Shark Tank",
  "A subscription service that absolutely should not exist",
  "The worst product to advertise during the Super Bowl",
  "The worst thing to sell at a school fundraiser",
  "A gym membership perk that would make everyone cancel",
  "The worst company to sponsor a children's sports team",
  "The most suspicious item to buy in bulk at 2 AM",

  // Adulting
  "The worst thing to bring up at an HOA meeting",
  "The worst thing to discover on your itemized hospital bill",
  "A terrible thing to say to the person behind you in line at the DMV",
  "The worst thing to mutter under your breath at a PTA meeting",
  "You discover your Ancestry DNA results and the weirdest thing they reveal",
  "The single worst sentence to hear from your landlord",
  "The worst voicemail to accidentally leave on your ex's phone",
  "The worst thing to realize when your Ozempic prescription runs out",
  "The most unhinged thing to do because the WiFi went down for 10 minutes",

  // ==========================================================================
  // HISTORY, POP CULTURE & CELEBRITIES — rewrites of famous events,
  // movie/TV references, and famous people in absurd contexts.
  // ==========================================================================

  // Historical rewrites
  "The Titanic actually sank because of ______",
  "What Neil Armstrong actually said when he stepped on the moon: '______'",
  "The real reason Napoleon always had his hand in his jacket: ______",
  "The Egyptian pyramids were actually built to ______",
  "The real message behind the Mona Lisa's smile: ______",
  "What was really in Al Capone's vault: ______",
  "The real reason Area 51 is so heavily guarded: ______",
  "The Bermuda Triangle is actually caused by ______",
  "The real reason the Berlin Wall came down: ______",
  "What Cleopatra was actually famous for: ______",
  "The secret clause in the Declaration of Independence: ______",
  "What the builders of Stonehenge were actually trying to do: ______",
  "A surprising job entry on Abraham Lincoln's resume",
  "Historians recently discovered that the first words spoken on the telephone were actually '______'",

  // Pop culture
  "The worst sequel nobody asked for: ______ 2",
  "Worst Taylor Swift breakup song title",
  "______ would make a terrible Jedi",
  "The celebrity most likely to accidentally start a cult",
  "The real reason Darth Vader turned to the dark side",
  "A TikTok trend that would end civilization",
  "The worst person to be stuck in an escape room with",
  "If AI took over, the first thing it would cancel: ______",
  "The worst character to cosplay at a job interview",
  "______ is just Batman with extra steps",
  "The worst contestant on The Bachelor would be ______",
  "A Disney movie that should never get a live-action remake",

  // Celebrity & character absurdity
  "The Pope's most embarrassing Google search",
  "A Yelp review of hell written by someone who just arrived",
  "What a pirate would put on their LinkedIn profile",
  "The most unsettling thing to find in a wizard's browser history",
  "An unexpected item on a wizard's LinkedIn profile",
  "Nicolas Cage's rejected movie pitch: ______",
  "Florida Man's greatest achievement this year: ______",
  "The worst person to narrate a nature documentary about your daily routine",
  "A terrible thing for the Dalai Lama to endorse on Instagram",
  "A movie that would be 10x better if every role was played by Nicolas Cage",
  "What a caveman's Yelp review of modern life would say",
  "The most unsettling thing on Santa's real naughty list",

  // ==========================================================================
  // KIDS, ANIMALS & FOOD CRIMES — childhood nightmares, fairy tales gone
  // wrong, animal absurdity, and culinary atrocities.
  // ==========================================================================

  // Childhood & fairy tales
  "A terrible moral for a children's fable",
  "The worst thing to hide in an Easter egg hunt",
  "A deleted scene from your favorite fairy tale",
  "The worst bedtime story for a five-year-old",
  "A terrible revision to the rules of hide-and-seek",
  "The worst field trip a school has ever taken",
  "A children's song lyric that hits different as an adult",
  "A line that was cut from a children's movie for being too dark",
  "The worst thing a birthday clown could whisper to you",
  "The worst advice to give a teenager on their first day of high school",
  "Something that should never be used as a piñata",

  // Food crimes
  "A pizza topping that should be a felony",
  "The worst thing to bring to a church bake sale",
  "A food combination that should land you in prison",
  "The worst daily special at a food truck called 'Trust Me Bro'",
  "The most unhinged thing to order at a drive-through at 3 AM",
  "The worst cooking show hosted by someone who clearly can't cook",
  "The worst thing to dip a chicken nugget in",
  "The secret ingredient in grandma's famous pie that you wish you never asked about",
  "A gas station sushi special that somehow has a 5-star review",
  "And today's soup is Cream of ______",

  // ==========================================================================
  // EXISTENTIAL, ABSURD & HYPOTHETICAL — 3 AM realizations, what-ifs,
  // ironic inversions, constraint prompts, and little-known "facts."
  // ==========================================================================

  // Existential dread
  "The worst thing to realize at 3 AM when you can't sleep",
  "A terrible thought to have during a moment of silence",
  "The worst epiphany to have in a grocery store parking lot",
  "What the light at the end of the tunnel actually is",
  "The most depressing fortune cookie message that's technically accurate",
  "God's most regrettable creation",
  "The worst thing to hear from your guardian angel",
  "The thing that would get you kicked out of heaven",

  // Ironic inversions — "the best of" bad things
  "The best thing about going to prison",
  "The best part of being haunted by a ghost",
  "A surprisingly good reason to live in a dumpster",
  "The one upside of being struck by lightning",
  "The silver lining of getting abducted by aliens",
  "The unexpected perk of being a ghost",
  "The best part of getting lost in IKEA for 48 hours",
  "A surprisingly valid reason to start a cult",
  "The silver lining of civilization collapsing",

  // Hypotheticals
  "If animals held a trial for humanity, the main charge would be: ______",
  "If your last meal had to be from a gas station, you're ordering: ______",
  "If babies could talk, the first complaint would be: ______",
  "What would happen if dogs could send text messages",
  "If the internet had existed in medieval times, the top trending topic would be: ______",
  "If ghosts could leave Yelp reviews of the houses they haunt: ______",
  "If your pet could file one complaint with HR about you: ______",
  "If you could add one amendment to the Constitution, but it has to be stupid: ______",

  // Constraint prompts
  "Using only two words, ruin a first date",
  "In exactly three words, describe your internet search history",
  "A four-word sentence that would get you kicked out of any restaurant",
  "The two-word text that would end any relationship instantly",
  "Using only two words, start a riot at Thanksgiving dinner",
  "A three-word acceptance speech for winning World's Worst Person",
  "The one-word answer that would get you kicked out of therapy",

  // Little-known "facts"
  "Little-known fact: the government allows cereal to contain up to 10% ______",
  "Scientists just confirmed: the leading cause of Monday is actually ______",
  "Little-known fact: a secret room in the White House is called the ______ Room",
  "According to a recent study, 1 in 4 Americans secretly ______",
  "Little-known fact: ______ is technically illegal in 12 states",
  "Historians just discovered that the first thing ever sold on the internet was ______",

  // ==========================================================================
  // CONFESSIONS & SELF-ROASTS — first-person admissions and personal reveals.
  // ==========================================================================
  "I'm not saying it was my fault, but ______",
  "My search history proves that I'm ______",
  "I peaked in life when ______",
  "The hill I will absolutely die on: ______",
  "I'm one bad day away from ______",
  "The lie I tell most often: ______",
  "I have never once in my life successfully ______",
  "I'm not proud of it, but I once ______",
  "The thing I'd confess on my deathbed: ______",
  "A concerning talent to discover at age 40",
  "The worst possible headline about your hometown",
  "A terrible thing to be ranked #1 in the world at",
  "My toxic trait is ______ and honestly I'm thriving",
  "I spent my entire therapy session talking about ______",
  "The most unhinged thing I've done during a power outage",
  "I drink to forget ______",

  // ==========================================================================
  // FILL-IN-THE-BLANK — complete the sentence. The "madlib" format:
  // a familiar phrase or scenario with a blank to fill.
  // ==========================================================================
  "The absolute worst thing to find at the bottom of your ______",
  "Never bring ______ to Thanksgiving dinner",
  "I'm sorry officer, I had no idea it was illegal to keep ______ in my trunk",
  "The Real Housewives of ______",
  "Nobody wants a scented candle that smells like ______",
  "Worst excuse for missing work: 'I had to take my ______ to the vet'",
  "I survived the zombie apocalypse with nothing but ______ and sheer willpower",
  "It's not a real party until someone brings out the ______",
  "Instead of a mint, the world's worst hotel leaves ______ on your pillow",
  "The real secret to living past 100 is a daily glass of ______",
  "You should never, ever put ______ in a microwave",
  "The worst thing to realize you forgot right as you board a ______",
  "The worst part about living forever: ______",
  "A sure sign you've become your parents: ______",
  "The worst possible place to propose: ______",
  "The real reason we don't have flying cars: ______",
  "My spirit animal is ______ and I'm not proud of it",
  "If I were a ghost, the first thing I'd haunt: ______",
  "______ would make an excellent roller coaster name",
  "______: sounds fun until you're three drinks in",
  "______ is what I scream when I stub my toe at 2 AM",
  "The worst tattoo to get on your forehead: ______",
  "If I ran for president, my first executive order: ______",
  "Terrible band name, but excellent ______",
  "______ is the real reason I have trust issues",
  "I'm not a doctor, but I'd prescribe ______ for that",
  "New from IKEA: the ______ — some assembly required",
  "Breaking news: Florida Man arrested for ______",
  "I'd sell my soul for ______, no questions asked",
  "Worst inspirational poster: a sunset with the caption '______'",
  "If my life had a Yelp review, it would say: ______",
  "______ should be illegal but somehow isn't",
  "My autobiography would be titled '______'",
  "The one thing keeping me alive is ______",
  "Dear diary, today I learned the hard way that ______",
  "They say money can't buy happiness, but it can buy ______",
  "My therapist says I need to stop ______",
  "The last thing you want printed on your tombstone: ______",
  "The worst thing to find inside a birthday cake: ______",
  "The worst thing a parrot could learn to say: '______'",
  "The real reason I got banned from ______",
  "The worst way to start a TED Talk: '______'",
  "Nobody warned me that adulthood was mostly ______",
  "The worst thing a fortune teller could predict: ______",
  "The worst possible Jeopardy! category: ______",
  "If aliens intercepted one thing from Earth, I hope it's not ______",
  "The world record nobody wants to hold: most ______",
  "The worst thing to hear after saying 'I do': '______'",
  "Google's top autocomplete for my name: ______",
  "The real reason your package took three weeks: ______",
  "The rejected name for a NASA mission: ______",
  "Autopsy report, cause of death: ______",
  "My criminal record would just say: ______",
  "The worst thing to be known for in your hometown: ______",
  "The worst name for a hurricane: ______",
  "The worst pickup line of all time: '______'",
  "The worst thing to accidentally call your teacher: ______",
  "The unspoken rule of ______ that everyone knows",
  "The worst thing to hear on a plane intercom: '______'",
  "The rejected Olympic mascot was ______",
  "Welcome to ______, how can I help you today",
  "Scientists just discovered that ______ is actually good for you",
  "The hidden track on the worst album ever: '______'",
  "My dating profile says I'm into ______ and honestly that's accurate",
  "The thing no one tells you about turning 30: ______",
  "The worst way to describe your job to a child: ______",
  "The most ominous thing a child has ever said: '______'",
  "The first rule of ______ is we don't talk about it",
  "The worst thing to hear from your dentist mid-procedure: '______'",
  "The rejected Monopoly piece was ______",
  "The thing I'd grab first in a house fire: ______",
  "My Uber driver rating dropped because ______",
  "The worst thing to be allergic to: ______",
  "Leaked government document reveals ______",
  "The worst thing to name a sword: ______",
  "Something you'd find on a villain's grocery list",
  "The most cursed item at a yard sale",
  "The most unhinged thing to put in a time capsule",
  "A bad reason to start a GoFundMe",
  "The worst thing to be known as 'the ______ guy' in your friend group",
  "A terrible fortune cookie message to get on your birthday",
  "A surprising side effect listed on a prescription bottle that nobody reads",
  "The worst thing to embroider on a throw pillow",
  "The worst motivational quote to hang in a classroom",
  "The most concerning thing to find in a suggestion box",
  "The worst question to ask at a town hall meeting",
  "The worst flavor of lip balm",
  "A terrible thing to monogram on a bathrobe gift",
  "The worst thing to hear from a talking toilet",
  "The worst country to accidentally declare war on",
  "The worst thing to engrave on a trophy",
  "The worst icebreaker on the first day of prison",

  // Authority & formality bombs — serious frame + absurd fill
  "The FDA just approved ______ as a food group",
  "TSA now requires all passengers to ______ before boarding",
  "Breaking news: Scientists confirmed that ______ is actually sentient",
  "The newest entry in the Geneva Convention: ______ is now a war crime",
  "NASA's next billion-dollar mission: send ______ to Mars",
  "The UN just issued a formal apology for ______",
  "OSHA's newest workplace safety rule: employees must not ______ during meetings",
  "The Surgeon General's latest warning: ______ may cause ______",
  "Madam President, the asteroid is heading for Earth and the only thing that can stop it: ______",
  "For crimes against humanity, I hereby sentence you to ______",
  "The Nobel Prize committee is proud to award this year's Peace Prize to ______ for ______",

  // Cultural subversion — famous phrases with a blank
  "Maybe she's born with it. Maybe it's ______",
  "Got ______?",
  "Just Do It — and by 'it,' Nike means ______",
  "15 minutes could save you 15% on your ______",
  "Like a good neighbor, State Farm is there with ______",
  "The happiest place on earth, if you ignore ______",
  "Red Bull gives you ______, apparently",
  "______, Apply Directly to the Forehead",
  "Subway: Eat ______",
  "I'm lovin' it. 'It' being ______",
  "In bookstores now: 'From ______ to ______: A Memoir'",
  "Next from J.K. Rowling: Harry Potter and the Chamber of ______",

  // ==========================================================================
  // MEMES & INTERNET CULTURE — classic meme formats and 2025-2026 references.
  // ==========================================================================

  // Classic meme formats
  "Distracted boyfriend is looking at ______",
  "The 'this is fine' dog, but the room is on fire because of ______",
  "POV: You just ______",
  "Nobody: Absolutely nobody: Me at 3 AM: ______",
  "Me explaining to my mom why I need ______ (conspiracy board meme)",
  "Two wolves inside you: one wants ______, the other wants ______",
  "The 'they're the same picture' meme, but it's comparing ______ and ______",
  "The scroll of truth says: '______'",
  "The rock eyebrow raise, but he just heard ______",
  "Trade offer: I receive ______, you receive ______",
  "Woman yelling at the cat, but they're arguing about ______",
  "The 'always has been' astronaut meme, but it's about ______",
  "Bernie Sanders is once again asking for ______",
  "The 'how it started vs how it's going' but for ______",
  "Change my mind: ______",
  "The worst thing to put on the 'corporate wants you to find the differences' meme",
  "The 'surprised Pikachu' moment of the century: ______",
  "Evil ______ be like: ______",
  "The 'we have ______ at home' and at home it's ______",
  "One does not simply ______ into Mordor",
  "Bro really said '______' and thought we wouldn't notice",
  "OK but why does ______ go so hard",
  "Core memory unlocked: ______",
  "The intrusive thought that won: ______",
  "Real ones remember ______",
  "Tell me you're ______ without telling me you're ______",
  "The most unhinged thing someone ever posted and then said 'anyway': ______",
  "Certified ______ moment",
  "The 'understandable, have a great day' response to ______",
  "Ight imma head out, but only because ______",
  "The 'they don't know I ______' guy at the party",

  // 2025-2026 memes & comedy culture
  "We got ______ before GTA 6",
  "I just lost 10,000 aura points because I ______",
  "The newest Italian Brainrot character is a half-______, half-______",
  "I'm just a chill guy. I don't even care that ______",
  "100 men couldn't even beat ______",
  "The one thing that should NEVER be turned into a Ghibli movie: ______",
  "Next year's Super Bowl halftime show surprise: 500 people dressed as ______",
  "The biggest holy airball of all time: ______",
  "______. That's a recession indicator BTW.",
  "Due to a graphics error, the Super Bowl broadcast introduced the halftime performer as ______",
  "The thing Ozempic can't fix: ______",
  "My AI therapist just diagnosed me with ______",
  "My dating app AI wingman's worst opening line: '______'",
  "The thing Gen Z will never understand: ______",
  "The most millennial sentence ever written: '______'",
  "Something that sounds like a mental illness but is actually a TikTok trend",
  "Therapy-speak that has gone too far: '______'",
  "The emotional support animal that finally crossed a line: an emotional support ______",
  "The most unhinged crowd work moment: a comedian asked 'What do you do for a living?' and they said ______",
  "The worst thing to discover Netflix made a true crime documentary about: ______",
  "Adulthood is just ______ with extra steps",
  "The intrusive thought that actually won: ______",
  "The most unhinged parasocial relationship: someone who is deeply in love with ______",
  "A controversial take that would get you immediately kicked out of a group chat: ______",
  "Caught in 4K doing ______",
  "The one thing AI should absolutely never be trusted with: ______",

  // ==========================================================================
  // NBA MEMES — basketball-specific prompts for the true hoopers.
  // ==========================================================================
  "Overheard in the locker room after the game: '______'",
  "That is a normal ______. Move on, find a new slant",
  "The real reason JR Smith dribbled out the clock in the Finals: ______",
  "I'm trying, Jennifer, but ______",
  "What does that even mean, Kobe Bryant? '______'",
  "Kawhi Leonard trying to prove he's a fun guy by ______",
  "Magic Johnson's most obvious tweet: '______'",
  "The real reason Ben Simmons passed up the wide-open dunk: ______",
  "What KD's burner account tweeted at 2 AM: '______'",
  "Jimmy Butler showed up to practice with the third-stringers and ______",
  "Shaq's rebuttal to Chuck: 'Rings, Erneh, and ______'",
  "Giannis discovering ______ for the first time: 'MAN GOD BLESS AMERICA'",
  "What Draymond Green calls his 'natural shooting motion': ______",
  "James Harden's performance tonight was directly correlated to ______",
  "Westbrook showed up to the postgame presser wearing ______",
  "Anthony Edwards when asked about ______: 'I don't know who that is'",
  "The worst thing Steph Curry could do the Night Night gesture to: ______",
  "Victor Wembanyama is not human, he's actually ______",
  "Nikola Jokic would rather ______ than win another MVP",
  "The real reason Dallas traded Luka for AD: ______",
  "A drunk Chet Holmgren at the championship parade: '______'",
  "The last thing Ernie, Chuck, Shaq, and Kenny said before leaving TNT: '______'",
  "JJ Redick's only coaching qualification: ______",
  "Bronny James' actual role on the Lakers: ______",
  "The worst thing to yell courtside at an NBA game: '______'",
  "An NBA player's most unhinged postgame interview quote: '______'",
  "The real reason your favorite team is tanking: ______",
  "LeBron at age 41 is still ______",
  "The most suspicious thing in an NBA referee's search history: ______",
  "What players actually discuss during a timeout: ______",
  "The unwritten rule of pickup basketball that everyone violates: ______",
  "The worst NBA trade package of all time: ______ for ______",
  "Adam Silver's secret plan for the NBA: ______",
  "What Chuck guaranteed on Inside the NBA: '______'",
  "Sources say ______ is beside himself. Driving around downtown begging (thru texts) for ______",
  "Charles Barkley's hottest take that got him in trouble: '______'",
  "The thing Jokic loves more than basketball, horses, AND his family: ______",
  "The real reason an NBA star requested a trade: ______",
  "The most unhinged thing an NBA player has done during All-Star Weekend: ______",
  "A scandal worse than the 2025 NBA gambling ring: ______",
  "The worst NBA burner account post of all time: '______'",
  "What LeBron whispered to the rookie after dunking on him: '______'",
  "The thing that would make an NBA franchise relocate overnight: ______",
  "A terrible thing to include in an NBA player's contract: ______",
  "The real reason the NBA keeps changing the All-Star format: ______",
  "Boy oh boy, where do I even begin with ______",
  "The worst halftime entertainment at an NBA game: ______",

  // ==========================================================================
  // FOREIGN LANGUAGE EASTER EGGS — surprise multilingual prompts.
  // ==========================================================================
  "你绝对不应该在第一次约会时说的话",          // The thing you should never say on a first date (Chinese)
  "Lo peor que puedes gritar en un elevador lleno de gente", // The worst thing to yell in a crowded elevator (Spanish)
  "おばあちゃんの秘密の材料は実は______",        // Grandma's secret ingredient is actually ______ (Japanese)
  "La pire excuse pour arriver en retard à son propre mariage", // The worst excuse for being late to your own wedding (French)
  "Das Schlimmste, was man bei einer Beerdigung laut sagen könnte", // The worst thing to say out loud at a funeral (German)
  "지구에 대한 외계인의 Yelp 리뷰",              // An alien's Yelp review of Earth (Korean)
  "La peor cosa da scrivere su una torta di compleanno", // The worst thing to write on a birthday cake (Italian)
  "Самое худшее, что можно шепнуть незнакомцу в автобусе", // The worst thing to whisper to a stranger on a bus (Russian)
  "أسوأ شيء تصرخ به في مصعد مزدحم",                    // The worst thing to shout in a crowded elevator (Arabic)
  "สิ่งที่ไม่ควรพูดกับแม่ยายในมื้อแรก",                        // What you shouldn't say to your mother-in-law at the first meal (Thai)
  "Điều tệ nhất để viết lên bánh cưới",                  // The worst thing to write on a wedding cake (Vietnamese)
  "O pior conselho para dar a alguém que está prestes a saltar de paraquedas", // The worst advice to give someone about to skydive (Portuguese)
  "Het ergste om per ongeluk te zeggen tijdens een sollicitatiegesprek", // The worst thing to accidentally say during a job interview (Dutch)
  "Det värsta att viska till personen bredvid dig på en begravning", // The worst thing to whisper to the person next to you at a funeral (Swedish)
  "Najgorsze, co można powiedzieć przy pierwszym spotkaniu z teściową", // The worst thing to say when meeting your mother-in-law (Polish)
  "Cel mai prost lucru pe care să-l strigi într-o bibliotecă", // The worst thing to yell in a library (Romanian)
  "Az orvos legrosszabb mondata a műtét közepén: '______'", // The worst thing for a doctor to say mid-surgery: '______' (Hungarian)
  "Ang pinakamasamang bagay na isulat sa isang sympathy card", // The worst thing to write in a sympathy card (Filipino/Tagalog)
  "पायलट ने उड़ान भरने से पहले जो सबसे बुरी बात कही: '______'", // The worst thing a pilot said before takeoff: '______' (Hindi)
  "Kötü bir süper kahraman ismi: ______",                // A bad superhero name: ______ (Turkish)
  "Pahin asia, jonka voi kuulla hammaslääkäriltä: '______'", // The worst thing to hear from your dentist: '______' (Finnish)
  "Nejhorší věc, kterou říct na prvním rande",            // The worst thing to say on a first date (Czech)
  "Det verste å rope under en begravelse",               // The worst thing to shout during a funeral (Norwegian)
  "ရေခဲမုန့်အရသာ အဆိုးဆုံးအမည်: ______",               // The worst ice cream flavor name: ______ (Burmese)
  "Perkara paling teruk untuk ditulis pada kad hari jadi", // The worst thing to write on a birthday card (Malay)
  "בדיחה שלעולם לא כדאי לספר בראיון עבודה",              // A joke you should never tell at a job interview (Hebrew)
  "Το χειρότερο πράγμα να πεις σε κηδεία: '______'",    // The worst thing to say at a funeral: '______' (Greek)
];

function cryptoRandInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = cryptoRandInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getRandomPrompts(
  count: number,
  exclude: Set<string> = new Set(),
): string[] {
  const available = PROMPT_BANK.filter((p) => !exclude.has(p));
  return shuffle(available).slice(0, count);
}
