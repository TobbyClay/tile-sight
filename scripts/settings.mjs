import {
  DEFAULT_SAMPLING_MODE,
  DEFAULT_SAMPLING_RULE,
  DEFAULT_FILTER_MODE,
  FILTER_MODE_OPTIONS,
  FILTER_MODES,
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";

const settingChangeCallbacks = new Set();

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.diagnostics, {
    name: "TILESIGHT.Settings.Diagnostics.Name",
    hint: "TILESIGHT.Settings.Diagnostics.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: notifySettingChange
  });

  game.settings.register(MODULE_ID, SETTINGS.senseAuras, {
    name: "TILESIGHT.Settings.SenseAuras.Name",
    hint: "TILESIGHT.Settings.SenseAuras.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: notifySettingChange
  });

  game.settings.register(MODULE_ID, SETTINGS.fadeDuration, {
    name: "TILESIGHT.Settings.FadeDuration.Name",
    hint: "TILESIGHT.Settings.FadeDuration.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 0,
    range: {
      min: 0,
      max: 2000,
      step: 50
    },
    onChange: notifySettingChange
  });

  game.settings.register(MODULE_ID, SETTINGS.filterMode, {
    name: "TILESIGHT.Settings.FilterMode.Name",
    hint: "TILESIGHT.Settings.FilterMode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: localizeChoices(FILTER_MODE_OPTIONS),
    default: DEFAULT_FILTER_MODE,
    onChange: notifySettingChange
  });

  game.settings.register(MODULE_ID, SETTINGS.visibilityMemory, {
    name: "TILESIGHT.Settings.VisibilityMemory.Name",
    hint: "TILESIGHT.Settings.VisibilityMemory.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: notifySettingChange
  });

  game.settings.register(MODULE_ID, SETTINGS.memoryTiles, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

export function onTileSightSettingChange(callback) {
  settingChangeCallbacks.add(callback);
}

export function getSamplingMode() {
  return DEFAULT_SAMPLING_MODE;
}

export function getSamplingRule() {
  return DEFAULT_SAMPLING_RULE;
}

export function getDiagnosticsEnabled() {
  return game.user?.isGM && game.settings.get(MODULE_ID, SETTINGS.diagnostics);
}

export function getSenseAurasEnabled() {
  return game.user?.isGM && game.settings.get(MODULE_ID, SETTINGS.senseAuras);
}

export function getFadeDuration() {
  const duration = Number(game.settings.get(MODULE_ID, SETTINGS.fadeDuration));
  return Number.isFinite(duration) && (duration > 0) ? duration : 0;
}

export function getFilterMode() {
  const mode = game.settings.get(MODULE_ID, SETTINGS.filterMode);
  if ( mode === FILTER_MODES.none ) return mode;
  return Object.values(FILTER_MODES).includes(mode) && mode ? mode : DEFAULT_FILTER_MODE;
}

export function getVisibilityMemoryEnabled() {
  return !game.user?.isGM && game.settings.get(MODULE_ID, SETTINGS.visibilityMemory);
}

export function getMemoryTiles() {
  const value = game.settings.get(MODULE_ID, SETTINGS.memoryTiles);
  return value && (typeof value === "object") ? value : {};
}

export function setMemoryTiles(value) {
  return game.settings.set(MODULE_ID, SETTINGS.memoryTiles, value);
}

function notifySettingChange() {
  for ( const callback of settingChangeCallbacks ) callback();
}

function localizeChoices(choices) {
  return Object.fromEntries(
    Object.entries(choices).map(([value, label]) => [value, game.i18n.localize(label)])
  );
}
