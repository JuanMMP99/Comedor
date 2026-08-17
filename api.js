/**
 * API Client para Google Apps Script - Comedor Origen
 */
const API = {
  async fetch(endpoint, params = {}) {
    const searchParams = new URLSearchParams({ action: endpoint, ...params });
    const url = `${CONFIG.API_URL}?${searchParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === "error") {
        throw new Error(
          data.data?.error || data.message || "Error en el servidor",
        );
      }

      return data.data;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  },

  async post(endpoint, payload) {
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8", // Requerido por Apps Script para evitar bloqueos de CORS pre-flight
        },
        body: JSON.stringify({
          action: endpoint,
          data: payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === "error") {
        throw new Error(
          data.data?.error || data.message || "Error en el servidor",
        );
      }

      return data.data;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  },

  // Método específico para crear un pedido
  async crearPedido(pedidoData) {
    return this.post("crearPedido", pedidoData);
  },

  // Método específico para registrar una visita (fire-and-forget, no bloquea la carga)
  async registrarVisita(visitaData) {
    return this.post("registrarVisita", visitaData);
  },

  // ==========================================================================
  // RESERVACIONES - Métodos
  // ==========================================================================

  async getAvailableTables(sucursal, fecha, hora) {
    const params = { sucursal, fecha, hora };
    return this.fetch("getAvailableTables", params);
  },

  // Devuelve los horarios disponibles (considerando mesas libres) para una
  // sucursal y fecha. Usado por el nuevo selector de horario en botones.
  async getAvailableHours(sucursal, fecha) {
    const params = { sucursal, fecha };
    return this.fetch("getAvailableHours", params);
  },

  async crearReservacion(data) {
    return this.post("crearReservacion", data);
  },

  async getReservations(filtros) {
    return this.fetch("adminGetReservations", filtros);
  },
};