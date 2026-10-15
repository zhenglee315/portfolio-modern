# Access denied page

Review the standalone page at `/en/access-denied`, `/zh-Hant/access-denied` or
`/zh-Hans/access-denied`. The locale-only loader returns HTTP 403, disables
caching and search indexing, and does not read management records.

Management routes now verify a fresh browser `SESSION` before loading
`ManagementPage` or reading lists. SSR and first hydration show only a neutral
loading indicator and include no private identity. A confirmed guest, a false
resource permission, or a SESSION HTTP 401/403 produces the shared warning and
replaces the blocked URL with this localized page. The account menu, sidebar
and table gate share `auth/permissions`: sites/monitoring use
`is_manage_sites`, users use `is_manage_users`, and roles use
`is_manage_roles`. Monitoring remains a menu entry without a route.

Network, service and response-schema failures withhold management content and
offer explicit SESSION retry instead of granting cached access. Navigation and
session cancellation cannot commit stale permission decisions; identity/role
or management-flag changes cancel and clear private record caches. Backend
management reads and previews also enforce current account and role permissions
through the shared `ManagementPermission` dependency.

The illustration uses the existing `CowWorkspace` character slot so the desk,
open book, rotating globe, coffee cup, steam, plant pot, leaves, stacked books
and laptop retain their original vector assets and animation lifecycle. The
shared `DeniedCowCharacter` in `shared/ui/cow-workspace/` composes the existing
torso, blank head, neutral mouth and thinking arm. Rig arm
names describe screen position: the old `cowArmLeftThinking` is the cow's
anatomical right arm, retained at its approved shoulder/chin position. The newly generated
anatomical left arm holds the language-neutral red no-entry sign on screen right.

Only the raised sign arm was generated with the built-in imagegen tool. Its
transparent original and exact final prompt are saved in
`../../assets/cow-workspace/access-denied/rig-source/cowArmLeftNoEntry.png` and
`../../assets/cow-workspace/access-denied/arm-prompts.json`. All previous sources
remain intact. Rebuild its native SVG with:

```sh
python3 scripts/build-access-denied-arm.py
```

The angry brow/eye frame and two independent pupils derive from the approved
coding eye SVG. Their generator and provenance live in
`../../assets/cow-workspace/access-denied/`. The exact stepped eye openings stay
in the frame SVG; JavaScript contains only pupil anchors and motion bounds.
Tracking converts the page pointer through the moving head's screen matrix,
clips the pupils inside their original eyelids, and batches updates with RAF.
Reduced motion, coarse pointers, hidden/offscreen pages and the existing global
motion pause stop tracking. Existing themes and all three locales are supported.

The page reuses `shared/ui/background-field/BackgroundField` and the shared login ruler
entrance controller (collide, expand, then reveal), with no account form/card.
Its character breathes vertically and enables the existing coding sweat and
laptop rays without changing the angry face or raised sign.

Login reuses the same `DeniedCowCharacter`, loading it on first use after a
coded `INVALID_CREDENTIALS` failure. `AuthCowScene` swaps only the character
inside the mounted workspace, preserving its selected mode, motion preferences
and ambient clock. Email/password edits restore the original cow; focusing a
field alone keeps the denied pose. Network and service failures retain their
existing feedback. Both scenes share the original 6.8-second chin rub through
`cowWatchingArm`, keeping the arm visible independently of the ambient phase.

Login and this page share `useCowMotionControls`, the copy-injected `CowMotionControls`, and
`CowControl`: globe, mouse, leaves, and playback are the same implementation;
this page additionally enables the eye-tracking control. `CowWorkspace` owns
the stronger leaf sway (−5° to +6°), with `leafMotion` pausing only the leaves.

Responsive layout bounds the square illustration by both the available column
width and viewport height, reserving space for the header, five 44px controls
and page padding. Controls keep the full column width independently of the
smaller illustration. Portrait widths up to 900px stack and center the scene
and copy; short portraits use tighter spacing. Short landscapes from 540–900px
use two columns; narrower landscapes retain natural vertical scrolling.

Check viewport bounds, click targets, header menus, keyboard access, resizing, rotation and the shared login control row on phones, tablets, short desktops and ultrawide screens. Local automated checks stay in the ignored root `agent/` directory.

The pure finite ruler controller lives in `shared/lib/auth-transition`; this
page no longer imports the portfolio page's internal background or controller.
The locale adapter `i18n/cow-copy` supplies the same `CowMotionCopy` contract to
both cow callers. Management entry and later revocations use the same
`auth/actions.useAccessDeniedRedirect` warning/replace lifecycle.
