import {html, svg, css, isServer, nothing} from 'lit';
import {customElement} from 'lit/decorators.js';
import {styleMap} from 'lit/directives/style-map.js';
import {
  AIUXWidgetElement,
  decorators
} from '@servicenow/aiux/aiux-components-core';
import {i18n, locationService} from '@servicenow/aiux/aiux-services';
import '@servicenow/aiux/aiux-components-empty-state-content';

/*
 * The AI Control Tower inventory record page. Kept host-relative on purpose
 * so it resolves against whichever instance the app is served from, rather
 * than pinning the dev instance.
 *
 * browserNavigate rather than navigate: this leaves the current experience,
 * and navigate() would try to resolve the path against this app's own
 * router.
 */
const ASSET_PAGE_PATH = '/aiux/aict/inventory/';

const {name, description, bestFor, chatCompatible, category, server, discoverable} =
  decorators;

/*
 * Geometry for flat-top hexagons, in units where the hex radius (centre to
 * vertex) is 1:
 *   width  = 2          (vertex to vertex, horizontally)
 *   height = √3         (flat edge to flat edge, vertically)
 *   column pitch = 1.5  (hexes overlap horizontally by design)
 *   row pitch    = √3   (hexes stack exactly)
 * Odd columns sit half a row lower, which is what interlocks the grid.
 *
 * Drawing these directly, rather than through a charting library, is what
 * keeps the tiles regular and the gaps even — the geometry below is the
 * whole definition of the shape, with no plot-area or axis-scaling step in
 * between to distort it.
 */
const HEX_HEIGHT = Math.sqrt(3);
const HEX_COLUMN_PITCH = 1.5;
const HEX_ROW_PITCH = HEX_HEIGHT;
// Tiles are drawn a touch inside their cell, and outlined (see `.hex`), so
// neighbours stay distinct even under the hover glow — whose blur would
// otherwise bleed across the gaps and merge a blob into one mass.
const HEX_DRAW_RADIUS = 0.96;
const VIEWBOX_MARGIN = 0.5;

/*
 * Risk is ordered severity, so it uses the reserved status palette in
 * severity order. Matching is case-insensitive on the platform's own choice
 * labels; an empty value counts as undetermined.
 */
const RISK_CATEGORIES = [
  {key: 'High', color: 'var(--color-error, #be0003)'},
  // Medium is an explicit hex rather than --color-warning: this app's theme
  // resolves that token to an olive-gold, which reads brown next to the other
  // two. The token would win over any fallback, so the literal is the only
  // way to land on orange.
  {key: 'Medium', color: '#ef8a17'},
  {key: 'Low', color: 'var(--color-success, #22c55e)'},
  {key: 'To be determined', color: 'var(--color-neutral, #1e293b)'}
];

/*
 * Categorical palette for the non-severity colour modes: blue, orange, aqua,
 * violet, assigned in this fixed order and never cycled.
 *
 * Capped at four deliberately. A hex grid puts arbitrary pairs of categories
 * side by side, so it has to clear the "all pairs" colour-separation gates
 * rather than just adjacent ones, and this set is the largest that does
 * (worst pair: CVD ΔE 9.2, normal-vision ΔE 16.3). Adding a fifth fails hard
 * whatever the ordering — magenta against orange lands at normal-vision ΔE
 * 12.9, under the 15 floor. Anything past the top four therefore folds into
 * a neutral "Other" instead of inventing more hues.
 */
const CATEGORICAL_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7'];
const OTHER_COLOR = '#6b6a66';
const MAX_CATEGORICAL_SLOTS = CATEGORICAL_PALETTE.length;

const COLOR_MODES = [
  {
    key: 'risk',
    field: 'riskClassification',
    label: () => i18n.getMessage('Risk classification'),
    severity: true
  },
  {
    key: 'status',
    field: 'status',
    label: () => i18n.getMessage('Lifecycle status')
  },
  {
    key: 'state',
    field: 'state',
    label: () => i18n.getMessage('Deployment state')
  },
  {
    key: 'department',
    field: 'department',
    label: () => i18n.getMessage('Department')
  }
];

function colorModeFor(key) {
  return COLOR_MODES.find(mode => mode.key === key) || COLOR_MODES[0];
}

/**
 * Works out the legend for a colour mode: which categories exist, what
 * colour each gets, and how to map an asset to one.
 *
 * Always built from the *unfiltered* assets, so toggling a legend entry
 * hides tiles without ever repainting the ones that remain or reshuffling
 * the legend.
 */
function buildColorScheme(assets, mode) {
  const otherKey = i18n.getMessage('Other');
  const unsetKey = mode.severity
    ? 'To be determined'
    : i18n.getMessage('Not set');

  const rawKeyOf = asset => (asset[mode.field] || '').trim() || unsetKey;

  const counts = new Map();
  assets.forEach(asset => {
    const key = rawKeyOf(asset);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let categories;
  let colorByKey;

  if (mode.severity) {
    const canonical = new Map(
      RISK_CATEGORIES.map(category => [category.key.toLowerCase(), category])
    );
    colorByKey = key => canonical.get(key.toLowerCase())?.color ?? OTHER_COLOR;
    const ordered = RISK_CATEGORIES.filter(category => counts.has(category.key));
    const unrecognised = [...counts.keys()].filter(
      key => !canonical.has(key.toLowerCase())
    );
    categories = [
      ...ordered.map(category => ({
        key: category.key,
        color: category.color,
        count: counts.get(category.key)
      })),
      ...(unrecognised.length
        ? [
            {
              key: otherKey,
              color: OTHER_COLOR,
              count: unrecognised.reduce((sum, key) => sum + counts.get(key), 0)
            }
          ]
        : [])
    ];
  } else {
    // Rank by count so the biggest categories get the distinct colours, with
    // name as a tiebreak so the assignment is deterministic run to run.
    const ranked = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const slotted = ranked.slice(0, MAX_CATEGORICAL_SLOTS);
    const folded = ranked.slice(MAX_CATEGORICAL_SLOTS);
    const paletteByKey = new Map(
      slotted.map(([key], index) => [key, CATEGORICAL_PALETTE[index]])
    );
    colorByKey = key => paletteByKey.get(key) ?? OTHER_COLOR;
    categories = [
      ...slotted.map(([key, count]) => ({key, color: paletteByKey.get(key), count})),
      ...(folded.length
        ? [
            {
              key: otherKey,
              color: OTHER_COLOR,
              count: folded.reduce((sum, [, count]) => sum + count, 0)
            }
          ]
        : [])
    ];
  }

  const categoryKeys = new Set(categories.map(category => category.key));
  const keyForAsset = asset => {
    const key = rawKeyOf(asset);
    return categoryKeys.has(key) ? key : otherKey;
  };

  return {categories, keyForAsset, colorForAsset: asset => colorByKey(rawKeyOf(asset))};
}

// Separation between groups, in grid columns/rows.
const BLOCK_GAP = 2;
// Used until the container has been measured.
const FALLBACK_TARGET_ASPECT = 1.9;

function groupAssets(assets) {
  const groups = new Map();
  assets.forEach(asset => {
    const key = asset.sourceSystem || i18n.getMessage('Unknown source');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  });
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

function hexCentre(col, row) {
  return {
    x: col * HEX_COLUMN_PITCH,
    y: row * HEX_ROW_PITCH + (Math.abs(col % 2) === 1 ? HEX_ROW_PITCH / 2 : 0)
  };
}

function hexPolygonPoints(centreX, centreY) {
  const points = [];
  for (let corner = 0; corner < 6; corner++) {
    const angle = (Math.PI / 3) * corner;
    points.push(
      `${(centreX + HEX_DRAW_RADIUS * Math.cos(angle)).toFixed(3)},` +
        `${(centreY + HEX_DRAW_RADIUS * Math.sin(angle)).toFixed(3)}`
    );
  }
  return points.join(' ');
}

/**
 * Chooses `count` grid cells forming a round, organic cluster — the closest
 * `count` cells to the centre by true hex geometry — instead of filling a
 * rectangle row by row. Cells are normalised so the minimum col/row is 0;
 * `columns`/`rows` give the bounding box used to space this blob from its
 * neighbours, not its actual outline.
 */
function computeBlobShape(count) {
  const searchRadius = Math.ceil(Math.sqrt(count)) + 2;
  const candidates = [];
  for (let col = -searchRadius; col <= searchRadius; col++) {
    for (let row = -searchRadius; row <= searchRadius; row++) {
      const {x, y} = hexCentre(col, row);
      candidates.push({col, row, distance: Math.hypot(x, y)});
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const chosen = candidates.slice(0, count);

  const minCol = Math.min(...chosen.map(c => c.col));
  const minRow = Math.min(...chosen.map(c => c.row));
  const cells = chosen.map(c => ({col: c.col - minCol, row: c.row - minRow}));

  return {
    cells,
    columns: Math.max(...cells.map(c => c.col)) + 1,
    rows: Math.max(...cells.map(c => c.row)) + 1
  };
}

function blocksOverlap(a, b, gap) {
  return !(
    a.colOffset + a.columns + gap <= b.colOffset ||
    b.colOffset + b.columns + gap <= a.colOffset ||
    a.rowOffset + a.rows + gap <= b.rowOffset ||
    b.rowOffset + b.rows + gap <= a.rowOffset
  );
}

function envelopeOf(blocks) {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  blocks.forEach(block => {
    minCol = Math.min(minCol, block.colOffset);
    maxCol = Math.max(maxCol, block.colOffset + block.columns);
    minRow = Math.min(minRow, block.rowOffset);
    maxRow = Math.max(maxRow, block.rowOffset + block.rows);
  });
  return {minCol, maxCol, minRow, maxRow};
}

/**
 * How badly a prospective arrangement wastes the available box, lower being
 * better. The grid is ultimately fitted by
 * `min(boxWidth / gridWidth, boxHeight / gridHeight)`, so whichever
 * dimension runs out first caps how big the hexagons end up. Minimising
 * `max(gridWidth / targetAspect, gridHeight)` therefore maximises that fit
 * directly — it spreads the groups into whatever overall shape matches the
 * box, instead of clumping into a square and leaving wide margins.
 */
function arrangementCost(placed, candidate, targetAspect) {
  const {minCol, maxCol, minRow, maxRow} = envelopeOf([...placed, candidate]);
  const gridWidth = (maxCol - minCol) * HEX_COLUMN_PITCH;
  const gridHeight = (maxRow - minRow) * HEX_ROW_PITCH;
  return Math.max(gridWidth / targetAspect, gridHeight);
}

/**
 * Places each group's blob: largest first at the centre, then each smaller
 * group at whichever free position leaves the arrangement best matched to
 * `targetAspect`.
 *
 * Every position where a block could touch the current envelope is
 * evaluated, rather than walking outwards and taking the first fit — an
 * outward walk reaches a big block's vertical clearance at a smaller radius
 * than its horizontal one, so it kept stacking groups and never offered the
 * side-by-side positions that fill a wide box.
 */
function packGroups(sortedGroups, targetAspect) {
  const placed = [];

  sortedGroups.forEach(([sourceSystem, items], index) => {
    const {cells, columns, rows} = computeBlobShape(items.length);

    if (index === 0) {
      placed.push({
        sourceSystem,
        items,
        cells,
        columns,
        rows,
        colOffset: -Math.floor(columns / 2),
        rowOffset: -Math.floor(rows / 2)
      });
      return;
    }

    const envelope = envelopeOf(placed);
    const colFrom = envelope.minCol - columns - BLOCK_GAP;
    const colTo = envelope.maxCol + BLOCK_GAP;
    const rowFrom = envelope.minRow - rows - BLOCK_GAP;
    const rowTo = envelope.maxRow + BLOCK_GAP;

    let best = null;
    for (let colOffset = colFrom; colOffset <= colTo; colOffset++) {
      for (let rowOffset = rowFrom; rowOffset <= rowTo; rowOffset++) {
        const candidate = {colOffset, rowOffset, columns, rows};
        if (placed.some(block => blocksOverlap(candidate, block, BLOCK_GAP))) continue;

        const cost = arrangementCost(placed, candidate, targetAspect);
        // Ties are common — plenty of positions leave the envelope
        // unchanged — so fall back to whichever sits nearest the middle,
        // keeping the cluster tight rather than scattered.
        const centreDistance = Math.hypot(
          (colOffset + columns / 2) * HEX_COLUMN_PITCH,
          (rowOffset + rows / 2) * HEX_ROW_PITCH
        );
        if (
          !best ||
          cost < best.cost - 0.001 ||
          (cost < best.cost + 0.001 && centreDistance < best.centreDistance)
        ) {
          best = {colOffset, rowOffset, cost, centreDistance};
        }
      }
    }

    placed.push({
      sourceSystem,
      items,
      cells,
      columns,
      rows,
      colOffset: best.colOffset,
      rowOffset: best.rowOffset
    });
  });

  return placed;
}

/**
 * Turns assets into ready-to-render blobs plus the viewBox that frames them.
 * When `focusedSystem` is set only that group is laid out (the "drill in"
 * view); `groupSummaries` always covers every system so the panel can offer
 * a way back out.
 */
function buildHoneycombData(assets, focusedSystem, targetAspect, colorScheme) {
  const allGroups = groupAssets(assets);
  const groupsToRender = focusedSystem
    ? allGroups.filter(([sourceSystem]) => sourceSystem === focusedSystem)
    : allGroups;

  const placed = packGroups(groupsToRender, targetAspect || FALLBACK_TARGET_ASPECT);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // Flat index assigned here so the delegated pointer handler can resolve a
  // tile element back to its asset, without the ordering of Lit's template
  // evaluation having to line up with a separately-built lookup array.
  let hexIndex = 0;
  const blobs = placed.map(group => ({
    sourceSystem: group.sourceSystem,
    count: group.items.length,
    hexes: group.items.map((asset, i) => {
      const cell = group.cells[i];
      const {x, y} = hexCentre(group.colOffset + cell.col, group.rowOffset + cell.row);
      minX = Math.min(minX, x - 1);
      maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y - HEX_HEIGHT / 2);
      maxY = Math.max(maxY, y + HEX_HEIGHT / 2);
      return {
        index: hexIndex++,
        asset,
        sourceSystem: group.sourceSystem,
        points: hexPolygonPoints(x, y),
        color: colorScheme.colorForAsset(asset)
      };
    })
  }));

  const viewBox = [
    minX - VIEWBOX_MARGIN,
    minY - VIEWBOX_MARGIN,
    maxX - minX + VIEWBOX_MARGIN * 2,
    maxY - minY + VIEWBOX_MARGIN * 2
  ]
    .map(value => value.toFixed(2))
    .join(' ');

  const groupSummaries = allGroups.map(([sourceSystem, items]) => ({
    sourceSystem,
    count: items.length
  }));

  return {blobs, groupSummaries, viewBox};
}

@customElement('aiux-ai-asset-honeycomb')
@discoverable(true)
@name('AI Asset Honeycomb')
@description(
  'Displays managed AI assets from the AI Control Tower asset inventory as a honeycomb grid, grouped by source system and colored by risk classification.'
)
@bestFor(
  'Showcasing the full inventory of managed AI assets on a dashboard or home page, with visual grouping by source system and risk-based color coding.'
)
@chatCompatible(false)
@category('custom')
@server('./server-script.js')
export default class AIAssetHoneycomb extends AIUXWidgetElement {
  static properties = {
    _focusedSystem: {type: String, state: true},
    _hoveredSystem: {type: String, state: true},
    _hoveredHex: {type: Object, state: true},
    _viewportAspect: {type: Number, state: true},
    _colorMode: {type: String, state: true},
    _hiddenCategories: {type: Object, state: true}
  };

  /*
   * Layout lives in plain CSS rather than Tailwind utilities on purpose:
   * this structure built with `lg:` variants rendered completely unstyled,
   * and the panel's `max-h-40` was silently ignored too, so those classes
   * evidently aren't all reaching this shadow root's stylesheet. Rules in
   * `static styles` always do.
   */
  static styles = css`
    :host {
      display: block;
    }

    .honeycomb-layout {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 1rem;
    }

    /*
     * The grid area claims whatever width is left once the fixed-width panel
     * has taken its share, so the browser works out the available space
     * through normal layout. min-width: 0 is required — flex items default
     * to min-width: auto and would refuse to shrink below their content.
     */
    .grid-area {
      position: relative;
      flex: 1 1 0;
      min-width: 0;
      height: 34rem;
    }

    /*
     * viewBox plus preserveAspectRatio does all the fitting: the grid scales
     * uniformly to fit and centres itself, with the hexagons staying regular
     * because both axes scale by the same factor. This is what replaced a
     * pile of JS measuring and transform correction.
     */
    .hex-grid {
      display: block;
      width: 100%;
      height: 100%;
    }

    /*
     * The outline keeps tiles legible as individual hexagons under the hover
     * glow, whose blur otherwise fills the gaps between them. It is part of
     * SourceGraphic, which the glow filter composites on top of the blurred
     * copies, so it stays crisp.
     *
     * non-scaling-stroke is deliberate: the viewBox scale swings wildly
     * between the full grid and a drilled-into single group, and a scaling
     * stroke would go from hairline to tens of pixels thick across that
     * range.
     */
    .hex {
      stroke: var(--color-base-100, #fff);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
    }

    .hex-tooltip-hint {
      display: block;
      margin-top: 0.375rem;
      padding-top: 0.375rem;
      border-top: 1px solid rgb(255 255 255 / 20%);
      opacity: 0.8;
    }

    /*
     * Controls sit in one row above the content they scope. Colour mode on
     * the left, the legend — which doubles as the category filter — on the
     * right.
     */
    .controls-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .control-field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
    }

    .control-label {
      color: var(--color-text-secondary, #4d4c4a);
    }

    .control-select {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--color-base-300, #e5e7eb);
      border-radius: 0.375rem;
      background: var(--color-base-100, #fff);
      color: var(--color-text-primary, #000);
      font: inherit;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.1875rem 0.5rem;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--color-text-secondary, #4d4c4a);
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .legend-item:hover {
      background: var(--color-base-200, #f2f2f2);
    }

    /* Hidden categories stay readable — dimmed with a hollow swatch, so the
       filter state is legible without relying on colour alone. */
    .legend-item--off {
      opacity: 0.55;
    }

    .legend-item--off span:not(.legend-swatch) {
      text-decoration: line-through;
    }

    .legend-swatch {
      width: 0.625rem;
      height: 0.625rem;
      border: 2px solid transparent;
      border-radius: 999px;
      background: transparent;
    }

    .legend-count {
      font-variant-numeric: tabular-nums;
      opacity: 0.7;
    }

    .blob {
      transition: opacity 150ms linear;
    }

    /* Highlighting a system dims the rest so the correlation is obvious. */
    .hex-grid--highlighting .blob {
      opacity: 0.15;
    }

    .hex-grid--highlighting .blob--active {
      opacity: 1;
      filter: url(#blob-glow);
    }

    @media (prefers-reduced-motion: reduce) {
      .blob {
        transition: none;
      }
    }

    .honeycomb-side-panel {
      flex: 0 0 14rem;
      width: 14rem;
    }

    /*
     * Spelled out here rather than left to utility classes for the reason
     * above — the previous max-h-40 / max-w-xs / truncate never applied, so
     * the panel grew unbounded and long names could overflow.
     */
    .group-list {
      max-height: 34rem;
      overflow-y: auto;
    }

    .group-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /*
     * Mirrors the blob highlight back onto the panel row, so hovering a blob
     * points out its system just as hovering a system lights up its blob.
     * Scoped via .group-list to outclass the single-class DaisyUI button
     * rules rather than resorting to !important.
     */
    .group-list .group-button--highlighted {
      background-color: var(--color-base-200, #f2f2f2);
    }

    .group-list .group-button--highlighted .group-name {
      font-weight: 700;
    }

    .hex-tooltip {
      position: absolute;
      z-index: 20;
      max-width: 18rem;
      padding: 0.5rem 0.625rem;
      border-radius: 0.375rem;
      background: var(--color-neutral, #1e293b);
      color: var(--color-neutral-content, #fff);
      font-size: 0.75rem;
      line-height: 1.35;
      pointer-events: none;
      box-shadow: 0 4px 12px rgb(0 0 0 / 25%);
    }

    .hex-tooltip dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.125rem 0.5rem;
      margin: 0.375rem 0 0;
    }

    .hex-tooltip dt {
      opacity: 0.7;
    }

    .hex-tooltip dd {
      margin: 0;
    }

    /* Reflow (WCAG 1.4.10): stack rather than squeeze on narrow viewports. */
    @media (max-width: 60rem) {
      .honeycomb-layout {
        flex-direction: column;
      }

      .honeycomb-side-panel {
        flex: 1 1 auto;
        width: 100%;
      }
    }
  `;

  constructor() {
    super();
    this._focusedSystem = null;
    this._hoveredSystem = null;
    this._hoveredHex = null;
    this._viewportAspect = FALLBACK_TARGET_ASPECT;
    this._colorMode = COLOR_MODES[0].key;
    this._hiddenCategories = new Set();
    this._resizeObserver = null;
    this._renderedHexes = [];
  }

  _handleColorModeChange(event) {
    this._colorMode = event.target.value;
    // The categories are entirely different per mode, so carrying hidden
    // ones across would silently filter by something no longer on screen.
    this._hiddenCategories = new Set();
  }

  _handleCategoryToggle(categoryKey) {
    const next = new Set(this._hiddenCategories);
    if (next.has(categoryKey)) {
      next.delete(categoryKey);
    } else {
      next.add(categoryKey);
    }
    // Reassigned rather than mutated — Lit compares by identity.
    this._hiddenCategories = next;
  }

  _resetCategoryFilter() {
    this._hiddenCategories = new Set();
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (isServer) return;
    // The grid area only exists once data has loaded and _renderHoneycomb()
    // runs, so the observer is (re-)attached on every update rather than
    // once in firstUpdated(). Re-observing an already-observed element is a
    // no-op per the ResizeObserver spec.
    if (!this._resizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._measureViewportAspect());
    }
    const gridArea = this.renderRoot.querySelector('.grid-area');
    if (gridArea) this._resizeObserver.observe(gridArea);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  /**
   * Feeds the box's shape into the packing so the groups spread to match it.
   * Both dimensions come from CSS — flex width and a fixed height — and not
   * from the grid's content, so this can't feed back on itself; rounding
   * keeps sub-pixel jitter from causing pointless re-layouts.
   */
  _measureViewportAspect() {
    const gridArea = this.renderRoot.querySelector('.grid-area');
    if (!gridArea?.clientWidth || !gridArea.clientHeight) return;
    const aspect =
      Math.round((gridArea.clientWidth / gridArea.clientHeight) * 100) / 100;
    if (aspect !== this._viewportAspect) this._viewportAspect = aspect;
  }

  render() {
    // `this.data` is populated automatically by AIUXWidgetElement — from SSR
    // server-script data when available, otherwise via a client-side fetch
    // kicked off in its own connectedCallback(). Reading it directly (rather
    // than re-fetching in a custom connectedCallback override) keeps the
    // server-rendered markup and the first client render identical, which
    // Lit's hydration requires.
    const {
      isError,
      errorMessage,
      assets = [],
      isMockData,
      hasMore,
      totalAvailable
    } = this.data || {};

    return html`
      <div class="aiux-card bg-base-100 shadow-sm h-full">
        <div class="aiux-card-body p-6 gap-4">
          ${this._renderHeader(isMockData, {hasMore, totalAvailable, shown: assets.length})}
          <div role="status" class="sr-only">
            ${this._statusMessage({isError, assets})}
          </div>
          ${this.data === undefined
            ? this._renderSkeleton()
            : isError
              ? this._renderError(errorMessage)
              : !assets.length
                ? this._renderEmptyState()
                : this._renderHoneycomb(assets)}
        </div>
      </div>
    `;
  }

  _statusMessage({isError, assets}) {
    if (this.data === undefined) return i18n.getMessage('Loading AI asset inventory…');
    if (isError || !assets?.length) return '';
    const sourceSystemCount = new Set(assets.map(a => a.sourceSystem)).size;
    return i18n.getMessage('Showing {0} managed AI assets across {1} source systems.', [
      assets.length,
      sourceSystemCount
    ]);
  }

  _renderHeader(isMockData, truncation) {
    return html`
      <div class="flex flex-col gap-1">
        <p class="font-mono text-xs uppercase tracking-wide text-primary-900">
          ${i18n.getMessage('AI Control Tower')}
        </p>
        <h2 class="text-2xl font-bold text-text-primary break-words max-w-full">
          ${i18n.getMessage('Managed AI asset inventory')}
        </h2>
        <p class="text-sm text-text-secondary break-words max-w-full">
          ${i18n.getMessage(
            'Every governed asset, grouped by the system it runs in and colored by risk classification.'
          )}
        </p>
        ${isMockData
          ? html`
              <div class="aiux-alert aiux-alert-info aiux-alert-soft mt-1">
                <span>
                  ${i18n.getMessage(
                    'No governed assets were found on this instance yet — showing generated sample data for preview.'
                  )}
                </span>
              </div>
            `
          : nothing}
        ${truncation?.hasMore
          ? html`
              <div role="status" class="aiux-alert aiux-alert-warning aiux-alert-soft mt-1">
                <span>
                  ${i18n.getMessage(
                    'Showing {0} of {1} assets. The rest are not included, so the distribution below is a partial view.',
                    [truncation.shown, truncation.totalAvailable]
                  )}
                </span>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  _renderSkeleton() {
    return html`
      <div class="flex flex-col gap-2" aria-hidden="true">
        <div class="aiux-skeleton h-6 w-1/3 rounded"></div>
        ${Array(6)
          .fill(0)
          .map(() => html`<div class="aiux-skeleton h-8 w-full rounded"></div>`)}
      </div>
    `;
  }

  _renderError(errorMessage) {
    return html`
      <div role="alert" class="aiux-alert aiux-alert-error aiux-alert-soft">
        <span>${errorMessage}</span>
        <button
          class="aiux-btn aiux-btn-sm aiux-btn-ghost"
          @click=${() => this.server.update()}
        >
          ${i18n.getMessage('Retry')}
        </button>
      </div>
    `;
  }

  _renderEmptyState() {
    return html`
      <aiux-empty-state-content
        heading-text=${i18n.getMessage('No managed AI assets found')}
        body-text=${i18n.getMessage(
          'Once assets are registered in the AI Control Tower, they will appear here.'
        )}
        icon="hexagon-outline"
      ></aiux-empty-state-content>
    `;
  }

  _handleGroupClick(sourceSystem) {
    this._focusedSystem = this._focusedSystem === sourceSystem ? null : sourceSystem;
  }

  _handleGroupHover(sourceSystem) {
    this._hoveredSystem = sourceSystem;
  }

  // One delegated handler rather than listeners on every tile — there can be
  // several hundred. State is only touched when the tile under the cursor
  // actually changes, so moving within a tile (or over empty space) doesn't
  // re-render the whole grid on every pointer event. The tooltip is anchored
  // to the tile rather than the cursor for the same reason.
  _handleGridPointerMove(event) {
    const tile = event.target.closest?.('[data-hex-index]');
    if (!tile) {
      this._clearHexHover();
      return;
    }
    const index = Number(tile.dataset.hexIndex);
    if (this._hoveredHex?.index === index) return;

    const hex = this._renderedHexes[index];
    if (!hex) return;

    const bounds = this.renderRoot.querySelector('.grid-area').getBoundingClientRect();
    const tileBounds = tile.getBoundingClientRect();
    this._hoveredHex = {
      index,
      asset: hex.asset,
      x: tileBounds.left + tileBounds.width / 2 - bounds.left,
      y: tileBounds.top + tileBounds.height / 2 - bounds.top
    };
    this._hoveredSystem = hex.sourceSystem;
  }

  _clearHexHover() {
    if (!this._hoveredHex && !this._hoveredSystem) return;
    this._hoveredHex = null;
    this._hoveredSystem = null;
  }

  /**
   * A tile click means "drill in" at the overview level and "open this
   * asset" once drilled in — so the grid mirrors the panel's behaviour on
   * the way in, then becomes a way through to the record.
   */
  _handleGridClick(event) {
    const tile = event.target.closest?.('[data-hex-index]');
    if (!tile) return;
    const hex = this._renderedHexes[Number(tile.dataset.hexIndex)];
    if (!hex) return;

    if (!this._focusedSystem) {
      this._focusedSystem = hex.sourceSystem;
      // The blobs repack on drill-in, so the tile under the cursor is about
      // to be a different asset — a stale tooltip would be misleading.
      this._clearHexHover();
      return;
    }

    if (hex.asset.sysId) {
      locationService.browserNavigate(`${ASSET_PAGE_PATH}${hex.asset.sysId}`);
    }
  }

  _renderGroupIndex(groupSummaries, focusedSystem) {
    return html`
      <div
        class="group-list flex flex-col gap-1 rounded-lg bg-base-100 p-2 shadow-lg"
        @mouseleave=${() => this._handleGroupHover(null)}
      >
        ${focusedSystem
          ? html`
              <button
                type="button"
                class="aiux-btn aiux-btn-ghost aiux-btn-sm justify-start"
                @click=${() => this._handleGroupClick(focusedSystem)}
              >
                ← ${i18n.getMessage('All systems')}
              </button>
            `
          : nothing}
        ${groupSummaries.map(
          group => html`
            <button
              type="button"
              class=${classForGroupButton(
                group.sourceSystem === focusedSystem,
                group.sourceSystem === this._hoveredSystem
              )}
              aria-pressed=${group.sourceSystem === focusedSystem}
              @click=${() => this._handleGroupClick(group.sourceSystem)}
              @mouseenter=${() => this._handleGroupHover(group.sourceSystem)}
              @focus=${() => this._handleGroupHover(group.sourceSystem)}
              @blur=${() => this._handleGroupHover(null)}
            >
              <span class="group-name">${group.sourceSystem}</span>
              <span class="opacity-70">${group.count}</span>
            </button>
          `
        )}
      </div>
    `;
  }

  _renderTooltip() {
    if (!this._hoveredHex) return nothing;
    const {asset, x, y} = this._hoveredHex;
    const rows = [
      [i18n.getMessage('Source system'), asset.sourceSystem || i18n.getMessage('Unknown source')],
      [i18n.getMessage('Department'), asset.department || i18n.getMessage('Not set')],
      [i18n.getMessage('Risk classification'), asset.riskClassification || i18n.getMessage('To be determined')],
      [i18n.getMessage('Inherent risk'), asset.inherentRisk || i18n.getMessage('Not scored')],
      [i18n.getMessage('State'), asset.state || i18n.getMessage('Not set')],
      [i18n.getMessage('Status'), asset.status || i18n.getMessage('Not set')]
    ];

    // Offset from the cursor, and flipped back inside the box near the edges.
    return html`
      <div
        class="hex-tooltip"
        style=${styleMap({
          left: `${x > 220 ? x - 200 : x + 14}px`,
          top: `${y > 200 ? y - 150 : y + 14}px`
        })}
      >
        <strong>${asset.name}</strong>
        <dl>
          ${rows.map(
            ([label, value]) => html`
              <dt>${label}</dt>
              <dd>${value}</dd>
            `
          )}
        </dl>
        <span class="hex-tooltip-hint">
          ${this._focusedSystem
            ? asset.sysId
              ? i18n.getMessage('Click to open in AI Control Tower')
              : nothing
            : i18n.getMessage('Click to zoom into this source system')}
        </span>
      </div>
    `;
  }

  _renderControls(mode, colorScheme) {
    return html`
      <div class="controls-row">
        <label class="control-field">
          <span class="control-label">${i18n.getMessage('Color by')}</span>
          <select
            class="control-select"
            .value=${mode.key}
            @change=${this._handleColorModeChange}
          >
            ${COLOR_MODES.map(
              option => html`
                <option value=${option.key} ?selected=${option.key === mode.key}>
                  ${option.label()}
                </option>
              `
            )}
          </select>
        </label>

        <div
          class="legend"
          role="group"
          aria-label=${i18n.getMessage('Filter by {0}', [mode.label()])}
        >
          ${colorScheme.categories.map(category => {
            const hidden = this._hiddenCategories.has(category.key);
            return html`
              <button
                type="button"
                class=${hidden ? 'legend-item legend-item--off' : 'legend-item'}
                aria-pressed=${!hidden}
                @click=${() => this._handleCategoryToggle(category.key)}
              >
                <span
                  class="legend-swatch"
                  style=${styleMap(
                    hidden
                      ? {borderColor: category.color}
                      : {backgroundColor: category.color, borderColor: category.color}
                  )}
                ></span>
                <span>${category.key}</span>
                <span class="legend-count">${category.count}</span>
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  _renderAllFilteredOut() {
    return html`
      <div class="aiux-alert aiux-alert-info aiux-alert-soft">
        <span>
          ${i18n.getMessage('Every category is hidden, so there is nothing to show.')}
        </span>
        <button
          class="aiux-btn aiux-btn-sm aiux-btn-ghost"
          @click=${this._resetCategoryFilter}
        >
          ${i18n.getMessage('Show all')}
        </button>
      </div>
    `;
  }

  _renderHoneycomb(assets) {
    const mode = colorModeFor(this._colorMode);
    // Built from every asset, not the filtered set, so hiding a category
    // neither repaints the remaining tiles nor reorders the legend.
    const colorScheme = buildColorScheme(assets, mode);

    const visibleAssets = this._hiddenCategories.size
      ? assets.filter(asset => !this._hiddenCategories.has(colorScheme.keyForAsset(asset)))
      : assets;

    if (!visibleAssets.length) {
      return html`
        <div class="flex flex-col gap-4">
          ${this._renderControls(mode, colorScheme)} ${this._renderAllFilteredOut()}
        </div>
      `;
    }

    const allGroups = groupAssets(visibleAssets);
    const focusedSystem =
      this._focusedSystem && allGroups.some(([sourceSystem]) => sourceSystem === this._focusedSystem)
        ? this._focusedSystem
        : null;

    const {blobs, groupSummaries, viewBox} = buildHoneycombData(
      visibleAssets,
      focusedSystem,
      this._viewportAspect,
      colorScheme
    );

    // Lookup for the delegated pointer handler, so the asset's fields don't
    // have to be stamped onto every element.
    this._renderedHexes = blobs.flatMap(blob => blob.hexes);

    const highlighting = Boolean(
      this._hoveredSystem && blobs.some(blob => blob.sourceSystem === this._hoveredSystem)
    );

    return html`
      <div class="flex flex-col gap-4">
        ${this._renderControls(mode, colorScheme)}

        <div class="honeycomb-layout">
          <div class="grid-area">
            <svg
              class=${highlighting ? 'hex-grid hex-grid--highlighting' : 'hex-grid'}
              viewBox=${viewBox}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label=${i18n.getMessage(
                '{0} managed AI assets across {1} source systems, colored by risk classification.',
                [this._renderedHexes.length, groupSummaries.length]
              )}
              @pointermove=${this._handleGridPointerMove}
              @pointerleave=${this._clearHexHover}
              @click=${this._handleGridClick}
            >
              <defs>
                <filter id="blob-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.4" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              ${
                /*
                 * `svg` rather than `html` for these nested templates: Lit
                 * parses each template literal on its own with an HTML
                 * parser, so <g>/<polygon> written in an `html` template get
                 * created in the HTML namespace instead of the SVG one and
                 * render nothing at all. Only the template whose root nodes
                 * are SVG elements needs this — the outer one holding the
                 * <svg> element itself stays `html`.
                 */
                blobs.map(
                  blob => svg`
                  <g
                    class=${blob.sourceSystem === this._hoveredSystem
                      ? 'blob blob--active'
                      : 'blob'}
                  >
                    ${blob.hexes.map(
                      hex => svg`
                        <polygon
                          class="hex"
                          fill=${hex.color}
                          points=${hex.points}
                          data-hex-index=${hex.index}
                        />
                      `
                    )}
                  </g>
                `
                )
              }
            </svg>
            ${this._renderTooltip()}
          </div>

          <div class="honeycomb-side-panel">
            ${this._renderGroupIndex(groupSummaries, focusedSystem)}
          </div>
        </div>
      </div>
    `;
  }
}

function classForGroupButton(isActive, isHighlighted) {
  return [
    'aiux-btn aiux-btn-sm justify-between gap-2',
    isActive ? 'aiux-btn-primary' : 'aiux-btn-ghost',
    isHighlighted && !isActive ? 'group-button--highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ');
}
