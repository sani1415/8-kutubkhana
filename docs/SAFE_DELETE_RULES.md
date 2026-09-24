# Safe delete rules (مكتبة المصباح)

Phase 4: how destructive operations are restricted and when deletion is blocked.

## Who can delete what

| Action | Viewer | Librarian | Admin | Backend enforcement |
|--------|--------|-----------|-------|----------------------|
| Delete single book | ❌ | ✅* | ✅ | RLS + app check |
| Bulk delete books | ❌ | ✅* | ✅ | RLS + app check |
| Delete member | ❌ | ✅* | ✅ | RLS + app check |
| Bulk delete members | ❌ | ✅* | ✅ | RLS + app check |
| Delete loan | ❌ | ✅ | ✅ | RLS |
| Delete category | ❌ | ✅ | ✅ | RLS |
| Delete publisher | ❌ | ✅ | ✅ | RLS |
| **Delete all data** | ❌ | ❌ | ✅ | RPC `clear_all_data()` + app check |

\* Blocked when it would break related records (see below).

## When deletion is blocked

- **Book (single or bulk):** Cannot delete if the book has an **active loan** (معار). User must return the loan first. Enforced in app and data layer.
- **Member (single or bulk):** Cannot delete if the member has any **active loans**. User must return or delete those loans first. Enforced in app and data layer.
- **Delete all data:** Only **admin** can run it. Implemented via Postgres function `clear_all_data()` (SECURITY DEFINER, checks `is_profiles_admin()`). Librarian calling the RPC gets an error.

## Confirmations

- Single deletes (book, member, loan, category, publisher): one confirmation modal.
- Bulk deletes: one confirmation with count.
- Delete all data: admin-only button, one strong confirmation modal (clear text that all data will be removed and the action cannot be undone).

## Backend details

- **RLS (003):** Librarian and admin have DELETE on books, members, loans, diary, categories, publishers, and documents. Viewer has no DELETE.
- **Triggers (009):** Deleting a book or member that still has an active loan (`معار`) fails in the database, including direct API calls. Returned loans can still be removed with the book or member.
- **RPC `clear_all_data()` (005, refreshed in 007):** Admin only. Deletes in order: loans → documents → books → members → diary → categories → publishers.
- **App:** The same active-loan check runs before delete and shows an Arabic message.

## Related records

- Deleting a **book** would cascade-delete its loans (FK). We **block** delete when the book has an active loan so the user must return it first; no surprise cascade.
- Deleting a **member** would cascade-delete their loans (FK). We **block** delete when the member has active loans; return or delete those loans first.
- Categories and publishers are text on books, not FKs; deleting a category or publisher does not break books.
