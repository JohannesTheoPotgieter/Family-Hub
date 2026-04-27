// Banking provider barrel + sync orchestration (Phase 4.4).
//
// Importing this module side-effect-registers all known providers in
// bankProvider.mjs's registry. The sync worker imports this once at boot
// so getProvider('stitch') etc. work everywhere downstream.

import './stitch.mjs';
import './plaid.mjs';
import './truelayer.mjs';

export { getProvider, listConfiguredProviders } from './bankProvider.mjs';
