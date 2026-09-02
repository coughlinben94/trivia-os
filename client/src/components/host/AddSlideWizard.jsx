import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { sortedSlides } from '../../hooks/useShow.js'
import { insertAfterSlideId } from '../../lib/questionNumbering.js'
import { JUKEBOX_LIBRARIES } from '../../lib/jukeboxLibraries.js'
import { fetchJukeboxLibraries } from '../../lib/jukeboxSupabase.js'
import { makeQuestionPasteHandler, makeCleanPasteHandler } from '../../lib/cleanPaste.js'
import { FIXED_SHAPE_KINDS } from '../../lib/shinyWizardKinds.jsx'
import { withShinyTitleSlide, withShinyGroupId } from '../../lib/shinySeries.js'

export const TYPE_CARDS = [
  { type: 'pre-show',       icon: '📱', name: 'Pre-Show',            desc: 'QR code + team count while people join' },
  { type: 'state-of-union', icon: '🇺🇸', name: 'State of the Union', desc: 'Opening address to the crowd' },
  { type: 'rules',          icon: '🚨', name: 'Rules',              desc: 'Cinematic house-rules warning broadcast' },
  { type: 'team-picker',    icon: '🚀', name: 'Team Intro',            desc: 'Cinematic one-by-one team intro' },
  { type: 'round-intro',    icon: '🎬', name: 'Round Intro',          desc: 'Dramatic round opener' },
  { type: 'question',       icon: '❓', name: 'Question',             desc: 'Plain text question' },
  { type: 'shiny-question', icon: '✨', name: 'Shiny Question',       desc: 'Pick a format and fill it in' },
  { type: 'grading-break',  icon: '⏸️', name: 'Grading Break',       desc: 'While Ben grades papers' },
  { type: 'scoreboard-reveal', icon: '🏆', name: 'Scoreboard Reveal', desc: 'Round standings — also unlocks phone scores for this round' },
  { type: 'winner-reveal',  icon: '🥇', name: 'Winner Reveal',       desc: 'Drum roll → winner + confetti' },
  // hidden 2026-08-19 — folded into a popup off the Press Your Luck tile in
  // BuildMode.jsx (Ben: board was "messy") instead of standing alone here.
  // Metadata kept for icon/name lookups elsewhere (header, sidebar).
  { type: 'pyl-lotto',      icon: '🎰', name: 'Lotto Animation',     desc: 'Press Your Luck — pick animation live, same as any PYL spin', hidden: true },
  { type: 'pyl-board',      icon: '🎯', name: 'Theme Picker',        desc: 'Press Your Luck — on-screen board naming the 2-3 embedded themes', hidden: true },
  { type: 'custom',         icon: '✏️', name: 'Custom',              desc: 'Freeform slide' },
  // utility-only — not shown in the picker grid, but provides icon/name metadata for header + sidebar
  { type: 'team-preview',   icon: '👥', name: 'Team List',           desc: 'Show all team names on screen', hidden: true },
  // Never created from the picker — every shiny creation prepends one
  // automatically (see handleCreate's addShiny). Metadata only.
  { type: 'shiny-title',    icon: '✨', name: 'Shiny Title',         desc: 'Announce card that opens a shiny series', hidden: true },
]

const NEEDS_ROUND = new Set(['swing-round-intro', 'question', 'shiny-question', 'grading-break', 'scoreboard-reveal', 'pixelate-series', 'multi-question', 'pyl-lotto', 'pyl-board'])

const MEDIA_DOT = { image: 'bg-green-400', audio: 'bg-blue-400', text: 'bg-amber-400', video: 'bg-purple-400', list: 'bg-orange-400' }

const BTN = 'host-button'

// ── Shiny creation shape (2026-08-26 rebuild) ────────────────────────────────
// One popup for every asset-capable format: how many ASSETS come after the
// title card, and how those assets relate to each other. Nothing branches on
// invisible format flags any more — the format can pre-fill both answers, and
// can never lock either one (the preset lock caused a real live incident on
// 2026-08-25: a host stared at a count he could not change).
//
// Which formats skip the generic count/relationship UI, and what each
// bespoke one does instead, now lives in shinyWizardKinds.jsx — see that
// file's header comment for why (2026-09-01, replacing the hand-maintained
// FIXED_SHAPE_TYPES Set this used to be).

// "All at once" only exists where something can actually draw it: text
// (ShinyConcurrentQuestion's cumulative reveal) and image (every tile at once
// via GridContent). Audio/video/list formats get the two choices that are
// real for them rather than a third that would render nothing.
const CONCURRENT_CAPABLE_TYPES = new Set(['text', 'image'])

const RELATIONSHIPS = [
  { id: 'sequential', label: 'One at a time',  hint: 'One question. Next steps through the assets.' },
  { id: 'concurrent', label: 'All at once',    hint: 'One question. Every asset on screen together, one shared answer.' },
  { id: 'separate',   label: 'Separate questions', hint: 'Each asset becomes its own question — its own number, its own answer.' },
]

// What the relationship control starts on. A format may pre-select it; it can
// never decide it (Ben: "ask each time, as a 3rd choice"). Legacy
// `concurrent: true` maps to 'concurrent' for TEXT formats only — on image
// formats that flag has always produced one-at-a-time playback, and reading it
// as all-at-once here would quietly change what those formats do.
function defaultRelationship(fmt) {
  const schema = fmt?.input_schema ?? {}
  if (schema.defaultDisplay) return schema.defaultDisplay
  if (schema.concurrent === true && schema.type === 'text') return 'concurrent'
  return 'sequential'
}

// The format's preset asset count is a DEFAULT the host can always edit.
function defaultAssetCount(fmt) {
  const slots = fmt?.input_schema?.slots
  return (typeof slots === 'number' && slots > 0) ? slots : 1
}

// Editable: add a fundraiser type by adding one object here
export const ROUND_TYPES = [
  { id: 'normal', label: 'Normal Round',    needsNumber: true,  titleTemplate: 'Round {n}' },
  { id: 'swing',  label: 'Swing Round',     needsNumber: false, title: 'Swing Round' },
  { id: 'pyl',    label: 'Press Your Luck!', needsNumber: false, title: 'Press Your Luck!' },
]

export default function AddSlideWizard({ show, onAddSlide, onClose, onTypeChange, initialData = {}, shinyFormats, shinyLoading }) {
  const [type, setType] = useState(initialData.type ?? null)
  const typeCard = TYPE_CARDS.find(c => c.type === type)

  // Shared
  const [roundId, setRoundId] = useState(initialData.roundId ?? null)

  // Question (plain)
  const [questionText,   setQuestionText]   = useState('')
  const [questionAnswer, setQuestionAnswer] = useState('')
  const [isBonus, setIsBonus]               = useState(false)

  // Question (shiny)
  const [selectedShinyFmt, setSelectedShinyFmt] = useState(null)
  const [shinyStep,         setShinyStep]        = useState('pick') // 'pick' | 'details'
  const [shinyFmtSearch,    setShinyFmtSearch]    = useState('')
  const [shinyQuestion,     setShinyQuestion]    = useState('')
  const [shinyAnswer,       setShinyAnswer]      = useState('')
  const [gridCols, setGridCols] = useState(4)
  const [gridRows, setGridRows] = useState(3)
  const [vennPerSide, setVennPerSide] = useState(3)
  // "How many assets" for venn means how many SEPARATE venn questions to
  // create in one go (Ben, 2026-09-01: "I'll be asking three separate venn
  // diagrams" — a round of 3 standalone puzzles, not 3 people on one side).
  // Blank-able string state, same idiom as assetCount.
  const [vennSlideCount, setVennSlideCount] = useState('1')
  // The two — and only two — shape questions the shiny popup asks: how many
  // assets come after the title card, and how they relate to each other.
  // Both are pre-filled from the format and both are always editable.
  // Blank-able string state so the field can be cleared while typing.
  const [assetCount, setAssetCount] = useState('1')
  const [relationship, setRelationship] = useState('sequential')

  // Round-intro — pre-filled from AddRoundWizard or from round filter; also derived from selected round
  const _preRound = initialData.roundId ? show.rounds.find(r => r.id === initialData.roundId) : null
  const [roundType,     setRoundType]     = useState(initialData.roundType   ?? _preRound?.roundType ?? 'normal')
  const [roundNumber,   setRoundNumber]   = useState(initialData.roundNumber ?? _preRound?.roundNumber ?? _preRound?.number ?? 1)
  const [roundSubtitle, setRoundSubtitle] = useState(initialData.roundSubtitle ?? '')

  // Grading-break
  const [jukeboxLib, setJukeboxLib]   = useState('random')
  const [jukeboxLibs, setJukeboxLibs] = useState(JUKEBOX_LIBRARIES)

  // PYL — Theme Picker board (persists as slide.type 'pyl-reveal' with
  // items/title set — PylRevealSlide's static branch).
  const [pylBoardNames, setPylBoardNames] = useState(['', '', ''])

  useEffect(() => {
    let alive = true
    fetchJukeboxLibraries().then(libs => { if (alive && libs) setJukeboxLibs(libs) })
    return () => { alive = false }
  }, [])

  const sorted = sortedSlides(show)

  // Derived — never stored, always recomputed
  const selRoundType      = ROUND_TYPES.find(rt => rt.id === roundType) ?? ROUND_TYPES[0]
  const derivedRoundTitle = selRoundType.needsNumber
    ? selRoundType.titleTemplate.replace('{n}', roundNumber || '?')
    : selRoundType.title

  const roundNumValid = !selRoundType.needsNumber || (Number.isInteger(roundNumber) && roundNumber > 0)

  function pickRound(id) {
    setRoundId(id || null)
  }

  async function handleCreate() {
    const roundSlides = sorted.filter(s => s.roundId === roundId)
    // A round built entirely from one shiny format (2026-08-18, Ben: 6 Drag
    // and Drop questions in a row for Swing Round) shouldn't get that
    // format's title card again on every single question — only the first
    // one in the round needs it. (A `shiny-title` slide itself carries
    // isShiny + shinyFormatId, so it counts here too.)
    const formatAlreadyIntroducedThisRound = fmtId =>
      roundSlides.some(s => s.data?.isShiny && s.data?.shinyFormatId === fmtId)
    // Every shiny creation goes through here (2026-09-01, SPEC.md): the
    // standalone `shiny-title` slide is prepended to whatever the path built
    // — single slide, tied parts[] series, N separate siblings, grid, venn —
    // sharing one shinyGroupId with its content. Content slides no longer
    // carry introDone; the title card is a real slide, not a swap state.
    // Skipping the repeat announce card must NOT skip the grouping: without
    // a shinyGroupId the new question is a loose slide (no sidebar group, no
    // atomic reorder, no title to jump to), and `shiny-title` is hidden in
    // the picker so nothing could give it one later.
    const addShiny = payload => onAddSlide(
      formatAlreadyIntroducedThisRound(selectedShinyFmt.id)
        ? withShinyGroupId(payload)
        : withShinyTitleSlide(payload, selectedShinyFmt)
    )
    const nonBonusQ   = roundSlides.filter(s => (s.type === 'question' || s.type === 'pixelate-series' || s.type === 'grid') && !s.data?.isBonus)
    const bonusQ      = roundSlides.filter(s => s.type === 'question' && s.data?.isBonus)
    const qNum = nonBonusQ.length + 1
    const bNum = bonusQ.length + 1

    let data = {}

    if (type === 'title') {
      data = { title: 'Baynes Apple Valley', subtitle: 'Trivia Night' }

    } else if (type === 'round-intro') {
      data = {
        roundNumber:  selRoundType.needsNumber ? roundNumber : undefined,
        roundTitle:   derivedRoundTitle,
        subtitle:     roundSubtitle,
        hostPhotoUrl: null,
        roundType,
      }

    } else if (type === 'question' || type === 'shiny-question') {
      const num = isBonus ? bNum : qNum
      if (selectedShinyFmt && shinyStep === 'details') {
        // Bespoke-shape formats (grid, venn, …) build their own slide payload —
        // the registry entry decides which builder runs, so handleCreate no
        // longer needs to know those formats exist by name.
        if (fixedShapeKind?.buildSlideData) {
          const afterId = insertAfterSlideId(roundSlides, sorted)
          await addShiny(fixedShapeKind.buildSlideData({
            qNum, roundId, afterId, selectedShinyFmt,
            shinyQuestion, shinyAnswer,
            gridCols, gridRows, vennPerSide, vennSlideCount,
          }))
          return
        }

        // ── One unified shape path (2026-08-26 rebuild) ──────────────────
        // Count + relationship, nothing else. The format's `slots` preset only
        // pre-filled the count input; it never overrides what the host typed.
        // Fixed-shape formats (matching/wager/order — venn/grid already
        // returned above) never show either control, so they land here as
        // assetNum 1 / 'sequential' and keep their flat shape exactly as
        // before.
        const schema = selectedShinyFmt.input_schema ?? null
        const shinyBase = n => ({
          questionNumber:  n,
          questionLabel:   `Q${n}`,
          questionMode:    'shiny',
          isShiny:         true,
          shinyFormatId:   selectedShinyFmt.id,
          shinyFormatName: selectedShinyFmt.name,
          shinyFormatIcon: selectedShinyFmt.icon,
          shinyType:       schema?.type ?? null,
        })
        const afterId = insertAfterSlideId(roundSlides, sorted)

        if (effectiveRel === 'separate') {
          // N literal sibling slides — each its own Q-number, sidebar row,
          // Next press, phone submission and score. One shinyGroupId stamped
          // across the run makes the grouping exact: two runs of the same
          // format in the same round no longer merge into one (the latent bug
          // isShinySeriesSibling documents).
          const groupId = `sgrp_${nanoid(8)}`
          const slidesData = Array.from({ length: assetNum }, (_, i) => ({
            type: 'question',
            roundId: roundId ?? null,
            data: {
              ...shinyBase(qNum + i),
              // slots: 1 (2026-08-26, overseer review) — each sibling is ONE
              // asset; without this a format with a slots preset (e.g. 4)
              // renders 4 media-slot inputs in the editor for a slide that
              // only ever shows slot 0, same fix the tied branch below
              // already applies to its own shinyInputSchema.
              shinyInputSchema: schema ? { ...schema, slots: 1 } : null,
              isSeries:      true,
              seriesTheme:   selectedShinyFmt.name,
              shinyGroupId:  groupId,
              text:          '',
              answer:        '',
              mediaSlots:    [],
            },
          }))
          await addShiny({ afterSlideId: afterId, slides: slidesData })
          return
        }

        if (assetNum > 1) {
          // Tied together — ONE slide, N parts. shinyDisplay is the single
          // field that decides one-at-a-time vs all-at-once, read at RENDER
          // time, so the host can flip it later in the editor without
          // recreating the question. (The old path froze that choice into the
          // slide's TYPE: a non-concurrent image series became a `grid`
          // slide, unchangeable afterward.)
          const q = shinyQuestion.trim()
          await addShiny({
            type: 'question',
            roundId: roundId ?? null,
            afterSlideId: afterId,
            data: {
              ...shinyBase(qNum),
              shinyInputSchema: schema ? { ...schema, slots: 1 } : null,
              shinyDisplay:     effectiveRel,
              isSeries:         true,
              seriesTheme:      selectedShinyFmt.name,
              currentPart:      0,
              // Slide-level text is what the all-at-once renderers draw
              // (ShinyConcurrentQuestion's header, GridContent's caption);
              // one-at-a-time renders each PART's own text, so a shared
              // question is copied onto every part too — unconditionally
              // (2026-08-26, overseer review: this used to only copy it for
              // 'sequential', so a concurrent creation left every part's
              // text blank, and flipping concurrent -> sequential in the
              // editor later showed empty captions instead of "never loses
              // it" as originally intended).
              text:   q,
              answer: shinyAnswer.trim(),
              parts:  Array.from({ length: assetNum }, () => ({
                label: '', text: q, answer: '', mediaSlots: [],
              })),
            },
          })
          return
        }

        // One asset — the flat single-asset shape, unchanged.
        await addShiny({
          type: 'question',
          roundId: roundId ?? null,
          afterSlideId: afterId,
          data: {
            ...shinyBase(qNum),
            shinyInputSchema: schema,
            text:             shinyQuestion.trim(),
            answer:           shinyAnswer.trim(),
            mediaSlots:       [],
          },
        })
        return
      } else {
        data = {
          questionNumber: num,
          questionLabel:  isBonus ? `B${num}` : `Q${num}`,
          questionMode:   'regular',
          isShiny:        false,
          text:           questionText.trim(),
          answer:         questionAnswer.trim(),
          mediaSlots:     [],
          ...(isBonus && { isBonus: true }),
        }
      }

    } else if (type === 'grading-break') {
      data = {
        message:         "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊",
        backLinkSlideId: null,
        jukeboxLib,
      }

    } else if (type === 'custom') {
      data = { title: '', body: '', mediaUrl: null, mediaType: null }

    } else if (type === 'pyl-lotto') {
      // Bare pyl-reveal slide, no animationId/pool/winnerId — the host
      // picks live from LiveMode's "Pick animation" row (real team pool,
      // real winner), same as every other PYL slide. Pre-seeding
      // theme-name candidates here was wrong (2026-08-18, Ben: "the tile
      // only is supposed to invoke the lotto then the picker animation.
      // not the three themes thing") — that's the Theme Picker board's job.
      data = {}

    } else if (type === 'pyl-board') {
      const names = pylBoardNames.map(n => n.trim()).filter(Boolean)
      const items = names.map(name => ({ text: name, targetSlideId: null }))
      data = {
        title: 'Which will it be?',
        items,
        // Board names are the click targets, not a build-suspense reveal
        // list — they need to be visible immediately so the host can click
        // whichever the winning team calls (2026-08-18, Ben).
        currentReveal: items.length,
      }
    }

    // Insert right after this round's last existing slide (not the absolute end of
    // the show) — otherwise a slide added to an earlier round lands after Winner
    // Reveal/later rounds, splitting the round into two non-contiguous sidebar
    // groups. See insertAfterSlideId (questionNumbering.js) for why winner-reveal
    // is excluded from "this round's last slide."
    const afterSlideId = insertAfterSlideId(roundSlides, sorted)
    // Both dashboard tiles ("Question" and "Shiny Question") persist as the
    // same slide type — data.isShiny is what actually distinguishes them.
    // Same story for the two PYL tiles: both persist as 'pyl-reveal' —
    // PylRevealSlide branches on animationId/winnerId presence to tell the
    // spin phase from the static board phase, not on a separate slide type.
    const slideType = (type === 'question' || type === 'shiny-question') ? 'question'
      : (type === 'pyl-lotto' || type === 'pyl-board') ? 'pyl-reveal'
      : type
    await onAddSlide({ type: slideType, roundId: roundId ?? null, afterSlideId, data })
  }

  const needsRound     = NEEDS_ROUND.has(type)
  const canCreate      = !(needsRound && !roundId)
    && (type !== 'round-intro' || (roundNumValid && !!roundId))
    && (type !== 'pyl-board' || pylBoardNames.filter(n => n.trim()).length >= 2)
  const canAddQuestion = !!roundId && questionText.trim().length > 0 && questionAnswer.trim().length > 0
  const shinyFmtType    = selectedShinyFmt?.input_schema?.type ?? null
  const fixedShapeKind  = shinyFmtType ? FIXED_SHAPE_KINDS[shinyFmtType] : null
  const isFixedShapeFmt = !!fixedShapeKind
  const fmtAssetPreset  = selectedShinyFmt?.input_schema?.slots
  const hasAssetPreset  = typeof fmtAssetPreset === 'number' && fmtAssetPreset > 0
  // The typed count wins, always. A preset only pre-fills it (see the
  // creation-shape comment at the top of this file for the incident that made
  // this non-negotiable).
  // Fixed-shape formats are pinned to 1: their count input never renders, so
  // a stray `slots` preset on a matching/wager/order format must not silently
  // turn it into a parts[] series — those mechanics read flat data only.
  const assetNum        = isFixedShapeFmt ? 1 : Math.min(20, Math.max(1, parseInt(assetCount, 10) || 1))
  // With one asset the three relationships are identical, so the control
  // hides and 'sequential' is what gets stamped.
  const showRelationship = !isFixedShapeFmt && assetNum > 1
  const relationshipOptions = RELATIONSHIPS.filter(r => r.id !== 'concurrent' || CONCURRENT_CAPABLE_TYPES.has(shinyFmtType))
  const effectiveRel    = !showRelationship ? 'sequential'
    : relationshipOptions.some(r => r.id === relationship) ? relationship
    : 'sequential'
  // Venn's own "how many assets" means how many SEPARATE questions — there's
  // no sequential/concurrent concept for a Venn puzzle, only "one" or "a
  // batch of standalone ones," so it skips the relationship picker entirely.
  const isVenn          = shinyFmtType === 'venn'
  const vennNum         = Math.min(20, Math.max(1, parseInt(vennSlideCount, 10) || 1))
  // Separate questions can't share one typed answer — those slides start
  // blank and get filled in the editor, exactly as the old batch path did.
  const showSharedFields = effectiveRel !== 'separate' && !(isVenn && vennNum > 1)
  // A plain single-asset question — and every fixed-shape format — still
  // needs its answer up front, unchanged. Multi-asset tied questions usually
  // answer per-asset in the editor, so the shared answer is optional there.
  const sharedAnswerRequired = showSharedFields && (isFixedShapeFmt || assetNum === 1)
  const canAddShiny    = !!roundId && (!sharedAnswerRequired || shinyAnswer.trim().length > 0)
  const isPlainOnly    = type === 'question'
  const isShinyOnly    = type === 'shiny-question'
  const isQuestionType = isPlainOnly || isShinyOnly
  const isShinyDetails = isQuestionType && shinyStep === 'details' && !!selectedShinyFmt

  const visibleShinyFormats = shinyFmtSearch.trim()
    ? shinyFormats.filter(fmt => {
        const q = shinyFmtSearch.trim().toLowerCase()
        return fmt.name?.toLowerCase().includes(q) || fmt.description?.toLowerCase().includes(q)
      })
    : shinyFormats


  // ── Type picker (when opened without a pre-selected type, e.g. from round view) ──
  if (!type) {
    return (
      <div className="bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add a slide</h2>
          <button
            onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap gap-3">
            {TYPE_CARDS.filter(card => !card.hidden && !(initialData.roundId && card.type === 'title')).map(card => (
              <button
                key={card.type}
                onClick={() => { setType(card.type); onTypeChange?.(card.type) }}
                className={`w-[calc(50%-6px)] flex flex-col gap-2 p-4 rounded-xl border-2 border-gray-100 hover:border-gray-300 bg-white hover:bg-gray-50 text-left transition-colors ${BTN}`}
              >
                <span className="text-2xl leading-none">{card.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{card.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{card.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          {isShinyDetails ? (
            <button
              onClick={() => setShinyStep('pick')}
              className={`text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
            >
              ←
            </button>
          ) : !initialData.type && (
            <button
              onClick={() => setType(null)}
              className={`text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 ${BTN}`}
            >
              ←
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-900">
            {isShinyDetails
              ? <>{selectedShinyFmt.icon} {selectedShinyFmt.name}</>
              : <><span className="mr-2">{typeCard?.icon}</span>{typeCard?.name}</>
            }
          </h2>
        </div>
        <button
          onClick={onClose}
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg ${BTN}`}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">

        {isShinyDetails ? (
          /* ── SHINY STEP 2: text + answer form ── */
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-gray-400">{selectedShinyFmt.blurb}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Round</label>
              {show.rounds.length === 0 ? (
                <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" first.</p>
              ) : (
                <select
                  value={roundId ?? ''}
                  onChange={e => pickRound(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                >
                  <option value="">Select a round…</option>
                  {show.rounds.map(r => (
                    <option key={r.id} value={r.id}>R{r.number} — {r.title}</option>
                  ))}
                </select>
              )}
            </div>

            {/* How many assets — one input, always visible, always editable.
                A format's `slots` preset only pre-fills it. It used to HIDE
                this input and hard-override the value, which on 2026-08-25
                left a host staring at a number he could not change mid-build. */}
            {!isFixedShapeFmt && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">How many assets?</label>
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={20}
                  value={assetCount}
                  onChange={e => setAssetCount(e.target.value)}
                  placeholder="1"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-900 text-center focus:outline-none focus:ring-1 focus:ring-[#1a6b4a] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  The title card is automatic — this is how many assets come after it.
                  {hasAssetPreset && assetNum !== fmtAssetPreset ? ` Format default: ${fmtAssetPreset}.` : ''}
                </p>
              </div>
            )}

            {/* How the assets relate — asked every time, never decided by the
                format (Ben: "ask each time, as a 3rd choice"). Hidden at one
                asset, where all three answers are the same thing. */}
            {showRelationship && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">How do these {assetNum} assets go together?</label>
                <div className="flex flex-col gap-1.5">
                  {relationshipOptions.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRelationship(opt.id)}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                        effectiveRel === opt.id
                          ? 'bg-yellow-50 border-yellow-400'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-xs font-semibold ${effectiveRel === opt.id ? 'text-yellow-700' : 'text-gray-600'}`}>{opt.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{opt.hint}</p>
                    </button>
                  ))}
                </div>
                {effectiveRel === 'separate' && (
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Creates {assetNum} slides — fill each one in from the slide editor.
                  </p>
                )}
              </div>
            )}

            {/* Bespoke-shape formats set their own shape instead of the
                generic count/relationship controls — grid's Columns/Rows,
                venn's separate-question and per-side counts. Each kind's
                controls live with its slide builder in shinyWizardKinds.jsx. */}
            {fixedShapeKind?.extraControls?.({
              gridCols, setGridCols, gridRows, setGridRows,
              vennSlideCount, setVennSlideCount, vennNum, vennPerSide, setVennPerSide,
            })}

            {/* Question + answer — the two tied modes share one of each.
                Separate questions can't, so those slides start blank. */}
            {showSharedFields && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Question text <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={shinyQuestion}
                    onChange={e => setShinyQuestion(e.target.value)}
                    placeholder="e.g. What connects these four images?"
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Answer
                    {!sharedAnswerRequired && <span className="font-normal text-gray-400"> (optional — each asset can have its own)</span>}
                  </label>
                  <input
                    type="text"
                    value={shinyAnswer}
                    onChange={e => setShinyAnswer(e.target.value)}
                    // Fixed-shape formats render no count input, so the answer
                    // takes the focus the count would otherwise have had —
                    // except venn, which has its own count input to focus.
                    autoFocus={isFixedShapeFmt && !isVenn}
                    placeholder={sharedAnswerRequired ? 'The answer…' : 'Leave blank for per-asset answers'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={handleCreate}
                disabled={!canAddShiny}
                className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Add {selectedShinyFmt.name} →
              </button>
              {!canAddShiny && (
                <p className="text-xs text-gray-400 text-center">
                  {!roundId ? 'Select a round to continue' : 'Add an answer to continue'}
                </p>
              )}
            </div>
          </div>

        ) : isPlainOnly ? (
          /* ── PLAIN QUESTION ── */
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">📝 Plain question</p>
              <p className="text-xs text-gray-400 mt-0.5">Text question added to a round</p>
            </div>

            <div>
              <label htmlFor="add-question-text" className="block text-xs font-medium text-gray-500 mb-1.5">
                Question text
              </label>
              <textarea
                id="add-question-text"
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                onPaste={makeQuestionPasteHandler(setQuestionText, setQuestionAnswer)}
                placeholder="Type or paste your question…"
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>

            <div>
              <label htmlFor="add-question-answer" className="block text-xs font-medium text-gray-500 mb-1.5">
                Answer
              </label>
              <input
                id="add-question-answer"
                type="text"
                value={questionAnswer}
                onChange={e => setQuestionAnswer(e.target.value)}
                onPaste={makeCleanPasteHandler(setQuestionAnswer)}
                placeholder="The answer…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
            </div>

            <div>
              <label htmlFor="add-question-round" className="block text-xs font-medium text-gray-500 mb-1.5">
                Round
              </label>
              {show.rounds.length === 0 ? (
                <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" first.</p>
              ) : (
                <select
                  id="add-question-round"
                  value={roundId ?? ''}
                  onChange={e => pickRound(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                >
                  <option value="">Select a round…</option>
                  {show.rounds.map(r => (
                    <option key={r.id} value={r.id}>R{r.number} — {r.title}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Bonus checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="add-question-bonus"
                type="checkbox"
                checked={isBonus}
                onChange={e => setIsBonus(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#1a6b4a]"
              />
              <label htmlFor="add-question-bonus" className="text-sm text-gray-700 cursor-pointer select-none">
                Bonus question
              </label>
            </div>

            <div className="mt-auto flex flex-col gap-1.5">
              <button
                onClick={handleCreate}
                disabled={!canAddQuestion}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Add question →
              </button>
              {!canAddQuestion && (
                <p className="text-xs text-gray-400 text-center">
                  {!roundId ? 'Select a round to continue' : !questionText.trim() ? 'Add question text to continue' : 'Add an answer to continue'}
                </p>
              )}
            </div>
          </div>

        ) : isShinyOnly ? (
          /* ── SHINY FORMAT PICKER ── */
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">✨ Shiny formats</p>
              <p className="text-xs text-gray-400 mt-0.5">Pick a format</p>
            </div>
            {!shinyLoading && shinyFormats.length > 0 && (
              <div className="relative shrink-0">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  value={shinyFmtSearch}
                  onChange={e => setShinyFmtSearch(e.target.value)}
                  placeholder="Search formats…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                />
              </div>
            )}
            {shinyLoading ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : shinyFormats.length === 0 ? (
              <p className="text-xs text-gray-400">No formats yet — add one via ✨ Add Shiny.</p>
            ) : visibleShinyFormats.length === 0 ? (
              <p className="text-xs text-gray-400">No formats match "{shinyFmtSearch.trim()}".</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {visibleShinyFormats.map(fmt => {
                  const mediaType = fmt.input_schema?.type
                  const slots = fmt.input_schema?.slots
                  const isSel = selectedShinyFmt?.id === fmt.id
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedShinyFmt(isSel ? null : fmt)}
                      title={fmt.description}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-[border-color,background-color,transform] duration-[120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                        isSel
                          ? 'bg-yellow-50 border-yellow-400'
                          : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-base leading-none mt-0.5 shrink-0">{fmt.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate leading-tight ${isSel ? 'text-yellow-700' : 'text-gray-600'}`}>{fmt.name}</p>
                        {mediaType && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${MEDIA_DOT[mediaType] ?? 'bg-gray-300'}`} />
                            <span className="text-[11px] text-gray-400 leading-none">{mediaType}</span>
                          </div>
                        )}
                      </div>
                      {slots != null && (
                        <span className="text-[11px] text-gray-400 shrink-0 self-start mt-0.5">×{slots}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Add button — appears once a format is selected */}
            {selectedShinyFmt && (
              <div className="mt-auto pt-2">
                <button
                  onClick={() => {
                    // Seed both shape controls from the format — a pre-fill,
                    // not a lock. Both stay editable on the next screen.
                    setAssetCount(String(defaultAssetCount(selectedShinyFmt)))
                    setRelationship(defaultRelationship(selectedShinyFmt))
                    setShinyStep('details')
                  }}
                  className={`w-full bg-yellow-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-yellow-600 ${BTN}`}
                >
                  Add {selectedShinyFmt.name} →
                </button>
              </div>
            )}
          </div>

        ) : (
          /* ── DETAILS FORM: all other types ── */
          <div className="flex flex-col gap-5">

            {/* Round selector — sources from show.rounds (the real registry) */}
            {needsRound && (
              <div>
                <label htmlFor="add-round-select" className="block text-xs font-medium text-gray-500 mb-1.5">
                  {type === 'grading-break' ? 'End of which round?' : 'Round'}
                </label>
                {show.rounds.length === 0 ? (
                  <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" in the sidebar first.</p>
                ) : (
                  <select
                    id="add-round-select"
                    value={roundId ?? ''}
                    onChange={e => pickRound(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  >
                    <option value="">Select a round…</option>
                    {show.rounds.map(r => (
                      <option key={r.id} value={r.id}>R{r.number} — {r.title}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* ── ROUND INTRO: associate round → subtitle ── */}
            {type === 'round-intro' && (
              <>
                {/* Round association — only shown when not pre-filled from AddRoundWizard */}
                {!roundId && (
                  <div>
                    <label htmlFor="add-round-assoc" className="block text-xs font-medium text-gray-500 mb-1.5">
                      Associate with round
                    </label>
                    {show.rounds.length === 0 ? (
                      <p className="text-sm text-gray-400">No rounds yet — use "+ Add Round" in the sidebar first.</p>
                    ) : (
                      <select
                        id="add-round-assoc"
                        value={roundId ?? ''}
                        onChange={e => {
                          pickRound(e.target.value)
                          const r = show.rounds.find(r => r.id === e.target.value)
                          if (r) {
                            setRoundType(r.roundType ?? 'normal')
                            setRoundNumber(r.roundNumber ?? r.number ?? 1)
                          }
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                      >
                        <option value="">Select a round…</option>
                        {show.rounds.map(r => (
                          <option key={r.id} value={r.id}>R{r.number} — {r.title}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Subtitle — optional punchline, fully controlled so clearing sticks */}
                <div>
                  <label htmlFor="add-round-subtitle" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Subtitle <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="add-round-subtitle"
                    type="text"
                    value={roundSubtitle}
                    onChange={e => setRoundSubtitle(e.target.value)}
                    placeholder='e.g. "Fight!" or "It did not went well."'
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                  />
                </div>

                {/* Derived title preview */}
                <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Will read as</p>
                  <p className="text-sm font-semibold text-gray-800">{derivedRoundTitle}</p>
                  {roundSubtitle && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">{roundSubtitle}</p>
                  )}
                </div>
              </>
            )}

            {/* ── GRADING BREAK: jukebox only ── */}
            {type === 'grading-break' && (
              <div>
                <label htmlFor="add-jukebox-lib" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Between-rounds music
                </label>
                <select
                  id="add-jukebox-lib"
                  value={jukeboxLib}
                  onChange={e => setJukeboxLib(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                >
                  <option value="random">🎲 Random</option>
                  {jukeboxLibs.map(lib => (
                    <option key={lib.id} value={lib.id}>{lib.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── PYL LOTTO ANIMATION: no fields — bare pyl-reveal slide,
                 the host picks the real animation/winner live from
                 LiveMode's "Pick animation" row (2026-08-18, Ben) ── */}
            {type === 'pyl-lotto' && (
              <p className="text-xs text-gray-400">
                Creates an empty slide — pick the animation and winning team live from the "Pick animation" row when this slide is up.
              </p>
            )}

            {/* ── PYL THEME PICKER BOARD: on-screen list of the 2-3 embedded
                 themes — audience sees the names, host advances into
                 whichever one the lotto landed on ── */}
            {type === 'pyl-board' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Theme options <span className="font-normal text-gray-400">(2 or 3 — leave the third blank for 2)</span>
                </label>
                <div className="flex flex-col gap-2">
                  {pylBoardNames.map((name, i) => (
                    <input
                      key={i}
                      type="text"
                      value={name}
                      onChange={e => setPylBoardNames(prev => prev.map((n, j) => j === i ? e.target.value : n))}
                      placeholder={`Theme ${i + 1}${i === 2 ? ' (optional)' : ''}`}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className={`w-full bg-[#1a6b4a] text-white text-sm font-semibold py-3 rounded-xl hover:bg-green-900 ${BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Add Slide →
              </button>
              {!canCreate && (
                <p className="text-xs text-gray-400 text-center">
                  {!roundId
                    ? 'Select a round to continue'
                    : 'Enter a round number to continue'}
                </p>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
