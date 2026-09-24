// Helper fetch untuk client components (SWR fetcher + send)
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Gagal memuat data')
  }
  return data as T
}

export async function apiSend<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Permintaan gagal')
  }
  return data as T
}

/** Unggah satu berkas lampiran (multipart) → metadata untuk disimpan ke task/time entry. */
export async function uploadAttachment(
  file: File
): Promise<{ objectKey: string; fileName: string; contentType: string; size: number }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/uploads/attachment', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Gagal mengunggah berkas')
  return data as { objectKey: string; fileName: string; contentType: string; size: number }
}
