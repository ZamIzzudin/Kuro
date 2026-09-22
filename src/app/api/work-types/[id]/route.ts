// /api/work-types/:id — master Jenis Pekerjaan (admin only)
import { masterHandlers } from '@/lib/masters'

const h = masterHandlers('workType')
export const PATCH = h.PATCH
