// /api/work-types — master Jenis Pekerjaan (admin only)
import { masterHandlers } from '@/lib/masters'

const h = masterHandlers('workType')
export const GET = h.GET
export const POST = h.POST
