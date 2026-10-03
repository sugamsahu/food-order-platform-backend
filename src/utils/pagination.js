import { z } from 'zod'

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20)
})

export const toPageOptions = ({ page, page_size: pageSize }) => ({ limit: pageSize, offset: (page - 1) * pageSize })

export const pageResponse = (rows, total, { page, page_size: pageSize }) => ({
  data: rows,
  pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) }
})

// Escape LIKE wildcards so user input is matched literally.
export const likePattern = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`
