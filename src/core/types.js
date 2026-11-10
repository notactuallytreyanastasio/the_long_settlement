// THE CONTRACT. Every module in the project is written against these shapes.
//
// Functional core (src/core, src/content): pure functions and plain data only.
// No DOM, no window, no Date, no Math.random, no mutation of arguments.
// All randomness flows through an explicit Rng value. All time arrives as dt.
//
// Imperative shell (src/shell): the only place that touches canvas, audio,
// speech, input, localStorage and the clock. It turns input into Msg values,
// calls update(), and interprets the Effect values that come back.
//
//   update(content, game, msg) -> { game, effects }
//
// This file exports nothing at runtime; it exists for its typedefs.

/** @typedef {[number, number]} Vec  [x, y]; table space is 400 wide, 800 tall, y grows downward */

// ───────────────────────── rng.js ─────────────────────────
/**
 * @typedef {{ s: number }} Rng   uint32 state (mulberry32)
 *
 * export function seed(n: number): Rng
 * export function next(rng: Rng): [number, Rng]            float in [0,1)
 * export function nextInt(rng: Rng, n: number): [number, Rng]   int in [0,n)
 * export function pick(rng: Rng, arr: T[]): [T, Rng]
 */

// ───────────────────────── table data (src/content/tables.js) ─────────────────────────
/**
 * @typedef {Object} Table
 * @property {string} id                       'vessery' | 'saltmere' | 'halcyon' | 'brand' | 'tallis'
 * @property {string} name
 * @property {400} width
 * @property {800} height
 * @property {number} gravity                  units/s^2 along +y (table tilt already folded in)
 * @property {number} ballRadius               8
 * @property {{a:Vec,b:Vec,bounce?:number}[]} walls        static segments (curves are polylines)
 * @property {{id:string,a:Vec,b:Vec,pass:Vec}[]} oneWays  solid unless ball velocity·pass > 0
 * @property {Flipper[]} flippers              ids 'fl' and 'fr' always exist
 * @property {{id:string,pos:Vec,r:number,kick:number}[]} bumpers
 * @property {{id:string,a:Vec,b:Vec,kick:number}[]} slings   ids 'slingL','slingR'
 * @property {{id:string,a:Vec,b:Vec,group?:string}[]} targets   standup targets: solid, emit 'target'
 * @property {{id:string,pos:Vec,r:number,group?:string}[]} rollovers  sensors, emit once per entry
 * @property {{id:string,a:Vec,b:Vec,dir:Vec,exit?:{pos:Vec,vel:Vec}}[]} shots
 *           sensor gate crossed in direction dir emits 'shot'; if exit is set the ball is
 *           carried (ramp) and reappears at exit.pos with exit.vel
 * @property {{id:string,pos:Vec,r:number,eject:Vec,holdMs:number}[]} saucers
 *           capture hole: holds the ball, emits 'saucer' on capture, ejects with velocity eject
 * @property {{fill:[string,string,string], spin:string[]}} reels
 *           the Reels of Assay, which are part of the table. fill: the three top-lane rollovers,
 *           lane i filling reel i. spin: the saucer and the ramp and orbit shots, which spin
 *           all three reels when hit while game.reels.armed.
 * @property {{pos:Vec,maxSpeed:number}} plunger   ball rest position and full-power launch speed (upward)
 * @property {number} drainY                   a ball whose y exceeds this is drained
 * @property {{bg:string[],accent:string,glow:string,motif:string}} theme
 * @property {{text:string,pos:Vec,size:number,angle?:number}[]} decor   playfield lettering
 * @property {Object<string,string>} labels    element id -> short insert label drawn beside it
 *
 * @typedef {Object} Flipper
 * @property {'fl'|'fr'|string} id
 * @property {'left'|'right'} side
 * @property {Vec} pivot
 * @property {number} length
 * @property {number} radius                   capsule half-thickness
 * @property {number} restAngle                radians, angle of pivot->tip at rest
 * @property {number} activeAngle              radians, when held
 */

// ───────────────────────── physics.js ─────────────────────────
/**
 * @typedef {Object} Ball
 * @property {number} id
 * @property {Vec} pos
 * @property {Vec} vel
 * @property {'plunger'|'live'|'held'} state
 * @property {string} [heldIn]                 saucer id while held
 * @property {number} [heldMs]                 ms remaining until auto-eject
 * @property {string[]} inside                 rollover ids the ball currently overlaps (edge detection)
 *
 * @typedef {Object} Phys
 * @property {Ball[]} balls
 * @property {Object<string,{angle:number,angVel:number}>} flippers
 * @property {number} charge                   0..1 plunger charge while plunge is held
 * @property {number} nextBallId
 *
 * @typedef {{left:boolean,right:boolean,plunge:boolean,nudge:Vec|null}} Input
 *   plunge: one button. Held to charge, launches every ball in state 'plunger' on release.
 *   With no ball anywhere and no writs it is the lever of the Reels, acting on the press (game.js).
 *
 * @typedef {Object} PhysEvent
 * @property {'bumper'|'sling'|'target'|'rollover'|'shot'|'saucer'|'eject'|'drain'|'launch'|'flip'|'wall'} type
 * @property {string} [id]                     element id (absent for drain/launch/wall)
 * @property {number} ballId
 * @property {number} speed                    impact speed, for sound volume
 *
 * export const STEP = 1/120                               fixed timestep in seconds
 * export function initPhys(table: Table): Phys            no balls, flippers at rest
 * export function addBall(table: Table, phys: Phys): Phys     new ball at the plunger, state 'plunger'
 * export function addLiveBall(phys: Phys, pos: Vec, vel: Vec): Phys   for multiball
 * export function releaseHeld(table: Table, phys: Phys): { phys: Phys, events: PhysEvent[] }
 *        eject every held ball now (used when a cutscene ends)
 * export function stepPhysics(table: Table, phys: Phys, input: Input, dt: number): { phys: Phys, events: PhysEvent[] }
 *        dt is always STEP. Drained balls are removed from phys.balls and reported with a 'drain' event.
 *        Must never tunnel at ball speeds up to 2500 units/s and must cap speed there.
 */

// ───────────────────────── slot.js / economy.js ─────────────────────────
/**
 * @typedef {'coin'|'scale'|'gavel'|'crown'|'tide'|'orb'} Sym
 * @typedef {'lanes'|'shot'|'lever'} Source    how a line came to be on the reels
 * @typedef {null|'ballSave'|'multiball'|'doubleMarks'|'kickback'} Boon
 *        kickback: the next ball into an outlane is put back into the inlane beside it
 * @typedef {Object} Payout
 * @property {number} writs                    balls granted
 * @property {number} marks                    money granted
 * @property {number} [points]                 score granted (and its marks). payoutFor always sets it;
 *                                             a chapter's hand-written riggedSpin may leave it out
 * @property {Boon} boon
 * @property {string} name                     e.g. 'Three Gavels: Injunction'
 * @property {string} blurb                    one in-world sentence shown under the reels
 * @typedef {{reels:[Sym,Sym,Sym], payout:Payout}} SpinResult
 *
 * slot.js
 * export const SYMBOLS: Sym[]
 * export const SOURCES: Source[]
 * export const REEL_STRIPS: [Sym[],Sym[],Sym[]]            what the renderer scrolls
 * export const PAYTABLE, PLAY_PAYTABLE: {kind:'three'|'pair'|'mixed'|'void', sym:Sym|null, payout:Payout}[]
 *        the lever's table, and the lean one for lines earned in play
 * export function payoutFor(reels: [Sym,Sym,Sym], source: Source): Payout
 *        'lever' pays the generous table (the pull cost SPIN_COST). 'lanes' and 'shot' pay the
 *        lean one: marks, points and boons, writs only for triples and crown/orb pairs.
 * export function drawSym(rng: Rng, i: 0|1|2): { rng: Rng, sym: Sym }     one stop of reel i
 * export function spin(rng: Rng, source: Source): { rng: Rng, result: SpinResult }
 *
 * @typedef {Object} Econ
 * @property {number} score                    points, never spent
 * @property {number} marks                    money: earned from play, spent at the lever
 * @property {number} writs                    credits: one writ launches one ball
 * @property {number} debt                     marks owed to the Mint
 * @property {number} trust                    0..100 standing with the people of the current town
 * @property {number} aidUsed                  mutual-aid balls drawn this chapter
 * @property {number} spins                    lifetime pulls of the lever
 * @property {number} trustEarned              lifetime trust, never reset: scene rewards, and
 *                                             TRUST_PER_GIFT for every aid ball accepted. One side of the ending
 * @property {number} loansTaken               lifetime loans from the Mint, never reset: the other side
 *
 * economy.js
 * export const SPIN_COST: number              marks for one pull of the lever
 * export const LOAN: { marks: number, owed: number, garnish: number }
 *        the Mint advances LOAN.marks, books LOAN.owed of debt, and takes `garnish` (0..1)
 *        of every mark earned until debt is zero
 * export const TRUST_PER_LOAN, TRUST_PER_GIFT, TRUST_PER_AID: number
 * export function initEcon(): Econ
 * export function awardPoints(econ: Econ, points: number, mult?: number): Econ
 *        adds score, converts to marks (fractional marks are fine), garnishes for debt
 * export function canSpin(econ: Econ): boolean
 * export function paySpin(econ: Econ): Econ
 * export function applyPayout(econ: Econ, payout: Payout, mult?: number): Econ    writs, marks and points
 * export function needsLoan(econ: Econ): boolean           no writs and cannot afford a pull
 * export function takeLoan(econ: Econ): Econ
 * export function spendWrit(econ: Econ): Econ
 * export function addTrust(econ: Econ, n: number): Econ     clamped 0..100
 * export function leaning(econ: Econ): 'commons'|'mint'
 *        which ending the ledger currently describes: 'commons' when trustEarned >= loansTaken * TRUST_PER_LOAN
 * export function aidAvailable(econ: Econ): boolean
 *        mutual aid: the town covers a lost ball when trust is high enough.
 *        One aid ball per 25 trust, per chapter. The Mint lends at interest; the Commons gives.
 * export function takeAid(econ: Econ): Econ                 aidUsed + 1, writs + 1, trustEarned + TRUST_PER_GIFT
 */

// ───────────────────────── content (src/content) ─────────────────────────
/**
 * @typedef {Object} Line
 * @property {string} id         globally unique and stable: 'ch1.s3.c04', 'ch1.pro.02', 'ch1.bark.drain.1'
 * @property {string} who        speaker id from cast.js ('narrator' for narration)
 * @property {string} text       what is spoken and subtitled. Plain prose, no stage directions.
 * @property {'radio'} [fx]      spoken over the Line (earpiece): band-passed with static
 * @property {string} [bg]       cutscene backdrop key; persists until changed
 * @property {string[]} [on]     speaker ids visible on stage; persists until changed
 * @property {'wide'|'close'|'two'|'low'} [cam]   framing for this line
 * @property {string} [music]    switch music mood at this line
 * @property {string} [sfx]      one-shot sound at line start
 * @property {string} [emote]    'smile'|'grim'|'shock'|'tears'|'anger'|'soft'   speaker's face
 * @property {number} [minScene] barks only: not eligible until game.scene >= minScene. A bark is also
 *                               held back, with or without it, until its speaker has appeared in a
 *                               cinematic of this chapter or an earlier one (story.metSpeakers)
 *
 * @typedef {Object} Objective
 * @property {'all'|'count'|'sequence'} kind
 *        all: every id hit at least once (any order).  count: n hits across ids.
 *        sequence: ids in order (a wrong hit does not reset).
 * @property {string[]} ids      table element ids
 * @property {number} [n]        for 'count'
 *
 * @typedef {Object} Scene
 * @property {string} id         'ch1.s1'
 * @property {string} title
 * @property {'duty'|'covert'|'commons'} thread
 *        duty: the Circuit and the contract. covert: espionage. commons: building trust.
 * @property {string} hint       HUD objective text, imperative, under 60 chars
 * @property {Objective} objective
 * @property {Line[]} briefing   1-3 short lines spoken over live play when the scene begins (non-blocking)
 * @property {Line[]} cutscene   full cinematic played when the objective completes (blocking)
 * @property {{points:number, trust?:number}} reward
 *
 * @typedef {Object} Chapter
 * @property {string} id         'ch1'
 * @property {number} number
 * @property {string} title
 * @property {string} subtitle
 * @property {string} tableId
 * @property {Line[]} prologue   cinematic before play
 * @property {{reels:[Sym,Sym,Sym], payout:Payout}|null} riggedSpin
 *        the chapter's first pull of the lever, if scripted: free, and it pays exactly this
 * @property {Scene[]} scenes
 * @property {Line[]} epilogue   cinematic after the last scene
 * @property {Object<string,Line[]>} barks
 *        short one-liners over live play. keys: 'launch','drain','bumper','ramp','save','loan',
 *        'aid','jackpot','bust','idle'. The core picks one by rng and rate-limits them.
 * @property {{play:string, cine:string}} music
 *        play: the table.  cine: the quieter mood a prologue or epilogue falls back to when its
 *        first line names none
 *
 * @typedef {Object} CastMember
 * @property {string} id
 * @property {string} name       display name
 * @property {string} role       one line under the name
 * @property {string} color      css color for nameplate
 * @property {string[]} say      macOS `say` voice names in preference order
 * @property {number} rate       words per minute for `say`
 * @property {number} pitch      0..2 for speechSynthesis fallback
 * @property {Object} look       free-form descriptor the cinema renderer draws from
 *        { skin, hair, hairStyle, coat, trim, build:'slim'|'broad'|'small', age:'young'|'mid'|'old', mark? }
 *
 * @typedef {{chapters: Chapter[], tables: Object<string,Table>, cast: Object<string,CastMember>}} Content
 *   src/content/index.js:  export const content: Content
 */

// ───────────────────────── game.js / story.js ─────────────────────────
/**
 * @typedef {Object} Cine          a running cinematic
 * @property {'prologue'|'scene'|'epilogue'} kind
 * @property {Line[]} lines
 * @property {number} index
 * @property {number} lineT        seconds the current line has been showing
 * @property {string} bg           resolved backdrop (persisting from earlier lines)
 * @property {string[]} on         resolved cast on stage
 * @property {number} t            seconds since the cinematic began
 *
 * @typedef {{sym: Sym|null, spin: number}} Cell
 *        one reel. sym null: empty. spin > 0: seconds left turning before it locks on sym
 *        (the symbol is drawn when the reel starts, so sym is already what it will show).
 *
 * @typedef {Object} Reels          the Reels of Assay, in the head of the table
 * @property {[Cell,Cell,Cell]} cells
 * @property {'open'|'paying'} phase
 *        open: filling, turning or empty.  paying: all three locked and the line has just paid;
 *        it stays up for PAY_SECONDS (1.2) and then the cells clear. Anything the player does
 *        to the reels in that time clears it at once.
 * @property {number} t             seconds in the current phase (restarts when a reel starts)
 * @property {SpinResult|null} result   the line and what it paid, while paying; null otherwise
 * @property {Source|null} source   what last set the reels going; null when they are empty
 * @property {boolean} armed        the spin elements (table.reels.spin) are lit
 * @property {number} charge        bumper, sling and target hits since the last earned spin, up to need
 * @property {number} need          hits that light the spin elements again
 *
 * @typedef {Object} Game
 * @property {'title'|'card'|'cine'|'play'|'end'} mode
 *        card: chapter title card.  end: end of available chapters.  There is no slot screen.
 * @property {number} chapter               index into content.chapters
 * @property {number} scene                 index into chapter.scenes
 * @property {Object<string,number>} hits   objective progress: element id -> hit count this scene
 * @property {number} seq                   sequence objective cursor
 * @property {Cine|null} cine
 * @property {Reels} reels
 * @property {Econ} econ
 * @property {Phys|null} phys
 * @property {Rng} rng
 * @property {number} t                     seconds of game time
 * @property {number} modeT                 seconds in the current mode
 * @property {{ballSave:number, mult:number, multT:number, kickback:number}} boons
 *        ballSave: seconds of save remaining.  mult/multT: mark multiplier and its seconds remaining.
 *        kickback: outlane kickbacks held (0..2). The clocks run only while a ball is in play.
 * @property {number} barkCool              seconds until another bark may play
 * @property {boolean} spunThisChapter      false until the lever has paid once this chapter (the rigged pull, if any)
 * @property {{kind:string,text:string,t:number}[]} toasts   short HUD callouts, shell only reads
 *        kinds: scene, payout, jackpot, bust, loan, aid, save, hint
 *
 * @typedef {Object} Msg
 *   {type:'tick', dt:number, input:Input}     dt is physics.STEP; the shell calls this in a fixed loop
 *   {type:'confirm'}                          Enter/tap: start, next line, dismiss card. Nothing in play
 *   {type:'skip'}                             skip the whole running cinematic
 *   {type:'lineDone', id:string}              shell: the voice finished this blocking line
 *   {type:'load', save:Save}
 *
 * @typedef {{v:2, chapter:number, scene:number, econ:Econ, seed:number}} Save
 *        v:1 saves (same fields, written at the old slot screen) still load. Either loads into
 *        'play' at the start of its scene, with a fresh table and fresh reels.
 *
 * THE LEVER. In play, with no ball anywhere and no writs, a press of Input.plunge is the lever
 * (leverStatus says what it will do): the chapter's rigged pull, free; or SPIN_COST marks and a
 * spin; or, when the purse cannot pay, a loan, and the next press pulls. When the town trusts
 * the player the Commons passes the hat first: an aid ball arrives AID_WAIT (2) seconds after
 * the table empties, and a press before it arrives is a pull on the Mint's credit, a loan and
 * a spin together. Waiting or not waiting is the choice the ending is read from.
 *
 * @typedef {Object} Effect
 *   {type:'say', line:Line, blocking:boolean}   blocking lines must be answered with lineDone
 *   {type:'hush'}                               stop any speech now
 *   {type:'sfx', name:string, vol?:number}      names: flip, bumper, sling, target, rollover, shot, saucer,
 *                                               eject, drain, launch, wall, reelStart, reelStop, payout,
 *                                               jackpot, bust, loan, aid, objective, sceneClear, card, confirm
 *                                               reelStart: all three reels set going.  reelStop: one reel locked.
 *                                               confirm is also the spin elements lighting; eject also a kickback.
 *   {type:'music', mood:string}                 moods: title, festival, tense, covert, sorrow, hope, march,
 *                                               mine, court, shrine, dread, silence,
 *                                               academy, storm, village, exchange
 *   {type:'shake', power:number}
 *   {type:'flash', color:string}
 *   {type:'save', save:Save}
 *
 * game.js
 * export const REEL_STOPS: [number,number,number]   seconds at which each reel locks in a full spin
 * export const FILL_SECONDS, PAY_SECONDS, REELS_NEED, AID_WAIT, LEVER_DELAY: number
 * export function init(seedN: number): Game
 * export function update(content: Content, game: Game, msg: Msg): { game: Game, effects: Effect[] }
 * export function toSave(game: Game): Save
 * export function leverStatus(content, game): null|'wait'|'free'|'credit'|'pull'|'loan'
 *        what a press of the plunge button would do as the lever; null when it is not the lever
 *
 * story.js  (pure helpers used by game.js and by the renderer)
 * export function currentScene(content, game): Scene|null
 * export function objectiveProgress(scene: Scene, hits, seq): { done:number, total:number, complete:boolean }
 * export function litIds(content, game): string[]      element ids the current objective still needs
 * export function spinIds(content, game): string[]     element ids that spin the reels if hit now ([] unless armed)
 * export function metSpeakers(content, chapterIndex, sceneIndex): Set<string>
 * export function eligibleBarks(content, game, key): Line[]
 * export function preloadIds(content, game, ahead?): string[]
 * export function resolveStage(lines: Line[], index: number): { bg:string, on:string[] }
 * export function lineSeconds(line: Line): number      fallback duration if the shell never reports lineDone
 */

export {};
