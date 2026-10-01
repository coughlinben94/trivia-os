// Default show for the smoke specs + global-setup. Override with PLAYWRIGHT_SHOW_ID.
// Destructive specs (drag-reorder, wizard-create-verify) deliberately do NOT use this default.
export const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_NyRe6x2Q'
