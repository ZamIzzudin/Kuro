// /api/projects — master Project (admin only)
import { masterHandlers } from '@/lib/masters'

const h = masterHandlers('project')
export const GET = h.GET
export const POST = h.POST
