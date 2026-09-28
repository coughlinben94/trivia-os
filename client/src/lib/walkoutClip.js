// Clip editor emits only clip fields (url/trim); keep the slide's own `trigger`.
// null clears the whole walkout.
export const mergeWalkoutClip = (current, clip) => (clip ? { ...current, ...clip } : null)
