import {
  DEFAULT_OBSERVATION_MODE,
  FLAGS,
  LEGACY_SEE_INVISIBILITY_SENSES,
  LEGACY_SIGHT_SENSES,
  LEGACY_TRUESIGHT_MODE,
  MODULE_ID,
  OBSERVATION_MODES,
  SIGHT_FORMS
} from "./constants.mjs";
import {
  clearDiagnosticsOverlay,
  registerDiagnosticsHooks,
  requestDiagnosticsRefresh
} from "./diagnostics.mjs";
import {
  getDiagnosticsEnabled,
  getSamplingMode,
  getSamplingRule,
  onTileSightSettingChange,
  registerSettings
} from "./settings.mjs";
import {registerTileConfigHooks} from "./tile-config.mjs";
import {
  clearPreview,
  clearVisibilityMemory as clearVisibilityMemoryState,
  getObservedTileMemory,
  getTileObservationDiagnostics,
  getTileObservationMode,
  getTileObservationSenses,
  getTileSamplingMode,
  getTileSamplingRule,
  getTileTags,
  previewAsToken,
  registerVisibilityHooks,
  requestTileObservationRefresh
} from "./visibility.mjs";

Hooks.once("init", () => {
  const api = {
    MODULE_ID,
    OBSERVATION_MODES,
    SIGHT_FORMS,
    DEFAULT_OBSERVATION_MODE,
    getTileObservationMode,
    getTileObservationSenses,
    getTileObservationDiagnostics,
    getTileSamplingMode,
    getTileSamplingRule,
    getTileTags,
    getSamplingMode,
    getSamplingRule,
    diagnosticsEnabled: getDiagnosticsEnabled,
    clearPreview: clearPreviewAndRefresh,
    clearVisibilityMemory: clearVisibilityMemoryAndRefresh,
    getObservedTileMemory,
    previewAsToken: previewAsTokenAndRefresh,
    report: reportScene,
    refresh: requestTileObservationRefresh,
    setMode,
    setSenses,
    setSelectedTilesMode,
    setSelectedTilesSenses,
    setSelectedTilesTags,
    setTilesByTagMode
  };

  game.modules.get(MODULE_ID).api = api;
  game.tileSight = api;

  registerSettings();
  onTileSightSettingChange(() => {
    requestTileObservationRefresh();
    if ( getDiagnosticsEnabled() ) requestDiagnosticsRefresh();
    else clearDiagnosticsOverlay();
  });
  registerTileConfigHooks();
  registerVisibilityHooks();
  registerDiagnosticsHooks();
});

Hooks.once("ready", () => {
  requestTileObservationRefresh();
  requestDiagnosticsRefresh();
});

function previewAsTokenAndRefresh(tokenOrDocument) {
  const token = previewAsToken(tokenOrDocument);
  requestDiagnosticsRefresh();
  return token;
}

function clearPreviewAndRefresh() {
  clearPreview();
  requestDiagnosticsRefresh();
}

function clearVisibilityMemoryAndRefresh() {
  clearVisibilityMemoryState();
  requestDiagnosticsRefresh();
}

async function setMode(tileOrDocument, mode) {
  const requestedMode = mode;
  const normalized = normalizeObservationMode(mode);
  if ( !normalized.mode ) throw new Error(`Invalid Tile Sight mode: ${requestedMode}`);
  const document = resolveTileDocument(tileOrDocument);
  if ( !document ) return null;

  const update = {[`flags.${MODULE_ID}.${FLAGS.observationMode}`]: normalized.mode};
  if ( normalized.senses ) update[`flags.${MODULE_ID}.${FLAGS.observationSenses}`] = normalized.senses;

  await document.update(update);
  requestTileObservationRefresh();
  requestDiagnosticsRefresh();
  return document;
}

async function setSenses(tileOrDocument, senses) {
  const document = resolveTileDocument(tileOrDocument);
  if ( !document ) return null;

  const value = normalizeSightForms(senses);
  await document.update({
    [`flags.${MODULE_ID}.${FLAGS.observationMode}`]: OBSERVATION_MODES.senses,
    [`flags.${MODULE_ID}.${FLAGS.observationSenses}`]: value
  });
  requestTileObservationRefresh();
  requestDiagnosticsRefresh();
  return document;
}

async function setSelectedTilesMode(mode) {
  const tiles = getControlledTiles();
  await Promise.all(tiles.map(tile => setMode(tile, mode)));
  return tiles.length;
}

async function setSelectedTilesSenses(senses) {
  const tiles = getControlledTiles();
  await Promise.all(tiles.map(tile => setSenses(tile, senses)));
  return tiles.length;
}

async function setSelectedTilesTags(tags) {
  const value = normalizeTags(tags).join(", ");
  const tiles = getControlledTiles();
  await Promise.all(tiles.map(tile => tile.document.update({[`flags.${MODULE_ID}.${FLAGS.tags}`]: value})));
  requestTileObservationRefresh();
  requestDiagnosticsRefresh();
  return tiles.length;
}

async function setTilesByTagMode(tag, mode) {
  const normalizedTag = String(tag).trim().toLowerCase();
  const tiles = (canvas.tiles?.placeables ?? []).filter(tile => getTileTags(tile.document).includes(normalizedTag));
  await Promise.all(tiles.map(tile => setMode(tile, mode)));
  return tiles.length;
}

function reportScene() {
  const rows = (canvas.tiles?.placeables ?? [])
    .filter(tile => getTileObservationMode(tile.document) !== OBSERVATION_MODES.always)
    .map(tile => {
      const diagnostics = getTileObservationDiagnostics(tile);
      return {
        id: tile.id,
        name: tile.document.texture?.src ?? tile.document.id,
        mode: getTileObservationMode(tile.document),
        senses: getTileObservationSenses(tile.document).join(", "),
        visible: diagnostics?.finalVisible ?? false,
        observed: `${diagnostics?.observedPointCount ?? 0}/${diagnostics?.pointCount ?? 0}`,
        tags: getTileTags(tile.document).join(", "),
        remembered: !!diagnostics?.remembered
      };
    });

  console.table(rows);
  return rows;
}

function resolveTileDocument(tileOrDocument) {
  if ( tileOrDocument?.document ) return tileOrDocument.document;
  if ( tileOrDocument?.update ) return tileOrDocument;
  if ( !tileOrDocument ) return getControlledTiles()[0]?.document ?? null;

  const id = String(tileOrDocument);
  return (canvas.tiles?.placeables ?? []).find(tile =>
    tile.id === id || tile.document.id === id || tile.document.uuid === id
  )?.document ?? null;
}

function getControlledTiles() {
  return canvas.tiles?.controlled ?? (canvas.tiles?.placeables ?? []).filter(tile => tile.controlled);
}

function normalizeTags(value) {
  if ( Array.isArray(value) ) return value.map(tag => String(tag).trim()).filter(Boolean);
  if ( value instanceof Set ) return Array.from(value).map(tag => String(tag).trim()).filter(Boolean);
  if ( typeof value !== "string" ) return [];
  return value.split(",").map(tag => tag.trim()).filter(Boolean);
}

function normalizeObservationMode(mode) {
  if ( mode === LEGACY_TRUESIGHT_MODE || mode === OBSERVATION_MODES.seeInvisibility ) {
    return {mode: OBSERVATION_MODES.senses, senses: Array.from(LEGACY_SEE_INVISIBILITY_SENSES)};
  }

  if ( mode === OBSERVATION_MODES.sight ) {
    return {mode: OBSERVATION_MODES.senses, senses: Array.from(LEGACY_SIGHT_SENSES)};
  }

  if ( mode === OBSERVATION_MODES.always || mode === OBSERVATION_MODES.senses ) return {mode, senses: null};
  return {mode: null, senses: null};
}

function normalizeSightForms(value) {
  const valid = new Set(Object.values(SIGHT_FORMS));
  const values = [];

  if ( Array.isArray(value) ) values.push(...value);
  else if ( value instanceof Set ) values.push(...Array.from(value));
  else if ( typeof value === "string" ) values.push(...value.split(","));
  else if ( value && (typeof value === "object") ) {
    for ( const [key, enabled] of Object.entries(value) ) {
      if ( enabled ) values.push(key);
    }
  }

  return Array.from(new Set(values.map(sense => String(sense).trim()).filter(sense => valid.has(sense))));
}
