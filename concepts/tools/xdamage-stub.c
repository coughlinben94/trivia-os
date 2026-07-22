/* Minimal stub for libXdamage.so.1, needed only so headless Chromium's dynamic
 * linker can resolve its NEEDED entry in sandboxes that have no root/apt access
 * (confirmed: this Ubuntu 22.04 sandbox ships every other X11 lib Chromium
 * needs — libX11, libXext, libXcomposite, libXfixes, libXrandr, libxcb — except
 * this one, and apt-get/sudo are both hard-blocked here, "no new privileges").
 *
 * Verified via `nm -D --undefined-only` on both headless_shell and chrome that
 * exactly four symbols are referenced: XDamageQueryExtension, XDamageCreate,
 * XDamageDestroy, XDamageSubtract. XDamageQueryExtension returning 0 (False)
 * is the same "extension not present" signal a real X server without the
 * Damage extension would give — Chromium's own code already handles that
 * path gracefully (it just disables damage-tracking-based repaint
 * optimization, irrelevant in headless/off-screen rendering). Create/Destroy/
 * Subtract are stubbed as harmless no-ops for safety in case any code path
 * calls them regardless of the QueryExtension result.
 *
 * This is NOT a general-purpose libXdamage replacement — it does not
 * implement the X Damage extension. It exists solely to satisfy the
 * dynamic linker so headless screenshot capture works in this sandbox.
 *
 * Built by ensure-xdamage-stub.sh into concepts/tools/.cache/libXdamage.so.1 —
 * not committed as a binary, rebuilt fresh (sub-second) each time it's missing,
 * so it's never architecture- or sandbox-specific stale state.
 */

typedef struct _XDisplay Display;
typedef unsigned long XID;

int XDamageQueryExtension(Display *dpy, int *event_base, int *error_base) {
    if (event_base) *event_base = 0;
    if (error_base) *error_base = 0;
    return 0;
}

XID XDamageCreate(Display *dpy, XID drawable, int level) {
    return 0;
}

void XDamageDestroy(Display *dpy, XID damage) {
}

void XDamageSubtract(Display *dpy, XID damage, XID repair, XID parts) {
}
