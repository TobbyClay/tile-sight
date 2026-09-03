export const MODULE_ID = "tile-sight";

export const FLAGS = Object.freeze({
  observationMode: "observationMode",
  observationSenses: "observationSenses",
  filterMode: "filterMode",
  revealTags: "revealTags",
  requireLineOfSight: "requireLineOfSight",
  requireRange: "requireRange",
  seeInvisibility: "seeInvisibility",
  tags: "tags"
});

export const SETTINGS = Object.freeze({
  diagnostics: "diagnostics",
  fadeDuration: "fadeDuration",
  filterMode: "filterMode",
  memoryTiles: "memoryTiles",
  senseAuras: "senseAuras",
  visibilityMemory: "visibilityMemory"
});

export const OBSERVATION_MODES = Object.freeze({
  always: "always",
  senses: "senses",
  sight: "sight",
  seeInvisibility: "seeInvisibility",
  truesight: "seeInvisibility"
});

export const DEFAULT_OBSERVATION_MODE = OBSERVATION_MODES.always;
export const LEGACY_TRUESIGHT_MODE = "truesight";

export const OBSERVATION_MODE_OPTIONS = Object.freeze({
  [OBSERVATION_MODES.always]: "TILESIGHT.ObservationMode.Always",
  [OBSERVATION_MODES.senses]: "TILESIGHT.ObservationMode.Senses"
});

export const SIGHT_FORMS = Object.freeze({
  normal: "normal",
  darkvision: "darkvision",
  devilsSight: "devilsSight",
  blindsight: "blindsight",
  tremorsense: "tremorsense",
  truesight: "truesight",
  seeInvisibility: "seeInvisibility",
  thermalVision: "thermalVision"
});

export const DEFAULT_OBSERVATION_SENSES = Object.freeze([SIGHT_FORMS.normal]);

export const LEGACY_SIGHT_SENSES = Object.freeze([
  SIGHT_FORMS.normal,
  SIGHT_FORMS.darkvision,
  SIGHT_FORMS.devilsSight,
  SIGHT_FORMS.blindsight,
  SIGHT_FORMS.tremorsense,
  SIGHT_FORMS.truesight,
  SIGHT_FORMS.thermalVision
]);

export const LEGACY_SEE_INVISIBILITY_SENSES = Object.freeze([
  SIGHT_FORMS.seeInvisibility,
  SIGHT_FORMS.truesight
]);

export const SIGHT_FORM_OPTIONS = Object.freeze({
  [SIGHT_FORMS.normal]: "TILESIGHT.SightForm.Normal",
  [SIGHT_FORMS.darkvision]: "TILESIGHT.SightForm.Darkvision",
  [SIGHT_FORMS.devilsSight]: "TILESIGHT.SightForm.DevilsSight",
  [SIGHT_FORMS.blindsight]: "TILESIGHT.SightForm.Blindsight",
  [SIGHT_FORMS.tremorsense]: "TILESIGHT.SightForm.Tremorsense",
  [SIGHT_FORMS.truesight]: "TILESIGHT.SightForm.Truesight",
  [SIGHT_FORMS.seeInvisibility]: "TILESIGHT.SightForm.SeeInvisibility",
  [SIGHT_FORMS.thermalVision]: "TILESIGHT.SightForm.ThermalVision"
});

export const SAMPLING_MODES = Object.freeze({
  adaptive: "adaptive"
});

export const DEFAULT_SAMPLING_MODE = SAMPLING_MODES.adaptive;

export const SAMPLING_RULES = Object.freeze({
  any: "any"
});

export const DEFAULT_SAMPLING_RULE = SAMPLING_RULES.any;

export const FILTER_MODES = Object.freeze({
  inherit: "",
  none: "none",
  spectral: "spectral",
  ethereal: "ethereal",
  arcane: "arcane",
  shadow: "shadow",
  thermal: "thermal",
  tremor: "tremor",
  monochrome: "monochrome"
});

export const DEFAULT_FILTER_MODE = FILTER_MODES.spectral;

export const FILTER_MODE_OPTIONS = Object.freeze({
  [FILTER_MODES.none]: "TILESIGHT.FilterMode.None",
  [FILTER_MODES.spectral]: "TILESIGHT.FilterMode.Spectral",
  [FILTER_MODES.ethereal]: "TILESIGHT.FilterMode.Ethereal",
  [FILTER_MODES.arcane]: "TILESIGHT.FilterMode.Arcane",
  [FILTER_MODES.shadow]: "TILESIGHT.FilterMode.Shadow",
  [FILTER_MODES.thermal]: "TILESIGHT.FilterMode.Thermal",
  [FILTER_MODES.tremor]: "TILESIGHT.FilterMode.Tremor",
  [FILTER_MODES.monochrome]: "TILESIGHT.FilterMode.Monochrome"
});
