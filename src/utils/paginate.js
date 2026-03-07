// src/utils/paginate.js

/**
 * Extrae parámetros de paginación del query string.
 * Devuelve { page, perPage, offset }.
 */
export function parsePagination(query, { defaultPerPage = 20, maxPerPage = 100 } = {}) {
  const page    = Math.max(1, parseInt(query.page    ?? '1',              10) || 1);
  const perPage = Math.min(maxPerPage, Math.max(1, parseInt(query.per_page ?? String(defaultPerPage), 10) || defaultPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * Formatea la respuesta de listado con metadata de paginación.
 */
export function paginatedResponse(items, { page, perPage, total }) {
  return {
    items,
    pagination: {
      total,
      page,
      per_page: perPage,
      pages: Math.ceil(total / perPage),
    },
  };
}
