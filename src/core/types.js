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
 * @property {number} hatsRefused              how many of those loans were drawn while the Commons was passing
 *                                             the hat (the 'credit' pull). They weigh TRUST_PER_LOAN; the rest,
 *                                             taken with no gift on offer, weigh TRUST_PER_FORCED_LOAN
 *
 * economy.js
 * export const SPIN_COST: number              marks for one pull of the lever
 * export const LOAN: { marks: number, owed: number, garnish: number }
 *        the Mint advances LOAN.marks, books LOAN.owed of debt, and takes `garnish` (0..1)
 *        of every mark earned until debt is zero
 * export const TRUST_PER_LOAN, TRUST_PER_FORCED_LOAN, TRUST_PER_GIFT, TRUST_PER_AID: number
 * export function initEcon(): Econ
 * export function awardPoints(econ: Econ, points: number, mult?: number): Econ
 *        adds score, converts to marks (fractional marks are fine), garnishes for debt
 * export function canSpin(econ: Econ): boolean
 * export function paySpin(econ: Econ): Econ
 * export function applyPayout(econ: Econ, payout: Payout, mult?: number): Econ    writs, marks and points
 * export function needsLoan(econ: Econ): boolean           no writs and cannot afford a pull
 * export function takeLoan(econ: Econ, refusedHat?: boolean): Econ
 * export function spendWrit(econ: Econ): Econ
 * export function awardBonus(econ: Econ, points: number): Econ   score only: no marks (the combo's bonus)
 * export function addTrust(econ: Econ, n: number): Econ     clamped 0..100
 * export function ledger(econ: Econ): { trust: number, loans: number }
 *        the two pans: trustEarned, and hatsRefused * TRUST_PER_LOAN + the other loans * TRUST_PER_FORCED_LOAN
 * export function leaning(econ: Econ): 'commons'|'mint'
 *        which ending the ledger currently describes: 'commons' when ledger(econ).trust >= ledger(econ).loans
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
 * @property {'commons'|'mint'} [lean]   prologue, briefing, cutscene and epilogue lines only (never barks):
 *                               spoken only when the ledger leans this way (story.leaningNow). A line
 *                               without it is always spoken. The only branch in the content
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
 * @property {Encounter} [encounter]   how the scene is played on the 3D stage. A scene without one is drawn by the 2D renderer
 *
 * @typedef {Object} Encounter       the scene as something watched while it is played (src/core/stage.js)
 * @property {string} set            set id: the backdrop key of the place. Must equal the first `bg` of the scene's cutscene
 * @property {'dusk'|'night'|'predawn'|'dawn'|'day'|'interior'} light
 * @property {'fight'|'work'|'stealth'|'hold'|'talk'|'walk'} mode
 *        the family of actions table events become. Only 'fight' strikes people; in the others a bumper is a small
 *        act of the task, a lit shot the big one
 * @property {string[]} party        one to three cast ids, the first leading: only people the story has there
 * @property {{kind:'people'|'force', who:string[], name:string}} opposition
 *        people: one to three figure type names or cast ids, stage right. force: the task itself, as one to three prop
 *        type names (dark lanterns, a locked chamber, a bond to be sealed). name: over the bar, 22 characters at most.
 *        The bar is the objective: total - done
 * @property {string[]} [extras]     up to three more figures present who are neither (bystanders, a seated Chancellor)
 * @property {{cue:string, show:string}} setback    what a drained ball looks like here
 * @property {{at:number, cue:string, name:string, show:string}[]} beats
 *        what objective progress shows. at: the done-count a beat begins at, rising; the first is 0 and the last is the
 *        objective's total (the resolve). cue: kebab-case key the director stages. name: a caption, 28 characters at
 *        most. show: what is seen, for whoever builds it
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
 * @property {{sets:Object<string,{set:string, light:string}>, clerk:string, townsfolk:string}} [stage]
 *        present when the chapter can be played on the 3D stage. sets: every backdrop key its lines name -> the set
 *        and its light for a cinematic there (a scene's own cutscene keeps its encounter's light). clerk: the figure
 *        type who hands over a writ on a loan. townsfolk: who brings the hat and gathers as trust rises
 * @property {Object<string,string>} [roles]
 *        cast id -> what stands under that speaker's name in this chapter, where cast.role is no longer true
 *        (a cadet who has defaulted). Drawing only.
 * @property {{commons:{title:string,text:string}, mint:{title:string,text:string}}} [endings]
 *        on the last chapter: what the end screen says for each reading of the ledger (story.endingOf)
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
 * @property {Line[]} lines        the lines that will be played: lean lines of the other ending are already gone
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
 * @property {'title'|'card'|'cine'|'play'|'fray'|'end'} mode
 *        card: chapter title card.  end: end of available chapters.  There is no slot screen.
 *        fray: Lanewar, the tin-soldier board game inside the game (fray.js): the table stands still, the ball waits
 *        in the saucer, and game.run is the game of it being played
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
 * @property {null|'commons'|'mint'} ending  the ledger as read in the final chapter, frozen: null until the
 *        scene story.readsLeaning names completes (at the latest the last objective of the last chapter)
 * @property {boolean} spunThisChapter      false until the lever has paid once this chapter (the rigged pull, if any)
 * @property {{kind:string,text:string,t:number}[]} toasts   short HUD callouts, shell only reads
 *        kinds: scene, payout, jackpot, bust, loan, aid, save, hint
 * @property {LogEntry[]} recent            what has just happened, oldest first, at most stage.RECENT_MAX entries: the
 *        log the stage is drawn from and the combo is computed over. Not saved. Shell only reads
 * @property {import('./fray.js').Meta} fray   Lanewar's board between visits: lit (the saucer opens it), charge (table hits
 *        toward lighting it, of game.FRAY_NEED), wave, weapons, perks, best, felled, owed. Saved
 * @property {Object|null} run              the Lanewar run being played (fray.js Run), in mode 'fray'; null otherwise. Not saved
 * @property {number} logged                entries ever given to `recent`: the n the next one will get. A shell keeps a
 *        cursor on n to act on each entry once (and resets it when logged falls, which is a load)
 *
 * @typedef {Object} LogEntry
 * @property {number} n                     0, 1, 2, ... for the life of the Game value
 * @property {number} t                     game.t when it happened
 * @property {'launch'|'bumper'|'sling'|'target'|'lane'|'shot'|'saucer'|'objective'|'sceneClear'|'trust'|'payout'|'lit'|'drain'|'save'|'hat'|'aid'|'loan'|'chain'} type
 *        with, by type: id (the element) on bumper sling target lane shot saucer objective; via 'ramp'|'orbit' on shot;
 *        done, total on objective; scene on sceneClear; gained, trust on trust; kind, boon, source, writs on
 *        payout; saved, balls on drain; kind 'ballSave'|'kickback' on save; refused on loan. 'chain' is not an event:
 *        { count, last } is the combo as it stood after older entries that were folded away (stage.pushRecent)
 *
 * @typedef {Object} StageState             stage.stageState(content, game): what the live stage shows now
 * @property {'fight'|'resolve'|'dialogue'|'idle'} phase
 *        fight: play.  resolve: the first stage.RESOLVE_SECONDS of a scene's cutscene, still the encounter, complete.
 *        dialogue: a cinematic.  idle: title, card, end
 * @property {string|null} set              set id; null when idle or the scene has no encounter
 * @property {string|null} light
 * @property {string|null} mode             the encounter's mode (fight and resolve)
 * @property {string[]} party               the encounter's party; in dialogue, who is on stage (cine.on)
 * @property {{kind:string, who:string[], name:string}|null} opposition    null in dialogue
 * @property {string[]} extras
 * @property {{done:number, total:number}} progress     the objective; the opposition's bar is total - done
 * @property {{index:number, of:number, at:number, cue:string, name:string, show:string}|null} beat
 * @property {{cue:string, show:string}|null} setback
 * @property {{count:number, level:number, left:number, last:number, name:string, mult:number}} combo
 * @property {number} power                 0..1: how much the table is sending up. Unsmoothed
 * @property {{shield:number, double:number, doubleT:number, kickback:number, helpers:number, hat:boolean, supporters:number, trust:number, debt:number}} buffs
 * @property {'scene'|'prologue'|'epilogue'|null} kind
 * @property {Line|null} line               dialogue: the line being spoken, with speaker (line.who), radio, cam, emote
 * @property {string|null} speaker
 * @property {boolean} radio
 * @property {string|null} cam
 * @property {string|null} emote
 *
 * @typedef {Object} Msg
 *   {type:'tick', dt:number, input:Input}     dt is physics.STEP; the shell calls this in a fixed loop
 *   {type:'confirm'}                          Enter/tap: start, next line, dismiss card. Nothing in play
 *   {type:'skip'}                             skip the whole running cinematic
 *   {type:'lineDone', id:string}              shell: the voice finished this blocking line
 *   {type:'load', save:Save}
 *   {type:'fray', act:'n'|'s'|'e'|'w'|'wait'}   Lanewar: one turn
 *   {type:'fray', pick:0|1|2}                 Lanewar: take a card of the draft; the next wave begins
 *   {type:'fray', leave:true}                 Lanewar: take the winnings home from a draft (fray.canLeave)
 *   In mode 'fray' a tick only passes time, and confirm leaves a fallen board.
 *
 * @typedef {{v:5, chapter:number, scene:number, econ:Econ, seed:number,
 *            reels:{cells:[Cell,Cell,Cell], source:Source|null, armed:boolean, charge:number},
 *            ending:null|'commons'|'mint', fray:Meta}} Save
 *        Loads into 'play' at the start of its scene, with a fresh table and the reels as they
 *        stood when it was written (a line that had just paid is saved as cleared). v:1 and v:2
 *        saves have no `reels` and still load, with fresh reels. v:3 has no `ending` (loads as null) and
 *        no econ.hatsRefused (loads as 0). v:4 has no `fray` (loads as fray.newMeta()).
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
 *                                               jackpot, bust, loan, aid, objective, sceneClear, card, confirm,
 *                                               frayStep, fraySlash, frayHurt, frayBoom (Lanewar)
 *                                               reelStart: all three reels set going.  reelStop: one reel locked.
 *                                               confirm is also the spin elements lighting; eject also a kickback.
 *   {type:'music', mood:string}                 moods: title, festival, tense, covert, sorrow, hope, march,
 *                                               mine, court, shrine, dread, silence,
 *                                               academy, storm, village, exchange,
 *                                               capital, lanehold, thesum
 *   {type:'shake', power:number}
 *   {type:'flash', color:string}
 *   {type:'save', save:Save}
 *
 * game.js
 * export const REEL_STOPS: [number,number,number]   seconds at which each reel locks in a full spin
 * export const FILL_SECONDS, PAY_SECONDS, REELS_NEED, AID_WAIT, LEVER_DELAY: number
 * export function init(seedN: number): Game
 * export function update(content: Content, game: Game, msg: Msg): { game: Game, effects: Effect[] }
 * export const SAVE_VERSION: 5
 * export const LOADABLE_SAVES: number[]             every save version load accepts (1, 2, 3, 4, 5)
 * export const FRAY_NEED, FRAY_SAVE_SECONDS: number  hits that set the Lanewar board; the ball save for coming home from it
 * export function toSave(game: Game): Save
 * export function leverStatus(content, game): null|'wait'|'free'|'credit'|'pull'|'loan'
 *        what a press of the plunge button would do as the lever; null when it is not the lever
 *
 * story.js  (pure helpers used by game.js and by the renderer)
 * export const LEANINGS: ['commons','mint']
 * export function spokenLines(lines: Line[], lean): Line[]   the lines heard when the ledger leans `lean`
 * export function heardLines(lines: Line[], game): Line[]     spokenLines by leaningNow(game)
 * export function leaningNow(game): 'commons'|'mint'         game.ending once read, the live economy.leaning until then
 * export function readsLeaning(content, chapterIndex, sceneIndex): boolean
 *        whether completing that scene's objective freezes the leaning: only in the final chapter, at its
 *        last scene, or earlier at the first scene whose cutscene, or any later briefing or cutscene, has a lean line
 * export function endingOf(content, game): { leaning, title: string|null, text: string|null }
 *        for the end screen: the last chapter's endings[leaning], nulls when it has none
 * export function currentScene(content, game): Scene|null
 * export function objectiveProgress(scene: Scene, hits, seq): { done:number, total:number, complete:boolean }
 * export function litIds(content, game): string[]      element ids the current objective still needs
 * export function spotFor(table, scene, hits, id): string   the element a hit on id counts for: in an 'all' objective a
 *        standup target already lit passes its hit to the nearest unlit target of its bank (same group)
 * export function spinIds(content, game): string[]     element ids that spin the reels if hit now ([] unless armed)
 * export function metSpeakers(content, chapterIndex, sceneIndex): Set<string>
 * export function eligibleBarks(content, game, key): Line[]
 * export function preloadIds(content, game, ahead?): string[]
 * export function resolveStage(lines: Line[], index: number): { bg:string, on:string[] }
 * export function lineSeconds(line: Line): number      fallback duration if the shell never reports lineDone
 *
 * stage.js  (pure; the model of the live 3D stage)
 * export const COMBO_WEIGHT, COMBO_WINDOW, COMBO_LEVELS, COMBO_NAMES, COMBO_MULT, RECENT_MAX, RESOLVE_SECONDS,
 *              TRUST_PER_SUPPORTER, ENCOUNTER_KINDS, ENCOUNTER_MODES, LIGHTS
 * export function comboOf(log: LogEntry[], now: number, opts?: {window?, levels?}): StageState['combo']
 *        a drain no save covered ends the chain; so does COMBO_WINDOW seconds without a counting event
 * export function comboBonus(log, now, points): number   extra SCORE for a table hit at this chain. Never marks
 * export function pushRecent(log, entry): LogEntry[]     bounded append that keeps comboOf's answer
 * export function stageState(content, game): StageState
 * export function beatAt(encounter, done): number        index of the beat in force, -1 with no beats
 * export function encounterProblems(content, chapter, scene): string[]   [] when the encounter is well formed
 * export function setsNeeded(chapter): string[]          every set id the chapter needs; [] when it is not staged
 */

export {};
