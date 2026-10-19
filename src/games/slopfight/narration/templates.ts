// Authored house voice. Keep wording and template order stable: selection is seeded.
import type { ArenaId } from "../arenas";
import type { FightMethod } from "../sim/types";

// ---------------------------------------------------------------------------
// Templates (house voice: short, specific, a little mean, never cruel)
// ---------------------------------------------------------------------------
// Slots: {x} the fighter the line is about, {y} the other one, {a}/{b} the
// two corners, {move} the move used, {plan} body plan, {trait} a trait,
// {item} the held item, {arena} the arena as said aloud, {drop} what is
// below its edge, {owner} the owning player, {prev} the old name, {n} a round.

export const T = {
  arenas: [
    "Tonight's arenas: {arena1}, {arena2}, {arena3}.",
    "Three arenas tonight: {arena1}, {arena2} and {arena3}.",
  ],
  build: [
    "Draw it or describe it. Build for all three arenas.",
    "Ninety seconds. Make something the arenas will regret.",
    "Champions, please. Doodles accepted. Ambition required.",
  ],
  forged: [
    "{x} is alive. Nobody asked, but here we are.",
    "The Foundry presents {x}. No refunds.",
    "{x} rolls off the line, still warm.",
    "Say hello to {x}. Do not make eye contact.",
    "{x}: a {plan}, technically.",
    "Forged: {x}. A {plan} with {trait} energy.",
    "{x} is finished. The Foundry needs a lie down.",
    "{x} exists now. That's on {owner}.",
    "{owner} made {x}. We're all choosing to be supportive.",
    "{x} has a {item} and no further questions.",
    "{x} is here, and it is extremely {trait}.",
    "Introducing {x}. It came out of a doodle. Respect it.",
  ],
  forgedHouse: [
    "The house made {x}. The house regrets nothing.",
    "{x} fights for the house. Be polite. It bites.",
    "House champion {x} has entered the chat.",
    "{x} joins for the house, unpaid and {trait}.",
  ],
  upgradeReveal: [
    "{prev} is now {x}. Science has failed.",
    "Behold {x}. Same {plan}, new problems.",
    "{x} got an upgrade. It looks thrilled about it.",
    "{prev} went in. {x} came out. Nobody is okay.",
    "{x} returns, upgraded and even more {trait}.",
    "{x}: now with extra. Extra what? We'll find out.",
    "The Foundry improved {x}. Allegedly.",
    "{x} has evolved. Darwin is furious.",
  ],
  // The line-up: one line for the round, where it is and who opens it.
  lineupFirst: [
    "Round one, {arena}. Two fights. Bet on both.",
    "{a} versus {b} opens the night. Phones out.",
    "Round one: {a} and {b} first. Get your bets in.",
    "Two fights in {arena}. Bet on every one.",
  ],
  lineup: [
    "Round {n}, {arena}. {a} and {b} go first.",
    "Round {n}. Same champions, worse ideas.",
    "Round {n} opens with {a} versus {b}.",
    "Welcome to {arena}. Round {n}, two fights.",
  ],
  lineupFinal: [
    "Last stop, {arena}. Third place first, then the Final.",
    "Round three. Third place, then the Final for double points.",
    "The last round. Bets on the Final pay double.",
  ],
  faceOff: [
    "{a} versus {b}. Place your bets.",
    "{a} versus {b}. Bet with your heart, or your head.",
    "It's {a} against {b}. Somebody goes home sticky.",
    "{a} and {b} in {arena}. Bets are open.",
    "In this corner, {a}. In that one, {b}. Bet now.",
    "{a} versus {b}. One of them is about to learn.",
    "{b} has seen {a}. {b} is not worried. Yet.",
    "{a} or {b}? Tap a fighter. Trust nothing.",
    "{a} meets {b}. Bets close soon.",
    "Up next: {a} versus {b}. Choose wisely.",
    "{a} versus {b}. Bets open.",
    "{a} versus {b}. Pick one.",
  ],
  final: [
    "The Final. {a} versus {b}. Double points.",
    "For the trophy: {a} versus {b}. Bets pay double.",
    "This is it. {a} versus {b} for everything.",
    "Final: {a} versus {b}.",
  ],
  thirdPlace: [
    "For third place: {a} versus {b}. Dignity on the line.",
    "Bronze is at stake. {a} versus {b}.",
    "{a} versus {b}, for third. Somebody gets a medal-ish.",
    "Third place: {a} versus {b}.",
  ],
  start: [
    "Fight!",
    "Go!",
    "Here we go!",
    "Let it rip!",
    "Begin!",
    "Ding ding!",
    "Fight it out!",
    "And go!",
  ],
  firstContact: [
    "First contact!",
    "And they meet!",
    "Contact! The paperwork begins.",
    "They've touched. It's going badly for someone.",
    "First touch. The crowd leans in.",
    "Here's the first exchange!",
    "They collide! Nobody planned this.",
    "Contact, and immediate regret.",
    "{a} and {b} meet in the middle. Badly.",
    "They meet! Somebody brought the wrong energy.",
  ],
  bigHit: [
    "{x} lands the {move}!",
    "Huge hit from {x}!",
    "{y} just got rearranged.",
    "That's the {move}, and it hurt.",
    "{x} connects! {y} reconsiders everything.",
    "Oof. {y} will feel that tomorrow.",
    "{x} with the {move}! Textbook.",
    "Massive! {y} is airborne and unhappy.",
    "{x} said hello with the {move}.",
    "Clean hit! {y} needs a moment.",
    "Big swing, big hit, big problems for {y}.",
    "The {move} came with a receipt.",
    "Bonk. {x} wins that exchange.",
    "{x} just made it personal.",
    "Right on the button from {x}!",
    "{y} is learning what {x} is for.",
    "And {y} goes for a little tumble.",
    "{x} does not miss that time.",
    "That one echoed.",
    "{y} has been thoroughly bonked.",
    "{x} puts {y} on the floor!",
    "Smack! {x} is feeling itself.",
    "{y} just lost an argument with physics.",
    "The {move}! Devastating, and a bit silly.",
  ],
  miracle: [
    "A miracle from {x}! Chaos pays off!",
    "{x} had no idea that would work. Neither did we.",
    "Pure chaos! {x} lands the impossible!",
    "Nobody coached {x} to do that. It worked anyway.",
  ],
  counter: [
    "Countered! {x} saw that coming.",
    "{x} reads it and punishes it!",
    "Nice try, {y}. {x} was waiting.",
    "Reversal! {x} turns it around!",
    "{x} dodges and fires back!",
    "{y} walked right into that.",
    "{x} slips it and makes {y} pay.",
    "Patience pays! {x} with the counter.",
    "{y} swung first. {x} hit hardest.",
  ],
  throw: [
    "{x} picks up {y} and files it elsewhere.",
    "Up and over! {x} throws {y}!",
    "{x} grabs {y}. This ends badly for {y}.",
    "Suplex! Or close enough.",
    "{y} is airborne, courtesy of {x}.",
    "{x} yeets {y}. That's the technical term.",
    "Grabbed and tossed! {y} is luggage now.",
    "{x} with the {move}! Up goes {y}!",
    "{y} goes for a ride. Nobody bought a ticket.",
    "{x} relocates {y}. Without asking.",
    "Into the air goes {y}! Gravity takes it from here.",
    "{x} throws {y} like a bag of laundry.",
  ],
  whiff: [
    "Whiff! {x} hits nothing but air.",
    "{x} swings at a ghost.",
    "Missed! {y} wasn't there.",
    "{y} slips the {move}.",
    "Swing and a miss from {x}.",
    "{x} attacks the concept of air.",
  ],
  immune: [
    "{y} cannot be grabbed. {x} learns this live.",
    "{x} tries to grab {y}. {y} declines.",
    "No handles on {y}. {x} is confused.",
    "{y} can't be grabbed!",
  ],
  // {x} grabbed, {y} is the slither that wriggled out.
  slipped: [
    "{y} wriggles right out of that grab.",
    "{x} grabs {y}. {y} is mostly noodle. Nope.",
    "Too slippery! {y} slides free.",
    "{x} tried to hold a noodle. {y} slips away.",
    "{y} slithers loose. {x} is holding nothing.",
    "Slippery! Nobody can keep a grip on that.",
  ],
  // {x} was setting up its {move}, {y} hit it first.
  broken: [
    "{y} breaks up the {move} before it starts.",
    "{x} was planning something. {y} said no.",
    "Trick interrupted! {y} got there first.",
    "The {move} never happens. {y} saw to that.",
    "So much for the {move}.",
    "{x}'s big plan lasted half a second.",
  ],
  edge: [
    "{x} is on the edge!",
    "{x} is one step from {drop}!",
    "Careful, {x}! That's a long way down.",
    "{x} is teetering. The crowd loves it.",
    "{x} is flirting with {drop}.",
    "Edge! {x} is in real trouble.",
    "{x} is peeking over the edge. Don't.",
    "{y} has {x} at the edge!",
    "{x} can see {drop} from here.",
    "Toes over the edge! Hold on, {x}!",
  ],
  ringOut: [
    "{x} is out! Ring out!",
    "And {x} is gone! Ring out!",
    "{x} has left the arena. Downward.",
    "Ring out! {x} takes the express route down.",
    "Bye, {x}! That's a ring out!",
  ],
  ringOutSplash: ["Splash! {x} is swimming with the sedan.", "{x} is in the water! Ring out!"],
  ringOutKitchen: [
    "{x} is off the counter! Ring out!",
    "{x} hits the kitchen floor. Five-second rule? No.",
  ],
  ringOutStreet: [
    "{x} is off the roof! It's fine, it's a cartoon.",
    "{x} took the stairs. The fast ones.",
  ],
  ko: [
    "{x} is down! That's a KO!",
    "Lights out for {x}!",
    "{x} has stopped participating. KO!",
    "KO! {y} wins it!",
    "{x} is having a long lie down. KO!",
    "That's it! {x} is done!",
  ],
  selfDamage: [
    "{x} hurt itself. Again.",
    "{x} is zapping itself. Classic.",
    "{x} takes damage from its own life choices.",
  ],
  showboat: [
    "{x} is showboating. Bold.",
    "{x} stops to admire itself. Risky.",
    "{x} takes a bow mid-fight. Rude.",
    "{x} is posing. {y} is not.",
    "{x} waves to the crowd. Mid-fight. Wow.",
    "{x} is milking it. {y} is not amused.",
    "{x} pauses for applause. Get on with it.",
  ],
  // The arena's finale, said as it starts (the last 10 s).
  finaleFlood: [
    "High tide! The water is coming up!",
    "The garage is flooding! Find some dry floor!",
    "The tide is in. Stay dry or go swimming.",
    "Water rising! The dry bit is getting very small.",
  ],
  finaleTilt: [
    "The counter is tipping! Everything slides!",
    "Tip over! The whole counter is going sideways.",
    "Somebody leaned on the counter. Hold on!",
    "The counter tilts! Downhill is the floor.",
  ],
  finaleStorm: [
    "Here comes the storm! Hold on to something!",
    "Storm on the roof! The wind won't let up.",
    "The storm hits! Somebody is going over.",
    "Gale force on the roof! Lean into it.",
  ],
  suddenDeath: [
    "It's a tie! Sudden death! Next hit wins!",
    "Dead even! Sudden death!",
    "Tied up! First hit wins it!",
  ],
  timeout: [
    "Time! We go to the health bars.",
    "That's time! Judges? We don't have judges.",
    "Time's up! Let's count the damage.",
  ],
  resultKO: [
    "{x} wins by KO. {y} is fine. Probably.",
    "KO victory for {x}! {y} is taking a nap.",
    "{x} wins by KO!",
  ],
  resultRingOut: [
    "{x} wins by ring out. {y} is somewhere below.",
    "Ring out win for {x}! {y} is still falling.",
    "{x} wins by ring out!",
  ],
  resultDecision: [
    "{x} takes it on health. Ugly, but it counts.",
    "{x} wins on points. {y} wants a recount.",
    "{x} wins on health!",
  ],
  resultSuddenDeath: [
    "{x} wins it in sudden death!",
    "Sudden death goes to {x}! Hearts everywhere stop.",
  ],
  result: [
    "Winner: {x}. Bettors, collect your points.",
    "{x} wins! {y} demands a rematch.",
    "{x} takes the fight and most of {y}'s dignity.",
    "Victory for {x}! The bets are paying out.",
    "{x} wins it! {y} will be thinking about this.",
    "And the winner is {x}! Nobody is surprised. Except {y}.",
  ],
  standings: [
    "After round {n}, {leader} leads the pack.",
    "{leader} is on top after round {n}. For now.",
    "Round {n} is done. {leader} is winning. Act natural.",
  ],
  standingsTie: ["Round {n} is done and it's anyone's game.", "After round {n}, nobody's safe."],
  upgrade: [
    "Add one thing. Anything. We'll regret it together.",
    "Upgrade time. Make it worse. I mean better.",
    "One addition each. Choose violence.",
    "Round {n} upgrades. The Foundry is warming up.",
    "Give your champion one more thing. Go big.",
  ],
  podiumThird: ["Third place: {x}. A bronze-ish result.", "In third, {x}. Proud, sort of."],
  podiumSecond: ["Second place: {x}. So close. So silver.", "Runner-up: {x}. Next time, maybe."],
  podiumFirst: ["Champion of the night: {x}!", "Your champion: {x}! Somebody get it a trophy."],
} as const satisfies Record<string, readonly string[]>;

export type TemplateSet = keyof typeof T;

/** The house-voice templates, for tests and the listening page. */
export const VOICE_TEMPLATES: Readonly<Record<TemplateSet, readonly string[]>> = T;

export const DROP_BY_ARENA: Record<ArenaId, string> = {
  FLOODED_GARAGE: "the water",
  KITCHEN_COUNTER: "the kitchen floor",
  ROOFTOP: "the street",
};

export const RING_OUT_SET: Record<ArenaId, TemplateSet> = {
  FLOODED_GARAGE: "ringOutSplash",
  KITCHEN_COUNTER: "ringOutKitchen",
  ROOFTOP: "ringOutStreet",
};

export const FINALE_SET: Record<ArenaId, TemplateSet> = {
  FLOODED_GARAGE: "finaleFlood",
  KITCHEN_COUNTER: "finaleTilt",
  ROOFTOP: "finaleStorm",
};

export const RESULT_SET: Record<FightMethod, TemplateSet> = {
  KO: "resultKO",
  RINGOUT: "resultRingOut",
  DECISION: "resultDecision",
  SUDDEN_DEATH: "resultSuddenDeath",
};

export const ROUND_WORDS = ["zero", "one", "two", "three", "four"];
