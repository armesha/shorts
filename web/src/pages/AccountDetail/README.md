# AccountDetail code map

`index.tsx` is the page coordinator: route params, API state, save/delete/generate actions, and composition of sections.

- `sources.ts` keeps deck/source naming, language, grouping, and remaining-card helpers.
- `schedule.ts` keeps schedule math and random daily slots.
- `NoticeToast.tsx` renders the transient toast only.
- `YouTubeConnectionCard.tsx` renders connection status, reconnect flow UI, and Google key picker.
- `LibrarySection.tsx` renders channel packs, generation controls, manual upload, and video library grid.
- `SlotDeckAssignments.tsx` renders per-slot deck binding.
- `VideoPreviewModal.tsx` and `AvatarPickerModal.tsx` keep modal UI isolated.

Keep new AccountDetail UI sections as small sibling components. Keep shared page state/actions in `index.tsx` unless the state domain is moved into a dedicated hook in one pass.
