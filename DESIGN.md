# MusicQuiz Design System

## 1. Atmosphere & Identity

MusicQuiz is a quiet, paper-like study tool: warm neutral surfaces, restrained category accents, compact educational controls, and borders instead of decorative depth. Its signature is the category-colored rule that carries each music-theory area through cards, progress, and actions without changing the calm monochrome foundation.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Background | `--bg` | `#faf9f6` | Page canvas |
| Background/soft | `--bg-soft` | `#f0efe9` | Compact controls and labels |
| Surface | `--surface` | `#ffffff` | Cards and controls |
| Surface/strong | `--surface-strong` | `#f5f4ef` | Nested panels and hover states |
| Text | `--text` | `#17160f` | Primary text |
| Text/muted | `--muted` | `#66655c` | Supporting copy and statuses |
| Text/faint | `--faint` | `#a19f93` | Low-emphasis metadata |
| Border | `--line` | `#e4e2d8` | Default separators |
| Border/strong | `--line-strong` | `#cbc9bc` | Emphasized separators |
| Accent | `--accent`, `--cat-c` | `#17160f`, category-specific | Primary actions and category context |
| Success | `--success`, `--success-soft` | `#276b41`, `#e9f2ea` | Correct and successful states |
| Warning | `--warning`, `--warning-soft` | `#8a5a10`, `#f5eee0` | Intermediate achievement states |
| Error | `--danger`, `--danger-soft` | `#a13327`, `#f7ece9` | Incorrect and failed states |

Colors already embedded in notation/PDF rendering remain compatibility exceptions. New UI states use semantic tokens only.

## 3. Typography

The primary stack is `Pretendard`, then platform sans-serif fallbacks. Existing sizes range from 11px metadata to a responsive 44px hero; new supporting status copy reuses `.typora-comment` at 13.5px. Weight 700 identifies headings, labels, and controls; body and explanation text use normal weight with 1.5-1.7 line height.

## 4. Spacing & Layout

The base unit is `--space: 8px`; existing spacing uses half-steps (4px) where compact alignment requires them. Cards use 16-28px internal spacing, controls use 6-14px, and repeated groups use 8-16px gaps. Content is centered in responsive shells, with primary screens capped between 860px and 1480px and collapsing to one column at 600px.

## 5. Components

### Buttons
- **Structure**: native `button` with text and optional decorative SVG.
- **Variants**: `.btn-pri`, `.btn-sec`, `.cat-btn`, `.calc-btn`, `.opt-btn`, `.piano-key`.
- **States**: hover, active, focus-visible, disabled, selected/correct/wrong where applicable.
- **Accessibility**: always native keyboard activation, `type="button"`, visible focus ring, and an accessible name.

### Cards And Status Copy
- **Structure**: bordered surface containing heading, supporting copy, and optional controls.
- **Variants**: study, question, result, statistic, feedback, and review cards.
- **Status**: concise non-blocking messages reuse `.typora-comment`; live operation feedback adds `role="status"` and `aria-live="polite"`.

### Piano Keyboard
- **Structure**: horizontally scrollable `.piano-kb` containing 25 `.piano-key` buttons.
- **States**: white/black default, hover, focus-visible, and active note color.
- **Responsive affordance**: constrained layouts show concise `.typora-comment` guidance for horizontal scrolling; wider layouts remain unchanged.
- **Accessibility**: each key names note and octave; Enter and Space use native button behavior; the keyboard references its scroll guidance with `aria-describedby`.

### Staff Notation
- **Structure**: dependency-free SVG `.staff-score` rendered from declarative `staff` notation data; the primitive owns treble clef, five lines, pitch placement, ledger lines, notes, rests, beams, tuplets, curves, signatures, and barlines.
- **Surfaces**: full question notation uses the existing `.q-image` nested panel; option notation uses compact `.option-notation` panels inside `.opt-btn`; review notation uses a full-row `.review-prompt-notation` card titled `문제 악보` before the two-column selected/correct score cards, with every role rendered independently.
- **Tokens**: score ink inherits `--text`; panels use `--surface-strong`, `--line`, `--radius-sm`, and spacing derived from `--space`. Compact score bounds use `--score-option-max-block` and `--score-review-max-inline`; no score-specific raw color or arbitrary visual spacing is introduced.
- **Engraving**: a beamed group chooses one conventional stem side from its average staff position, draws every note stem directly to the common beam plane, and never retains an opposite standalone stem. Simple-meter eighth notes expose each quarter-note beat as a pair, while 6/8 keeps two groups of three. A declarative tuplet references distinct first/last note IDs, accepts an integer number from 2-9 and optional above/below placement, and renders its centered number with a spanning bracket after note and beam geometry is known. A final barline is exactly one thin line followed by one thick line. Simultaneous chord accidentals occupy leftward columns whenever their vertical glyph boxes would collide, with a clear gap before all noteheads.
- **States**: option-level notation remains inside the button so hover, focus, correct, wrong, and disabled states encompass both score and text.
- **Responsive behavior**: score SVGs use a stable `viewBox` and fluid width. Visual/text option content stacks below 600px and must not create document or button overflow at 360px. Review notation keeps the prompt score full-width and selected/correct scores in two columns above 600px, stacks every card below 600px, uses normal `--text` score contrast, and provides at least 240px rendered score width at 360px.
- **Accessibility**: every staff SVG has `role="img"` and an explicit Korean `aria-label`; option buttons retain a text-based accessible name. Each review score card is a labelled region whose visible title identifies `문제 악보`, `내 답`, or `정답` without duplicating hidden announcements.
- **Print/PDF**: review scores remain vector-only; screen readability takes precedence over the former extra-compact score height while the existing print-safe palette and deterministic review structure remain unchanged.

## 6. Motion & Interaction

Micro-interactions use the existing 100-150ms ease transitions; screen entry uses 320ms `cubic-bezier(.16,1,.3,1)`. Motion is limited to opacity and transform where possible, and all transitions/animations are disabled under `prefers-reduced-motion: reduce`.

## 7. Depth & Surface

The strategy is borders-only. `--shadow` is `none`; tonal surface shifts and one-pixel borders provide hierarchy. PDF rendering temporarily switches to print-safe neutral colors without changing screen design.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA with visible keyboard focus and native controls.
- Dynamic answer and export feedback uses polite live regions.
- PDF export feedback retains `.typora-comment` typography, uses explicit success/failure copy, and colors state through `--success` / `--danger` modifiers.
- Korean study paragraphs, calculator results, and result-review prose preserve words at narrow widths while allowing exceptional long Latin or music tokens to wrap without page overflow.
- Practice attempts are identified in visible result copy, not color alone.
- Statistic cards are informational surfaces, so they do not translate or imply clickability on hover.
- Reduced-motion preferences are respected.
- Staff examples must preserve readable noteheads, ledger lines, and Korean labels at 360px, 768px, and 1280px; notation never replaces the stable text answer.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Legacy inline visual values | `index.html` study renderers and PDF mode | Existing visual contract is explicitly preserved; this task adds no new arbitrary styling | Consolidate only in a separately approved visual-system refactor |
