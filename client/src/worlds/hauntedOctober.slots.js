// Slot table for the haunted-october ring world. Same shape as
// midnightGalaxy.slots.js (see that file for what each field means).
// STUB: replaced in Phase 2-4. Families follow spec §3; ground nouns
// (2 tree, 3 gravestones, 8 house) sit low (bandUpper: false).
export const SLOTS = [
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'scatter' },  // 0 bat flock
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'radial' },   // 1 jack-o'-lantern
  { cornerLeft: false, bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'branching' }, // 2 bare tree
  { cornerLeft: true,  bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'block' },    // 3 gravestone row
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'radial' },   // 4 will-o'-wisp
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'scatter' },  // 5 falling leaves
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'line' },     // 6 spiderweb
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'radial' },   // 7 lantern
  { cornerLeft: false, bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'block' },    // 8 haunted house
  { cornerLeft: true,  bandUpper: false, companionUpper: true,  companionBoost: false, maxDetail: 1, family: 'cloud' },    // 9 fog bank
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'radial' },   // 10 harvest moon (music station)
  { cornerLeft: true,  bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'streak' },   // 11 storm
  { cornerLeft: false, bandUpper: true,  companionUpper: false, companionBoost: false, maxDetail: 1, family: 'figure' },   // 12 crow
]
