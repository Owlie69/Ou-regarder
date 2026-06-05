// Stub module used during static export (GitHub Pages).
// Admin CRUD is not available on a static host — forms render but submissions are no-ops.

export async function createEventAction(_formData: FormData): Promise<void> {}

export async function updateEventAction(_id: string, _formData: FormData): Promise<void> {}

export async function deleteEventAction(_id: string): Promise<void> {}

export async function togglePublishedAction(_id: string): Promise<void> {}
