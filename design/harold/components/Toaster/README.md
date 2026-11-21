# Toaster

Short, temporary confirmations of an action ("Đã lưu", "Đã xoá, Hoàn tác"). Render one `<Toaster />` at the app root, then call `Harold.toast(...)` anywhere.

## API

- `Harold.toast({ title, text?, tone?: "info" | "success" | "warning" | "danger", action?: { label, onClick }, duration? })` returns an id. `duration` defaults to 5000ms; `0` keeps it until closed.
- `Harold.dismissToast(id)`.
- `<Toaster inline />` renders in place (demos); default is fixed bottom-right, max 3 at a time.

## Rules

- One sentence, past tense, no exclamation marks. Errors that block work belong in an Alert or under the field, not only in a toast.
- Enters with a 12px rise over 260ms, leaves in 170ms. Announced politely to screen readers.
