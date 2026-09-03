import {
  DEFAULT_OBSERVATION_MODE,
  DEFAULT_OBSERVATION_SENSES,
  DEFAULT_FILTER_MODE,
  DEFAULT_SAMPLING_MODE,
  DEFAULT_SAMPLING_RULE,
  FILTER_MODES,
  FLAGS,
  LEGACY_SEE_INVISIBILITY_SENSES,
  LEGACY_SIGHT_SENSES,
  LEGACY_TRUESIGHT_MODE,
  MODULE_ID,
  OBSERVATION_MODES,
  SIGHT_FORMS,
  SIGHT_FORM_OPTIONS
} from "./constants.mjs";
import {
  getFadeDuration,
  getFilterMode,
  getMemoryTiles,
  getVisibilityMemoryEnabled,
  setMemoryTiles
} from "./settings.mjs";

const TILE_REFRESH_PATCH = Symbol.for(`${MODULE_ID}.Tile.refreshVisibilityPatch`);
const TOKEN_REFRESH_PATCH = Symbol.for(`${MODULE_ID}.Token.refreshVisibilityPatch`);
const VISIBILITY_REFRESH_DELAY_MS = 25;
const TILE_REFRESH_VISIBILITY_PATH = "foundry.canvas.placeables.Tile.prototype._refreshVisibility";
const TOKEN_REFRESH_VISIBILITY_PATH = "foundry.canvas.placeables.Token.prototype._refreshVisibility";
const INVISIBILITY_DETECTION_MODE_IDS = new Set(["seeInvisibility", "senseInvisibility"]);
const TRUE_SIGHT_DETECTION_MODE_IDS = new Set(["seeAll", "senseAll"]);
const DARKVISION_DETECTION_MODE_IDS = new Set(["darkvision"]);
const DEVILS_SIGHT_DETECTION_MODE_IDS = new Set(["devilsSight", "devilsSight5e"]);
const BLINDSIGHT_DETECTION_MODE_IDS = new Set(["blindsight"]);
const TREMORSENSE_DETECTION_MODE_IDS = new Set(["tremorsense"]);
const THERMAL_VISION_DETECTION_MODE_IDS = new Set(["thermalVision", "thermal"]);
const SEE_INVISIBILITY_EFFECT_NAMES = new Set(["see invisibility", "see-invisibility", "seeinvisibility"]);
const DEVILS_SIGHT_EFFECT_NAMES = new Set(["devil's sight", "devils sight", "devil-s-sight", "devils-sight", "devilssight"]);
const THERMAL_VISION_EFFECT_NAMES = new Set(["thermal vision", "thermal-vision", "thermalvision"]);
const MIN_SHAPE_SAMPLE_COUNT = 3;
const MAX_SHAPE_SAMPLE_COUNT = 7;

let coreTileVisibility = new WeakMap();
let coreTokenVisibility = new WeakMap();
let activeTileFades = new WeakMap();
let desiredTileVisibility = new WeakMap();
let tileFilterState = new WeakMap();
let loggedLegacyCollisionFallback = false;
let loggedPublicDetectionFailure = false;
let loggedNativeTokenPointsFailure = false;
let loggedShapeContainsFailure = false;
let loggedShapeTestFailure = false;
let previewTokenUuid = null;
let observedTileMemory = new Set();
let observedTileMemoryLoaded = false;

const persistObservedMemory = foundry.utils.debounce(() => {
  void saveObservedMemory();
}, 250);

const refreshObservedTiles = foundry.utils.debounce(() => {
  if ( !canvas?.ready ) return;
  for ( const tile of canvas.tiles?.placeables ?? [] ) syncTileObservation(tile);
}, VISIBILITY_REFRESH_DELAY_MS);

const refreshObservedTokens = foundry.utils.debounce(() => {
  if ( !canvas?.ready ) return;
  for ( const token of canvas.tokens?.placeables ?? [] ) {
    token.renderFlags?.set?.({refreshVisibility: true});
  }
}, VISIBILITY_REFRESH_DELAY_MS);

export function registerVisibilityHooks() {
  patchTileRefreshVisibility();
  patchTokenRefreshVisibility();

  Hooks.on("canvasReady", () => {
    rememberCoreVisibilityForAllTiles();
    requestTileObservationRefresh();
  });
  Hooks.on("canvasTearDown", () => {
    coreTileVisibility = new WeakMap();
    coreTokenVisibility = new WeakMap();
    activeTileFades = new WeakMap();
    desiredTileVisibility = new WeakMap();
    tileFilterState = new WeakMap();
  });
  Hooks.once("ready", loadObservedMemory);
  Hooks.on("visibilityRefresh", requestTileObservationRefresh);
  Hooks.on("sightRefresh", requestTileObservationRefresh);
  Hooks.on("controlToken", requestTileObservationRefresh);
  Hooks.on("createToken", requestTileObservationRefresh);
  Hooks.on("updateToken", requestTileObservationRefresh);
  Hooks.on("deleteToken", requestTileObservationRefresh);
  Hooks.on("updateActor", requestTileObservationRefresh);
  Hooks.on("createActiveEffect", requestTileObservationRefresh);
  Hooks.on("updateActiveEffect", requestTileObservationRefresh);
  Hooks.on("deleteActiveEffect", requestTileObservationRefresh);
  Hooks.on("createTile", onTileChange);
  Hooks.on("updateTile", onTileChange);
  Hooks.on("deleteTile", requestTileObservationRefresh);
  Hooks.on("drawTile", syncTileObservation);
  Hooks.on("refreshTile", syncTileObservation);
  Hooks.on("drawToken", syncTokenPreviewVisibility);
  Hooks.on("refreshToken", syncTokenPreviewVisibility);
}

export function requestTileObservationRefresh() {
  refreshObservedTiles();
  refreshObservedTokens();
}

export function getTileObservationMode(tileDocument) {
  const mode = tileDocument?.getFlag(MODULE_ID, FLAGS.observationMode);
  if ( mode === LEGACY_TRUESIGHT_MODE ) return OBSERVATION_MODES.senses;
  if ( mode === OBSERVATION_MODES.sight ) return OBSERVATION_MODES.senses;
  if ( mode === OBSERVATION_MODES.seeInvisibility ) return OBSERVATION_MODES.senses;
  return [OBSERVATION_MODES.always, OBSERVATION_MODES.senses].includes(mode) ? mode : DEFAULT_OBSERVATION_MODE;
}

export function syncTileObservation(tile) {
  if ( !tile?.document || tile.destroyed ) return;

  const coreVisible = getCoreTileVisibility(tile);
  const observable = isTileObservable(tile);
  const remembered = isTileRemembered(tile);
  const visible = coreVisible && (observable || remembered);
  if ( coreVisible && observable ) rememberObservedTile(tile);
  applyTileVisibility(tile, visible, {filtered: visible && shouldApplyRevealFilter(tile)});
}

export function getTileObservationDiagnostics(tile) {
  if ( !tile?.document || tile.destroyed ) return null;

  const mode = getTileObservationMode(tile?.document);
  const coreVisible = getCoreTileVisibility(tile);
  const points = getTileTestPoints(tile);
  const samplingRule = getTileSamplingRule(tile.document);
  const samplingMode = getTileSamplingMode(tile.document);
  const senses = getTileObservationSenses(tile.document);
  const remembered = isTileRemembered(tile);
  const diagnostics = {
    mode,
    coreVisible,
    finalVisible: coreVisible,
    observable: true,
    pointCount: points.length,
    observedPointCount: points.length,
    remembered,
    filterMode: getTileFilterMode(tile.document),
    requireLineOfSight: getTileRequireLineOfSight(tile.document),
    requireRange: getTileRequireRange(tile.document),
    samplingMode,
    samplingRule,
    senses,
    sourceCount: 0,
    matchedSources: [],
    matchedSenses: [],
    tags: getTileTags(tile.document),
    summary: game.i18n.localize("TILESIGHT.Diagnostics.Always"),
    details: []
  };

  if ( mode === OBSERVATION_MODES.senses ) return getSensesDiagnostics(tile, points, diagnostics);
  return diagnostics;
}

export function getTileSamplingMode(tileDocument) {
  return DEFAULT_SAMPLING_MODE;
}

export function getTileSamplingRule(tileDocument) {
  return DEFAULT_SAMPLING_RULE;
}

export function getTileRequireLineOfSight(tileDocument) {
  return normalizeBoolean(tileDocument?.getFlag(MODULE_ID, FLAGS.requireLineOfSight), true);
}

export function getTileRequireRange(tileDocument) {
  return normalizeBoolean(tileDocument?.getFlag(MODULE_ID, FLAGS.requireRange), true);
}

export function getTileFilterMode(tileDocument) {
  const mode = tileDocument?.getFlag(MODULE_ID, FLAGS.filterMode);
  if ( Object.values(FILTER_MODES).includes(mode) && mode ) return mode;

  const globalMode = getFilterMode();
  if ( globalMode === FILTER_MODES.none ) return FILTER_MODES.none;
  return Object.values(FILTER_MODES).includes(globalMode) && globalMode ? globalMode : DEFAULT_FILTER_MODE;
}

export function getTileTags(tileDocument) {
  return normalizeTags(tileDocument?.getFlag(MODULE_ID, FLAGS.tags)).map(tag => tag.toLowerCase());
}

export function getTileObservationSenses(tileDocument) {
  const explicit = normalizeSightForms(tileDocument?.getFlag(MODULE_ID, FLAGS.observationSenses));
  if ( explicit.length ) return explicit;

  const mode = tileDocument?.getFlag(MODULE_ID, FLAGS.observationMode);
  if ( mode === OBSERVATION_MODES.sight ) return Array.from(LEGACY_SIGHT_SENSES);
  if ( mode === OBSERVATION_MODES.seeInvisibility || mode === LEGACY_TRUESIGHT_MODE ) {
    return Array.from(LEGACY_SEE_INVISIBILITY_SENSES);
  }

  if ( mode === OBSERVATION_MODES.senses ) return Array.from(DEFAULT_OBSERVATION_SENSES);
  return [];
}

export function previewAsToken(tokenOrDocument) {
  const token = resolveToken(tokenOrDocument);
  previewTokenUuid = token?.document?.uuid ?? null;
  requestTileObservationRefresh();
  return token;
}

export function clearPreview() {
  previewTokenUuid = null;
  requestTileObservationRefresh();
}

export function getPreviewToken() {
  if ( previewTokenUuid ) {
    return canvas?.tokens?.placeables?.find(token => token.document?.uuid === previewTokenUuid) ?? null;
  }

  return getAutoPreviewToken();
}

export function isPreviewActive() {
  return !!getPreviewToken();
}

export function clearVisibilityMemory() {
  observedTileMemory = new Set();
  observedTileMemoryLoaded = true;
  persistObservedMemory();
  requestTileObservationRefresh();
}

export function getObservedTileMemory() {
  loadObservedMemory();
  return Array.from(observedTileMemory);
}

export function getActorSenseRangePixels(actor, sense) {
  const senses = actor?.system?.attributes?.senses ?? {};
  const range = normalizePositiveNumber(senses.ranges?.[sense] ?? senses[sense]);
  const units = senses.units ?? getSceneDistanceUnit();
  const sceneRange = convertDnd5eLength(range, units, getSceneDistanceUnit());

  return {
    range,
    units,
    sceneRange,
    pixels: sceneRange * (canvas.dimensions?.distancePixels ?? 0)
  };
}

function patchTileRefreshVisibility() {
  const prototype = foundry.canvas.placeables?.Tile?.prototype;
  if ( !prototype || prototype[TILE_REFRESH_PATCH] || (typeof prototype._refreshVisibility !== "function") ) return;

  const wrapper = function(wrapped, ...args) {
    const result = wrapped(...args);
    rememberCoreVisibility(this);
    syncTileObservation(this);
    return result;
  };

  if ( globalThis.libWrapper?.register ) {
    try {
      const registrationId = globalThis.libWrapper.register(
        MODULE_ID,
        TILE_REFRESH_VISIBILITY_PATH,
        wrapper,
        globalThis.libWrapper.WRAPPER ?? "WRAPPER",
        {perf_mode: globalThis.libWrapper.PERF_FAST}
      );
      Object.defineProperty(prototype, TILE_REFRESH_PATCH, {value: {type: "libWrapper", registrationId}});
      return;
    } catch(error) {
      console.warn(`${MODULE_ID} | libWrapper registration failed, using direct tile visibility patch`, error);
    }
  }

  const original = prototype._refreshVisibility;
  Object.defineProperty(prototype, TILE_REFRESH_PATCH, {value: {type: "direct", original}});

  prototype._refreshVisibility = function(...args) {
    return wrapper.call(this, original.bind(this), ...args);
  };
}

function patchTokenRefreshVisibility() {
  const prototype = foundry.canvas.placeables?.Token?.prototype;
  if ( !prototype || prototype[TOKEN_REFRESH_PATCH] || (typeof prototype._refreshVisibility !== "function") ) return;

  const wrapper = function(wrapped, ...args) {
    const result = wrapped(...args);
    rememberCoreTokenVisibility(this);
    syncTokenPreviewVisibility(this);
    return result;
  };

  if ( globalThis.libWrapper?.register ) {
    try {
      const registrationId = globalThis.libWrapper.register(
        MODULE_ID,
        TOKEN_REFRESH_VISIBILITY_PATH,
        wrapper,
        globalThis.libWrapper.WRAPPER ?? "WRAPPER",
        {perf_mode: globalThis.libWrapper.PERF_FAST}
      );
      Object.defineProperty(prototype, TOKEN_REFRESH_PATCH, {value: {type: "libWrapper", registrationId}});
      return;
    } catch(error) {
      console.warn(`${MODULE_ID} | libWrapper token visibility registration failed, using direct token visibility patch`, error);
    }
  }

  const original = prototype._refreshVisibility;
  Object.defineProperty(prototype, TOKEN_REFRESH_PATCH, {value: {type: "direct", original}});

  prototype._refreshVisibility = function(...args) {
    return wrapper.call(this, original.bind(this), ...args);
  };
}

function rememberCoreVisibilityForAllTiles() {
  if ( !canvas?.ready ) return;
  for ( const tile of canvas.tiles?.placeables ?? [] ) rememberCoreVisibility(tile);
}

function rememberCoreVisibility(tile) {
  if ( !tile?.document || tile.destroyed ) return;
  coreTileVisibility.set(tile, tile.visible !== false);
}

function getCoreTileVisibility(tile) {
  if ( coreTileVisibility.has(tile) ) return coreTileVisibility.get(tile);
  rememberCoreVisibility(tile);
  return coreTileVisibility.get(tile) ?? (tile.visible !== false);
}

function rememberCoreTokenVisibility(token) {
  if ( !token?.document || token.destroyed ) return;
  coreTokenVisibility.set(token, token.visible !== false);
}

function getCoreTokenVisibility(token) {
  if ( coreTokenVisibility.has(token) ) return coreTokenVisibility.get(token);
  rememberCoreTokenVisibility(token);
  return coreTokenVisibility.get(token) ?? (token.visible !== false);
}

function syncTokenPreviewVisibility(token) {
  if ( !token?.document || token.destroyed || !game.user?.isGM ) return;

  const previewToken = getPreviewToken();
  if ( !previewToken ) return;
  if ( token === previewToken || token.document?.uuid === previewToken.document?.uuid ) return;

  const coreVisible = getCoreTokenVisibility(token);
  const visible = coreVisible && isTokenVisibleToPreview(previewToken, token);
  setTokenRenderState(token, visible);
}

function setTokenRenderState(token, visible) {
  token.visible = visible;
  if ( token.mesh ) token.mesh.visible = visible && token.renderable;
}

function applyTileVisibility(tile, visible, {filtered=false}={}) {
  const filterMode = filtered ? getTileFilterMode(tile.document) : FILTER_MODES.none;
  if ( filtered ) applyTileFilter(tile, filterMode);
  else clearTileFilter(tile);

  const fadeDuration = getFadeDuration();
  const desired = desiredTileVisibility.get(tile);
  if ( desired === visible && activeTileFades.has(tile) ) return;
  desiredTileVisibility.set(tile, visible);

  if ( !fadeDuration ) {
    activeTileFades.delete(tile);
    setTileRenderState(tile, visible, visible ? getTileTargetAlpha(tile) : 0);
    return;
  }

  fadeTileVisibility(tile, visible, fadeDuration);
}

function setTileRenderState(tile, visible, alpha) {
  tile.visible = visible;
  setTileAlpha(tile, alpha);

  if ( tile.mesh ) tile.mesh.visible = visible;
  if ( tile.bg ) tile.bg.visible = visible && tile.layer?.active;
}

function fadeTileVisibility(tile, visible, duration) {
  const token = {};
  const targetAlpha = visible ? getTileTargetAlpha(tile) : 0;
  const startingAlpha = getTileCurrentAlpha(tile, visible ? 0 : getTileTargetAlpha(tile));
  const start = globalThis.performance?.now?.() ?? Date.now();
  activeTileFades.set(tile, token);

  tile.visible = true;
  if ( tile.mesh ) tile.mesh.visible = true;
  if ( tile.bg ) tile.bg.visible = !!tile.layer?.active;

  const tick = () => {
    if ( activeTileFades.get(tile) !== token ) return;

    const now = globalThis.performance?.now?.() ?? Date.now();
    const progress = clamp((now - start) / duration, 0, 1);
    const alpha = startingAlpha + ((targetAlpha - startingAlpha) * progress);
    setTileAlpha(tile, alpha);

    if ( progress < 1 ) {
      requestAnimationFrameSafe(tick);
      return;
    }

    activeTileFades.delete(tile);
    setTileRenderState(tile, visible, targetAlpha);
  };

  requestAnimationFrameSafe(tick);
}

function requestAnimationFrameSafe(callback) {
  if ( typeof globalThis.requestAnimationFrame === "function" ) globalThis.requestAnimationFrame(callback);
  else globalThis.setTimeout(callback, 16);
}

function setTileAlpha(tile, alpha) {
  if ( tile.mesh ) tile.mesh.alpha = alpha;
  if ( tile.bg ) tile.bg.alpha = alpha;
}

function getTileCurrentAlpha(tile, fallback) {
  const alpha = Number(tile.mesh?.alpha ?? tile.bg?.alpha);
  return Number.isFinite(alpha) ? alpha : fallback;
}

function getTileTargetAlpha(tile) {
  const alpha = Number(tile.document.alpha ?? tile.alpha ?? 1);
  return Number.isFinite(alpha) ? alpha : 1;
}

function shouldApplyRevealFilter(tile) {
  if ( getTileObservationMode(tile.document) === OBSERVATION_MODES.always ) return false;
  return getTileFilterMode(tile.document) !== FILTER_MODES.none;
}

function applyTileFilter(tile, mode) {
  if ( mode === FILTER_MODES.none ) {
    clearTileFilter(tile);
    return;
  }

  const target = tile.mesh;
  if ( !target ) return;

  const state = tileFilterState.get(tile);
  if ( state?.mode === mode ) return;
  clearTileFilter(tile);

  const filter = createTileFilter(mode);
  if ( !filter ) return;

  target.filters = [...(target.filters ?? []), filter];
  tileFilterState.set(tile, {filter, mode});
}

function clearTileFilter(tile) {
  const state = tileFilterState.get(tile);
  if ( !state ) return;

  const target = tile.mesh;
  if ( target?.filters ) target.filters = target.filters.filter(filter => filter !== state.filter);
  state.filter.destroy?.();
  tileFilterState.delete(tile);
}

function createTileFilter(mode) {
  if ( mode === FILTER_MODES.spectral ) {
    const invisibilityFilter = createInvisibilityFilter();
    if ( invisibilityFilter ) return invisibilityFilter;
  }

  const ColorMatrixFilterClass = PIXI.ColorMatrixFilter ?? PIXI.filters?.ColorMatrixFilter;
  if ( !ColorMatrixFilterClass ) return null;

  const filter = new ColorMatrixFilterClass();
  applyColorMatrixFilterPreset(filter, mode);
  return filter;
}

function applyColorMatrixFilterPreset(filter, mode) {
  switch ( mode ) {
    case FILTER_MODES.spectral:
      filter.saturate?.(-0.85, false);
      filter.contrast?.(1.25, true);
      filter.brightness?.(1.42, true);
      filter.hue?.(175, true);
      break;
    case FILTER_MODES.ethereal:
      filter.saturate?.(-0.95, false);
      filter.contrast?.(1.18, true);
      filter.brightness?.(1.55, true);
      filter.hue?.(205, true);
      break;
    case FILTER_MODES.arcane:
      filter.saturate?.(0.75, false);
      filter.contrast?.(1.22, true);
      filter.brightness?.(1.32, true);
      filter.hue?.(285, true);
      break;
    case FILTER_MODES.shadow:
      filter.saturate?.(-1, false);
      filter.contrast?.(1.55, true);
      filter.brightness?.(0.55, true);
      break;
    case FILTER_MODES.thermal:
      filter.saturate?.(1, false);
      filter.contrast?.(1.45, true);
      filter.hue?.(25, true);
      filter.brightness?.(1.3, true);
      break;
    case FILTER_MODES.tremor:
      filter.sepia?.(0.8, false);
      filter.saturate?.(-0.45, false);
      filter.contrast?.(1.35, true);
      filter.brightness?.(1.18, true);
      break;
    case FILTER_MODES.monochrome:
      filter.greyscale?.(1, false);
      filter.saturate?.(-1, false);
      filter.contrast?.(1.4, true);
      break;
    default:
      break;
  }
}

function createInvisibilityFilter() {
  const InvisibilityFilterClass = foundry.canvas.rendering?.filters?.InvisibilityFilter;
  if ( !InvisibilityFilterClass ) return null;

  const uniforms = {color: [0.3, 0.95, 1.0]};

  try {
    if ( typeof InvisibilityFilterClass.create === "function" ) {
      return InvisibilityFilterClass.create(uniforms, {});
    }
    return new InvisibilityFilterClass(undefined, undefined, uniforms);
  } catch(error) {
    console.warn(`${MODULE_ID} | Foundry invisibility filter unavailable, using spectral fallback`, error);
    return null;
  }
}

function onTileChange(tileDocument, changed={}) {
  requestTileObservationRefresh();

  if ( tileDocument?.object && isObservationModeChange(changed) ) {
    syncTileObservation(tileDocument.object);
  }
}

function isObservationModeChange(changed) {
  return Object.values(FLAGS).some(flag =>
    foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.${flag}`)
    || (changed.flags?.[MODULE_ID]?.[flag] !== undefined)
  );
}

function isTileObservable(tile) {
  if ( !canvas?.ready || tile.isPreview ) return true;
  if ( game.user.isGM && !isPreviewActive() ) return true;

  switch ( getTileObservationMode(tile.document) ) {
    case OBSERVATION_MODES.senses:
      return isTileVisibleByRevealTags(tile) || isTileVisibleBySelectedSenses(tile);
    case OBSERVATION_MODES.always:
    default:
      return true;
  }
}

function isTileVisibleBySelectedSenses(tile) {
  const points = getTileTestPoints(tile);
  const sources = getActiveVisionSources();
  const senses = getTileObservationSenses(tile.document);
  if ( !senses.length ) return false;

  return testSamplePoints(tile, points, point =>
    sources.some(source => senses.some(sense => canSourceObservePointBySightForm(source, tile, point, sense)))
  );
}

function isTileVisibleByRevealTags(tile) {
  const tileTags = getTileTags(tile.document);
  if ( !tileTags.length ) return false;

  const sources = getActiveVisionSources().filter(source => hasMatchingRevealTags(source, tileTags));
  if ( !sources.length ) return false;

  const points = getTileTestPoints(tile);
  return testSamplePoints(tile, points, point =>
    sources.some(source => canSourceObservePointBySightForm(source, tile, point, SIGHT_FORMS.normal))
  );
}

function testSamplePoints(tile, points, predicate) {
  if ( !points.length ) return false;
  return points.some(predicate);
}

function getSensesDiagnostics(tile, points, diagnostics) {
  const sources = getActiveVisionSources();
  const senses = getTileObservationSenses(tile.document);
  const matchedSources = new Set();
  const matchedSenses = new Set();
  const details = [];
  const results = points.map((point, index) => {
    const match = getPointObservationMatch(tile, point, sources, senses);
    if ( match ) {
      matchedSources.add(getVisionSourceName(match.source));
      matchedSenses.add(match.sense);
    }
    details.push(`P${index + 1}: ${match ? `${getSightFormLabel(match.sense)} by ${getVisionSourceName(match.source)}` : "hidden"}`);
    return !!match;
  });
  const observedPointCount = results.filter(Boolean).length;
  const observable = testSampleResults(tile, results);

  return {
    ...diagnostics,
    observable,
    finalVisible: diagnostics.coreVisible && (observable || diagnostics.remembered),
    observedPointCount,
    sourceCount: sources.length,
    matchedSources: Array.from(matchedSources),
    matchedSenses: Array.from(matchedSenses),
    summary: game.i18n.format("TILESIGHT.Diagnostics.Senses", {
      observed: observedPointCount,
      total: points.length,
      senses: senses.map(getSightFormLabel).join(", ")
    }),
    details
  };
}

function testSampleResults(tile, results) {
  if ( !results.length ) return false;
  return results.some(Boolean);
}

function getPointObservationMatch(tile, point, sources, senses) {
  for ( const source of sources ) {
    for ( const sense of senses ) {
      if ( canSourceObservePointBySightForm(source, tile, point, sense) ) return {source, sense};
    }
  }

  return null;
}

function getActiveVisionSources() {
  const sources = canvas.effects?.visionSources;
  const values = typeof sources?.values === "function" ? sources.values() : (sources ?? []);
  const previewToken = getPreviewToken();

  return Array.from(values).filter(source => {
    if ( !source?.active || source.isPreview ) return false;
    if ( !previewToken ) return true;
    return source.object === previewToken || source.object?.document?.uuid === previewToken.document?.uuid;
  });
}

function getAutoPreviewToken() {
  if ( !game.user?.isGM ) return null;

  const controlled = canvas?.tokens?.controlled ?? [];
  if ( controlled.length !== 1 ) return null;

  const [token] = controlled;
  return token?.document?.sight?.enabled || token?.vision?.active ? token : null;
}

function isTokenVisibleToPreview(previewToken, targetToken) {
  if ( targetToken.isPreview ) return true;
  if ( targetToken._preview?._previewType === "config" ) return false;
  if ( targetToken.layer?.active && targetToken.document.visible && (ui.placeables?.isEntryVisible(targetToken) === false) ) {
    return false;
  }
  if ( targetToken.document.hidden ) return false;
  if ( !canvas.visibility.tokenVision ) return true;

  const source = getPreviewVisionSource(previewToken);
  if ( !source ) return false;
  return canSourceObserveToken(source, targetToken);
}

function getPreviewVisionSource(previewToken) {
  return getActiveVisionSources().find(source =>
    source.object === previewToken || source.object?.document?.uuid === previewToken.document?.uuid
  ) ?? previewToken.vision ?? null;
}

function canSourceObserveToken(source, targetToken) {
  const modes = getSourceDetectionModes(source).filter(({mode}) => isDetectionModeUsable(mode));
  if ( !modes.length ) return false;

  const config = createTokenVisibilityConfig(targetToken);
  return modes.some(({id, mode}) => {
    const detectionMode = CONFIG.Canvas.detectionModes?.[id];
    if ( typeof detectionMode?.testVisibility !== "function" ) return false;
    return detectionMode.testVisibility(source, normalizeDetectionModeConfig(id, mode), config);
  });
}

function createTokenVisibilityConfig(token) {
  const level = canvas.scene?.levels?.get?.(token.document?.level) ?? canvas.level;
  const points = getTokenVisibilityTestPoints(token, level);
  const tests = points.map(point => {
    const testLevel = point.level ?? level;
    return {
      point: {...point, level: testLevel},
      level: testLevel,
      los: new Map()
    };
  });

  return {object: token, level, tests};
}

function getTokenVisibilityTestPoints(token, level) {
  const elevation = getTokenElevation(token);
  const nativePoints = getNativeTokenVisibilityTestPoints(token, {elevation, level, extra: {token}});
  const shape = getTokenShape(token);
  const shapePoints = getShapeVisibilityTestPoints({
    shape,
    bounds: getObjectBounds(token, shape),
    center: token.center,
    elevation,
    level,
    extra: {token}
  });

  return mergeVisibilityPoints([...nativePoints, ...shapePoints]);
}

function getNativeTokenVisibilityTestPoints(token, context) {
  const points = [];

  for ( const target of [token.document, token] ) {
    if ( typeof target?.getVisibilityTestPoints !== "function" ) continue;

    try {
      points.push(...normalizeVisibilityPoints(target.getVisibilityTestPoints(), token.center, context));
    } catch(error) {
      if ( !loggedNativeTokenPointsFailure ) {
        loggedNativeTokenPointsFailure = true;
        console.warn(`${MODULE_ID} | Native token visibility points failed, using shape-aware fallback`, error);
      }
    }
  }

  return mergeVisibilityPoints(points);
}

function getTruesightRange(source) {
  const actor = source.object?.actor ?? source.object?.document?.actor ?? null;
  const senses = actor?.system?.attributes?.senses ?? {};
  const range = normalizePositiveNumber(senses.ranges?.truesight ?? senses.truesight);
  const units = senses.units ?? getSceneDistanceUnit();
  const sceneRange = convertDnd5eLength(range, units, getSceneDistanceUnit());

  return {
    range,
    units,
    sceneRange,
    pixels: sceneRange * (canvas.dimensions?.distancePixels ?? 0)
  };
}

function sourceHasSeeInvisibility(source) {
  if ( sourceHasDetectionMode(source, INVISIBILITY_DETECTION_MODE_IDS) ) return true;
  if ( sourceHasDetectionMode(source, TRUE_SIGHT_DETECTION_MODE_IDS) ) return true;
  if ( getTruesightRange(source).pixels > 0 ) return true;

  return sourceHasSeeInvisibilityFeature(source);
}

function sourceHasSeeInvisibilityFeature(source) {
  const actor = source.object?.actor ?? source.object?.document?.actor ?? null;
  if ( normalizeBoolean(actor?.getFlag?.(MODULE_ID, FLAGS.seeInvisibility), false) ) return true;
  if ( getSourceRevealTags(source).includes("invisible") ) return true;
  return getActorEffects(actor).some(effect => {
    if ( effect.disabled || effect.isSuppressed ) return false;
    if ( normalizeBoolean(effect.getFlag?.(MODULE_ID, FLAGS.seeInvisibility) ?? effect.flags?.[MODULE_ID]?.[FLAGS.seeInvisibility], false) ) {
      return true;
    }
    const effectSlug = slugify(effect.name ?? effect.label ?? "");
    return SEE_INVISIBILITY_EFFECT_NAMES.has(effectSlug) || effectSlug.includes("see-invisibility");
  });
}

function sourceHasDevilsSight(source) {
  return sourceHasNativeDetectionMode(source, DEVILS_SIGHT_DETECTION_MODE_IDS) || sourceHasDevilsSightFeature(source);
}

function sourceHasDevilsSightFeature(source) {
  return sourceHasNamedFeature(source, DEVILS_SIGHT_EFFECT_NAMES, "devils-sight");
}

function sourceHasThermalVision(source) {
  return sourceHasNativeDetectionMode(source, THERMAL_VISION_DETECTION_MODE_IDS) || sourceHasThermalVisionFeature(source);
}

function sourceHasThermalVisionFeature(source) {
  return sourceHasNamedFeature(source, THERMAL_VISION_EFFECT_NAMES, "thermal-vision");
}

function sourceHasNamedFeature(source, names, revealTag) {
  const actor = source.object?.actor ?? source.object?.document?.actor ?? null;
  if ( getSourceRevealTags(source).includes(revealTag) ) return true;

  const special = String(actor?.system?.attributes?.senses?.special ?? "").toLowerCase();
  if ( special && Array.from(names).some(name => special.includes(name.replaceAll("-", " "))) ) return true;

  return getActorEffects(actor).some(effect => {
    if ( effect.disabled || effect.isSuppressed ) return false;
    const effectSlug = slugify(effect.name ?? effect.label ?? "");
    return names.has(effectSlug) || effectSlug.includes(revealTag);
  });
}

function sourceHasDetectionMode(source, modeIds) {
  return getSourceDetectionModes(source).some(({id, mode}) => modeIds.has(id) && isDetectionModeUsable(mode));
}

function sourceHasNativeDetectionMode(source, modeIds) {
  const modes = source.object?.document?.detectionModes ?? {};
  const entries = Array.isArray(modes)
    ? modes.map(mode => [mode.id, mode])
    : Object.entries(modes);

  return entries.some(([id, mode]) => modeIds.has(id) && isDetectionModeUsable(normalizeDetectionModeConfig(id, mode)));
}

function canSourceObservePointBySightForm(source, tile, point, sightForm) {
  switch ( sightForm ) {
    case SIGHT_FORMS.normal:
      return canSourceObservePointWithDetectionModes(source, tile, point, isNormalSightDetectionEntry);
    case SIGHT_FORMS.darkvision:
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.darkvision || DARKVISION_DETECTION_MODE_IDS.has(entry.id)
      );
    case SIGHT_FORMS.devilsSight:
      if ( !sourceHasDevilsSight(source) ) return false;
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.devilsSight
        || DEVILS_SIGHT_DETECTION_MODE_IDS.has(entry.id)
        || isNormalSightDetectionEntry(entry)
      );
    case SIGHT_FORMS.blindsight:
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.blindsight || BLINDSIGHT_DETECTION_MODE_IDS.has(entry.id)
      );
    case SIGHT_FORMS.tremorsense:
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.tremorsense || TREMORSENSE_DETECTION_MODE_IDS.has(entry.id)
      );
    case SIGHT_FORMS.truesight:
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.truesight || TRUE_SIGHT_DETECTION_MODE_IDS.has(entry.id)
      );
    case SIGHT_FORMS.seeInvisibility:
      if ( !sourceHasSeeInvisibility(source) ) return false;
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.seeInvisibility
        || entry.sense === SIGHT_FORMS.truesight
        || INVISIBILITY_DETECTION_MODE_IDS.has(entry.id)
        || TRUE_SIGHT_DETECTION_MODE_IDS.has(entry.id)
        || isNormalSightDetectionEntry(entry)
      );
    case SIGHT_FORMS.thermalVision:
      if ( !sourceHasThermalVision(source) ) return false;
      return canSourceObservePointWithDetectionModes(source, tile, point, entry =>
        entry.sense === SIGHT_FORMS.thermalVision || THERMAL_VISION_DETECTION_MODE_IDS.has(entry.id)
      );
    default:
      return false;
  }
}

function canSourceObservePointWithDetectionModes(source, tile, point, modePredicate) {
  const modes = getSourceDetectionModes(source).filter(entry =>
    isDetectionModeUsable(entry.mode) && modePredicate(entry)
  );
  if ( !modes.length ) return false;

  const requireRange = getTileRequireRange(tile.document);
  const requireLineOfSight = getTileRequireLineOfSight(tile.document);
  if ( !requireRange && !requireLineOfSight ) return true;

  if ( requireRange && requireLineOfSight ) {
    const config = createDetectionModeVisibilityConfig(tile, point);
    let tested = false;
    for ( const {id, mode} of modes ) {
      const detectionMode = CONFIG.Canvas.detectionModes?.[id];
      if ( typeof detectionMode?.testVisibility !== "function" ) continue;
      tested = true;
      if ( detectionMode.testVisibility(source, normalizeDetectionModeConfig(id, mode), config) ) return true;
    }

    if ( tested ) return false;
  }

  const rangePixels = getSourceDetectionRangePixels(source, modes);
  if ( requireRange && !isPointWithinSourceRange(source, point, rangePixels) ) return false;
  if ( requireLineOfSight && !hasSourceLineOfSight(source, point) ) return false;
  return true;
}

function createDetectionModeVisibilityConfig(tile, point) {
  const level = point.level ?? getTileLevel(tile);
  return {
    object: null,
    level,
    tests: [{point: {...point, level}, level, los: new Map()}]
  };
}

function getTileLevel(tile) {
  return canvas.scene?.levels?.get?.(tile.document?.level) ?? canvas.level;
}

function getSourceDetectionModes(source) {
  const modes = source.object?.document?.detectionModes ?? {};
  const entries = Array.isArray(modes)
    ? modes.map(mode => [mode.id, mode])
    : Object.entries(modes);
  const modeMap = new Map();

  for ( const [id, mode] of entries ) {
    if ( id ) mergeDetectionMode(modeMap, id, mode, getSightFormFromDetectionModeId(id));
  }

  mergeActorSenseDetectionMode(source, modeMap, "darkvision", "basicSight");
  mergeActorSenseDetectionMode(source, modeMap, "truesight", "seeAll");
  mergeActorSenseDetectionMode(source, modeMap, "blindsight", "blindsight");
  mergeActorSenseDetectionMode(source, modeMap, "tremorsense", "tremorsense");
  mergeFeatureDetectionMode(source, modeMap, SIGHT_FORMS.devilsSight, DEVILS_SIGHT_DETECTION_MODE_IDS, sourceHasDevilsSightFeature);
  mergeFeatureDetectionMode(source, modeMap, SIGHT_FORMS.thermalVision, THERMAL_VISION_DETECTION_MODE_IDS, sourceHasThermalVisionFeature);
  mergeSeeInvisibilityFeatureDetectionMode(source, modeMap);

  return Array.from(modeMap.values());
}

function mergeActorSenseDetectionMode(source, modeMap, sense, detectionModeId) {
  if ( !CONFIG.Canvas.detectionModes?.[detectionModeId] ) return;

  const actor = source.object?.actor ?? source.object?.document?.actor ?? null;
  const senseRange = getActorSenseRangePixels(actor, sense);
  if ( senseRange.sceneRange <= 0 ) return;
  mergeDetectionMode(modeMap, detectionModeId, {
    enabled: true,
    range: senseRange.sceneRange
  }, sense);
}

function mergeFeatureDetectionMode(source, modeMap, sense, detectionModeIds, predicate) {
  if ( !predicate(source) ) return;

  const detectionModeId = Array.from(detectionModeIds).find(id => CONFIG.Canvas.detectionModes?.[id]) ?? "basicSight";
  if ( !CONFIG.Canvas.detectionModes?.[detectionModeId] ) return;

  mergeDetectionMode(modeMap, detectionModeId, {
    enabled: true,
    range: Number.POSITIVE_INFINITY
  }, sense);
}

function mergeSeeInvisibilityFeatureDetectionMode(source, modeMap) {
  if ( !sourceHasSeeInvisibilityFeature(source) ) return;

  const detectionModeId = CONFIG.Canvas.detectionModes?.seeInvisibility ? "seeInvisibility" : "basicSight";
  if ( !CONFIG.Canvas.detectionModes?.[detectionModeId] ) return;

  mergeDetectionMode(modeMap, detectionModeId, {
    enabled: true,
    range: Number.POSITIVE_INFINITY
  }, SIGHT_FORMS.seeInvisibility);
}

function mergeDetectionMode(modeMap, id, mode={}, sense=null) {
  const normalized = normalizeDetectionModeConfig(id, mode);
  const key = `${id}:${sense ?? "native"}`;
  const current = modeMap.get(key);
  if ( !current ) {
    modeMap.set(key, {id, mode: normalized, sense});
    return;
  }

  modeMap.set(key, {
    id,
    sense,
    mode: {
      ...current.mode,
      ...normalized,
      enabled: current.mode.enabled !== false && normalized.enabled !== false,
      range: Math.max(current.mode.range, normalized.range)
    }
  });
}

function normalizeDetectionModeConfig(id, mode={}) {
  const range = mode.range === null || mode.range === undefined ? Number.POSITIVE_INFINITY : Number(mode.range);
  return {
    id,
    ...mode,
    enabled: mode.enabled !== false,
    range: Number.isFinite(range) ? range : Number.POSITIVE_INFINITY
  };
}

function isDetectionModeUsable(mode) {
  return mode.enabled !== false && mode.range > 0;
}

function isNormalSightDetectionEntry({id, sense}) {
  if ( sense && sense !== SIGHT_FORMS.normal ) return false;
  if ( INVISIBILITY_DETECTION_MODE_IDS.has(id) ) return false;
  if ( TRUE_SIGHT_DETECTION_MODE_IDS.has(id) ) return false;
  if ( DARKVISION_DETECTION_MODE_IDS.has(id) ) return false;
  if ( DEVILS_SIGHT_DETECTION_MODE_IDS.has(id) ) return false;
  if ( BLINDSIGHT_DETECTION_MODE_IDS.has(id) ) return false;
  if ( TREMORSENSE_DETECTION_MODE_IDS.has(id) ) return false;
  if ( THERMAL_VISION_DETECTION_MODE_IDS.has(id) ) return false;

  const detectionMode = CONFIG.Canvas.detectionModes?.[id];
  const sightType = foundry.canvas.perception?.DetectionMode?.DETECTION_TYPES?.SIGHT;
  return id === "basicSight"
    || id === "lightPerception"
    || (sightType !== undefined && detectionMode?.type === sightType);
}

function getSightFormFromDetectionModeId(id) {
  if ( DARKVISION_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.darkvision;
  if ( DEVILS_SIGHT_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.devilsSight;
  if ( BLINDSIGHT_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.blindsight;
  if ( TREMORSENSE_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.tremorsense;
  if ( TRUE_SIGHT_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.truesight;
  if ( INVISIBILITY_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.seeInvisibility;
  if ( THERMAL_VISION_DETECTION_MODE_IDS.has(id) ) return SIGHT_FORMS.thermalVision;
  return null;
}

function getSightFormLabel(sightForm) {
  return game.i18n.localize(SIGHT_FORM_OPTIONS[sightForm] ?? sightForm);
}

function getSourceDetectionRangePixels(source, modes) {
  const ranges = modes.map(({mode}) => mode.range);
  if ( ranges.some(range => range === Number.POSITIVE_INFINITY) ) return Number.POSITIVE_INFINITY;

  const maxRange = ranges.reduce((max, range) => Math.max(max, range), 0);
  if ( !maxRange ) return 0;
  return source.object?.getLightRadius?.(maxRange) ?? (maxRange * (canvas.dimensions?.distancePixels ?? 0));
}

function isPointWithinSourceRange(source, point, rangePixels) {
  if ( !Number.isFinite(rangePixels) ) return true;
  const dx = point.x - source.x;
  const dy = point.y - source.y;
  return Math.hypot(dx, dy) <= rangePixels;
}

function hasSourceLineOfSight(source, point) {
  const publicResult = testSourceVisibilityWithDetectionMode(source, point);
  if ( typeof publicResult === "boolean" ) return publicResult;

  if ( source.los?.contains ) return source.los.contains(point.x, point.y);
  return testSourceCollisionWithLegacyApi(source, point);
}

function testSourceVisibilityWithDetectionMode(source, point) {
  const detectionMode = CONFIG.Canvas.detectionModes.basicSight;
  if ( typeof detectionMode?.testVisibility !== "function" ) return undefined;

  try {
    const level = point.level ?? canvas.level;
    const mode = {
      id: detectionMode.id ?? "basicSight",
      enabled: true,
      range: Number.POSITIVE_INFINITY
    };
    const config = {
      object: null,
      level,
      tests: [{point, level, los: new Map()}]
    };

    return detectionMode.testVisibility(source, mode, config);
  } catch(error) {
    if ( !loggedPublicDetectionFailure ) {
      loggedPublicDetectionFailure = true;
      console.warn(`${MODULE_ID} | Public DetectionMode visibility test failed, using LOS polygon fallback`, error);
    }
    return undefined;
  }
}

function testSourceCollisionWithLegacyApi(source, point) {
  if ( !source.los ) return false;
  const DetectionModeClass = foundry.canvas.perception?.DetectionMode
    ?? CONFIG.Canvas.detectionModes.basicSight?.constructor;

  if ( typeof DetectionModeClass?._testCollision === "function" ) {
    try {
      const test = {
        point,
        level: canvas.level,
        los: new Map()
      };

      return !DetectionModeClass._testCollision(source, test, source.los);
    } catch(error) {
      if ( !loggedLegacyCollisionFallback ) {
        loggedLegacyCollisionFallback = true;
        console.warn(`${MODULE_ID} | Legacy DetectionMode collision fallback failed`, error);
      }
    }
  }

  return false;
}

function getTileTestPoints(tile) {
  const elevation = getTileElevation(tile);
  return getShapeVisibilityTestPoints({
    shape: tile.document.shape,
    bounds: getObjectBounds(tile, tile.document.shape),
    center: tile.center,
    elevation,
    level: getTileLevel(tile),
    extra: {tile}
  });
}

function getShapeVisibilityTestPoints({shape, bounds, center, elevation, level, extra={}}) {
  const normalizedBounds = normalizeBounds(bounds);
  const points = [];
  const seen = new Set();

  const addPoint = (point, {requireShape=true}={}) => {
    const normalized = normalizeVisibilityPoint(point, center, {elevation, level, extra});
    if ( !normalized ) return;
    if ( requireShape && !isPointInsideShape(shape, normalized) ) return;

    const key = pointKey(normalized);
    if ( seen.has(key) ) return;
    points.push(normalized);
    seen.add(key);
  };

  addPoint(center);

  if ( normalizedBounds ) {
    const {columns, rows} = getAdaptiveSampleGrid(normalizedBounds);
    for ( const xFactor of getInteriorFactors(columns) ) {
      for ( const yFactor of getInteriorFactors(rows) ) {
        addPoint({
          x: normalizedBounds.x + (normalizedBounds.width * xFactor),
          y: normalizedBounds.y + (normalizedBounds.height * yFactor)
        });
      }
    }
  }

  if ( !points.length ) addPoint(center, {requireShape: false});
  return points;
}

function getAdaptiveSampleGrid(bounds) {
  const gridSize = Math.max(Number(canvas.dimensions?.size) || 0, 1);
  return {
    columns: clampInteger(Math.ceil(bounds.width / gridSize) + 1, MIN_SHAPE_SAMPLE_COUNT, MAX_SHAPE_SAMPLE_COUNT),
    rows: clampInteger(Math.ceil(bounds.height / gridSize) + 1, MIN_SHAPE_SAMPLE_COUNT, MAX_SHAPE_SAMPLE_COUNT)
  };
}

function getInteriorFactors(count) {
  if ( count <= 1 ) return [0.5];
  return Array.from({length: count}, (_value, index) => (index + 0.5) / count);
}

function getObjectBounds(object, shape) {
  return normalizeBounds(shape?.polygonTree?.bounds ?? shape?.bounds ?? object?.bounds);
}

function normalizeBounds(bounds) {
  if ( !bounds ) return null;

  const x = Number(bounds.x ?? bounds.left);
  const y = Number(bounds.y ?? bounds.top);
  const width = Number(bounds.width ?? ((bounds.right ?? 0) - x));
  const height = Number(bounds.height ?? ((bounds.bottom ?? 0) - y));
  if ( !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) ) return null;
  if ( (width <= 0) || (height <= 0) ) return null;

  return {x, y, width, height};
}

function normalizeVisibilityPoints(points, fallbackCenter, context) {
  return getPointValues(points)
    .map(point => normalizeVisibilityPoint(point, fallbackCenter, context))
    .filter(Boolean);
}

function getPointValues(points) {
  if ( !points ) return [];
  if ( Number.isFinite(Number(points.x)) && Number.isFinite(Number(points.y)) ) return [points];
  if ( points instanceof Map ) return Array.from(points.values());
  if ( typeof points?.values === "function" && (typeof points[Symbol.iterator] !== "function") ) {
    return Array.from(points.values());
  }
  if ( typeof points?.[Symbol.iterator] === "function" ) return Array.from(points);
  return [];
}

function normalizeVisibilityPoint(point, fallbackCenter, {elevation, level, extra={}}={}) {
  const x = Number(point?.x ?? fallbackCenter?.x);
  const y = Number(point?.y ?? fallbackCenter?.y);
  if ( !Number.isFinite(x) || !Number.isFinite(y) ) return null;

  const normalized = {...point, ...extra, x, y};
  if ( elevation !== undefined && normalized.elevation === undefined ) normalized.elevation = elevation;
  if ( level !== undefined && normalized.level === undefined ) normalized.level = level;
  return normalized;
}

function isPointInsideShape(shape, point) {
  if ( !shape ) return true;

  if ( typeof shape.testPoint === "function" ) {
    try {
      return !!shape.testPoint(point);
    } catch(error) {
      if ( !loggedShapeTestFailure ) {
        loggedShapeTestFailure = true;
        console.warn(`${MODULE_ID} | Shape testPoint failed, using contains fallback`, error);
      }
    }
  }

  if ( typeof shape.contains === "function" ) {
    try {
      return !!shape.contains(point.x, point.y);
    } catch(error) {
      if ( !loggedShapeContainsFailure ) {
        loggedShapeContainsFailure = true;
        console.warn(`${MODULE_ID} | Shape contains failed, accepting visibility point`, error);
      }
    }
  }

  return true;
}

function mergeVisibilityPoints(points) {
  const merged = [];
  const seen = new Set();

  for ( const point of points ) {
    if ( !point ) continue;
    const key = pointKey(point);
    if ( seen.has(key) ) continue;
    merged.push(point);
    seen.add(key);
  }

  return merged;
}

function getTokenShape(token) {
  return token.document?.shape ?? token.shape ?? token.hitArea;
}

function getTokenElevation(token) {
  const elevation = Number(token.document?.elevation ?? token.elevation);
  if ( Number.isFinite(elevation) ) return elevation;
  return canvas.level?.elevation?.base ?? 0;
}

function getTileElevation(tile) {
  const elevation = Number(tile.document.elevation);
  if ( Number.isFinite(elevation) ) return elevation;
  return canvas.level?.elevation?.base ?? 0;
}

function pointKey(point) {
  return `${Math.round(point.x * 1000) / 1000}:${Math.round(point.y * 1000) / 1000}`;
}

function normalizePositiveNumber(value) {
  if ( value === null || value === undefined || value === "" ) return 0;
  const number = Number(value);
  return Number.isFinite(number) && (number > 0) ? number : 0;
}

function normalizeBoolean(value, fallback) {
  if ( Array.isArray(value) ) return normalizeBoolean(value.at(-1), fallback);
  if ( value === undefined || value === null || value === "" ) return fallback;
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeTags(value) {
  if ( Array.isArray(value) ) return value.map(tag => String(tag).trim()).filter(Boolean);
  if ( value instanceof Set ) return Array.from(value).map(tag => String(tag).trim()).filter(Boolean);
  if ( typeof value !== "string" ) return [];
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function normalizeSightForms(value) {
  const valid = new Set(Object.values(SIGHT_FORMS));
  const values = [];

  if ( Array.isArray(value) ) values.push(...value);
  else if ( value instanceof Set ) values.push(...Array.from(value));
  else if ( typeof value === "string" ) values.push(...value.split(","));
  else if ( value && (typeof value === "object") ) {
    for ( const [key, enabled] of Object.entries(value) ) {
      if ( normalizeBoolean(enabled, false) ) values.push(key);
    }
  }

  return Array.from(new Set(values.map(sense => String(sense).trim()).filter(sense => valid.has(sense))));
}

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampInteger(value, min, max) {
  return Math.round(clamp(value, min, max));
}

function convertDnd5eLength(value, from, to) {
  if ( !from || !to || (from === to) ) return value;

  const units = CONFIG.DND5E?.movementUnits;
  const fromUnit = units?.[from];
  const toUnit = units?.[to];
  if ( !fromUnit || !toUnit ) return value;

  return value * (fromUnit.conversion ?? 1) / (toUnit.conversion ?? 1);
}

function getSceneDistanceUnit() {
  return canvas.scene?.grid?.units ?? "ft";
}

function hasSpecialStatus(document, key) {
  const status = CONFIG.specialStatusEffects?.[key];
  return !!status && (document.hasStatusEffect?.(status) ?? false);
}

function getVisionSourceName(source) {
  return source.object?.name
    ?? source.object?.document?.name
    ?? source.object?.actor?.name
    ?? source.object?.document?.actor?.name
    ?? source.id
    ?? game.i18n.localize("TILESIGHT.Diagnostics.UnknownSource");
}

function resolveToken(tokenOrDocument) {
  if ( !tokenOrDocument ) return canvas?.tokens?.controlled?.[0] ?? null;
  if ( tokenOrDocument.object?.document ) return tokenOrDocument.object;
  if ( tokenOrDocument.document ) return tokenOrDocument;

  const id = String(tokenOrDocument);
  return canvas?.tokens?.placeables?.find(token =>
    token.id === id || token.document?.id === id || token.document?.uuid === id || token.name === id
  ) ?? null;
}

function loadObservedMemory() {
  if ( observedTileMemoryLoaded ) return;
  const userFlag = game.user?.getFlag?.(MODULE_ID, "observedTiles");
  const stored = Array.isArray(userFlag) ? userFlag : Object.keys(getMemoryTiles());
  observedTileMemory = new Set(stored);
  observedTileMemoryLoaded = true;
}

function isTileRemembered(tile) {
  if ( isPreviewActive() || !getVisibilityMemoryEnabled() ) return false;
  loadObservedMemory();
  return observedTileMemory.has(tile.document.uuid);
}

function rememberObservedTile(tile) {
  if ( isPreviewActive() || !getVisibilityMemoryEnabled() ) return;
  if ( getTileObservationMode(tile.document) === OBSERVATION_MODES.always ) return;

  loadObservedMemory();
  if ( observedTileMemory.has(tile.document.uuid) ) return;
  observedTileMemory.add(tile.document.uuid);
  persistObservedMemory();
}

async function saveObservedMemory() {
  const values = Array.from(observedTileMemory);
  if ( game.user?.setFlag ) {
    await game.user.setFlag(MODULE_ID, "observedTiles", values);
    return;
  }

  await setMemoryTiles(Object.fromEntries(values.map(uuid => [uuid, true])));
}

function hasMatchingRevealTags(source, tileTags) {
  const revealTags = getSourceRevealTags(source);
  return revealTags.some(tag => tileTags.includes(tag));
}

function getSourceRevealTags(source) {
  const actor = source.object?.actor ?? source.object?.document?.actor ?? null;
  const tags = new Set(normalizeTags(actor?.getFlag?.(MODULE_ID, FLAGS.revealTags)));

  for ( const effect of getActorEffects(actor) ) {
    if ( effect.disabled || effect.isSuppressed ) continue;
    for ( const tag of normalizeTags(effect.getFlag?.(MODULE_ID, FLAGS.revealTags) ?? effect.flags?.[MODULE_ID]?.[FLAGS.revealTags]) ) {
      tags.add(tag);
    }
  }

  return Array.from(tags).map(tag => tag.toLowerCase());
}

function getActorEffects(actor) {
  const effects = actor?.effects ?? actor?.appliedEffects ?? [];
  if ( typeof effects.values === "function" ) return Array.from(effects.values());
  return Array.from(effects);
}
