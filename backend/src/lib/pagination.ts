import type { Request } from "express";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/**
 * Parses `?page=&pageSize=` with a server-enforced maximum (README §6 API
 * Structure) — a client can never force an unbounded table scan by asking
 * for a huge page.
 */
export function parsePagination(req: Request): Pagination {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const requestedSize = Number.parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requestedSize), MAX_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginatedResponse<T>(items: T[], total: number, pagination: Pagination) {
  return {
    items,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.ceil(total / pagination.pageSize),
    },
  };
}
