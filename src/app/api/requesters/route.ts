// /api/requesters — master Requester (tambah baru hanya Admin — Q6)
import { masterHandlers } from '@/lib/masters'

const h = masterHandlers('requester')
export const GET = h.GET
export const POST = h.POST
