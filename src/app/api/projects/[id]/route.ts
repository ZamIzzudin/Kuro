// /api/projects/:id — master Project (admin only)
import { masterHandlers } from '@/lib/masters'

const h = masterHandlers('project')
export const PATCH = h.PATCH
