// /api/requesters/:id — master Requester (admin only)
import { masterHandlers } from '@/lib/masters'

const h = masterHandlers('requester')
export const PATCH = h.PATCH
