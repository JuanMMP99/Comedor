/**
 * Menú del restaurante — SEPARADO POR SUCURSAL.
 *
 * Cada sucursal tiene su propio arreglo de categorías y de platillos, porque
 * el menú y los precios pueden variar de una sucursal a otra. El "id" de
 * cada bloque debe coincidir exactamente con el "id" de la sucursal
 * correspondiente en constants.js (CONFIG.sucursales).
 *
 * No se usan CATALOG/CATEGORIES directamente aquí: esos globales los arma
 * sucursal.js a partir de la sucursal que el cliente eligió (ver ese archivo).
 */

const CATEGORIES_BY_SUCURSAL = {
  centro: [
    { name: "Todos", count: 16 },
    { name: "Antojitos", count: 4 },
    { name: "Platos Fuertes", count: 5 },
    { name: "Sopas y Caldos", count: 2 },
    { name: "Bebidas", count: 3 },
    { name: "Postres", count: 2 }
  ],
  reforma: [
    { name: "Todos", count: 14 },
    { name: "Antojitos", count: 3 },
    { name: "Comida Corrida", count: 4 },
    { name: "Platos Fuertes", count: 3 },
    { name: "Bebidas", count: 3 },
    { name: "Postres", count: 1 }
  ]
};

const MENU_BY_SUCURSAL = {
  // ==========================================================================
  // SUCURSAL: CENTRO HISTÓRICO — menú completo, orientado a turismo/visitas
  // ==========================================================================
  centro: [
    { id: "c001", sucursalId: "centro", name: "Tlayuda Origen", price: 130, category: "Antojitos", description: "Tlayuda tostada con asiento, frijol, quesillo y tasajo.", image: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=600&q=80" },
    { id: "c002", sucursalId: "centro", name: "Memelas surtidas (3 pzas)", price: 95, category: "Antojitos", description: "Memelas de maíz azul con frijol, quesillo y salsa de molcajete.", image: "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=600&q=80" },
    { id: "c003", sucursalId: "centro", name: "Empanadas de amarillo (2 pzas)", price: 85, category: "Antojitos", description: "Empanadas de maíz rellenas de mole amarillo y pollo deshebrado.", image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80" },
    { id: "c004", sucursalId: "centro", name: "Chapulines con limón", price: 70, category: "Antojitos", description: "Botana tradicional de chapulines tostados, servidos con limón.", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=600&q=80" },
    { id: "c005", sucursalId: "centro", name: "Mole negro con pollo", price: 175, category: "Platos Fuertes", description: "Mole negro oaxaqueño tradicional, pierna de pollo y arroz.", image: "https://images.unsplash.com/photo-1633330858414-8e2f8b34b6a4?auto=format&fit=crop&w=600&q=80" },
    { id: "c006", sucursalId: "centro", name: "Tasajo a la parrilla", price: 190, category: "Platos Fuertes", description: "Tasajo asado con guacamole, frijoles de la olla y tortillas hechas a mano.", image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80" },
    { id: "c007", sucursalId: "centro", name: "Estofado de res oaxaqueño", price: 165, category: "Platos Fuertes", description: "Estofado de res con verduras de temporada, servido con arroz.", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80" },
    { id: "c008", sucursalId: "centro", name: "Chiles rellenos de queso", price: 140, category: "Platos Fuertes", description: "Chiles poblanos capeados, rellenos de quesillo, en salsa de jitomate.", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80" },
    { id: "c009", sucursalId: "centro", name: "Mixiotes de pollo", price: 155, category: "Platos Fuertes", description: "Pollo marinado en adobo, cocido al vapor envuelto en papel, con arroz.", image: "https://images.unsplash.com/photo-1625938144755-652e08e359b7?auto=format&fit=crop&w=600&q=80" },
    { id: "c010", sucursalId: "centro", name: "Caldo de gato", price: 110, category: "Sopas y Caldos", description: "Caldo tradicional oaxaqueño con res, papa, garbanzo y hierbabuena.", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80" },
    { id: "c011", sucursalId: "centro", name: "Sopa de guías", price: 105, category: "Sopas y Caldos", description: "Sopa de guías de calabaza con elote, flor de calabaza y masa.", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80" },
    { id: "c012", sucursalId: "centro", name: "Agua de horchata", price: 35, category: "Bebidas", description: "Agua fresca de horchata preparada en casa.", image: "https://images.unsplash.com/photo-1571066811602-716837d681de?auto=format&fit=crop&w=600&q=80" },
    { id: "c013", sucursalId: "centro", name: "Agua de jamaica", price: 35, category: "Bebidas", description: "Agua fresca de jamaica, ligeramente dulce.", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=600&q=80" },
    { id: "c014", sucursalId: "centro", name: "Chocolate de agua oaxaqueño", price: 45, category: "Bebidas", description: "Chocolate tradicional batido, preparado con agua y canela.", image: "https://images.unsplash.com/photo-1517578239113-b03992dcdd25?auto=format&fit=crop&w=600&q=80" },
    { id: "c015", sucursalId: "centro", name: "Nicuatole", price: 55, category: "Postres", description: "Postre tradicional de maíz con canela y grana cochinilla.", image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=600&q=80" },
    { id: "c016", sucursalId: "centro", name: "Buñuelos con miel", price: 50, category: "Postres", description: "Buñuelos crujientes bañados en miel de piloncillo.", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80" }
  ],

  // ==========================================================================
  // SUCURSAL: REFORMA — menú de comida corrida, orientado a clientes frecuentes
  // ==========================================================================
  reforma: [
    { id: "r001", sucursalId: "reforma", name: "Tlayuda sencilla", price: 100, category: "Antojitos", description: "Tlayuda tostada con asiento, frijol y quesillo.", image: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=600&q=80" },
    { id: "r002", sucursalId: "reforma", name: "Quesadillas de flor de calabaza (3 pzas)", price: 75, category: "Antojitos", description: "Quesadillas hechas a mano rellenas de flor de calabaza y quesillo.", image: "https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=600&q=80" },
    { id: "r003", sucursalId: "reforma", name: "Empanadas de mole (2 pzas)", price: 70, category: "Antojitos", description: "Empanadas rellenas de mole rojo y pollo.", image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80" },
    { id: "r004", sucursalId: "reforma", name: "Comida corrida Lunes: Milanesa", price: 85, category: "Comida Corrida", description: "Sopa del día, milanesa de res empanizada, arroz, frijoles y agua fresca.", image: "https://images.unsplash.com/photo-1594221708779-94832f4320d1?auto=format&fit=crop&w=600&q=80" },
    { id: "r005", sucursalId: "reforma", name: "Comida corrida Martes: Pollo a la plancha", price: 85, category: "Comida Corrida", description: "Sopa del día, pollo a la plancha, ensalada, arroz y agua fresca.", image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=600&q=80" },
    { id: "r006", sucursalId: "reforma", name: "Comida corrida Miércoles: Chile relleno", price: 85, category: "Comida Corrida", description: "Sopa del día, chile relleno de queso, arroz, frijoles y agua fresca.", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80" },
    { id: "r007", sucursalId: "reforma", name: "Comida corrida Jueves: Estofado de res", price: 85, category: "Comida Corrida", description: "Sopa del día, estofado de res, arroz, frijoles y agua fresca.", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80" },
    { id: "r008", sucursalId: "reforma", name: "Mole rojo con pollo", price: 150, category: "Platos Fuertes", description: "Mole rojo casero, pierna de pollo y arroz.", image: "https://images.unsplash.com/photo-1633330858414-8e2f8b34b6a4?auto=format&fit=crop&w=600&q=80" },
    { id: "r009", sucursalId: "reforma", name: "Bistec a la mexicana", price: 145, category: "Platos Fuertes", description: "Bistec de res guisado con jitomate, cebolla y chile, con arroz.", image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80" },
    { id: "r010", sucursalId: "reforma", name: "Enchiladas oaxaqueñas (4 pzas)", price: 120, category: "Platos Fuertes", description: "Enchiladas bañadas en salsa de mole, rellenas de pollo.", image: "https://images.unsplash.com/photo-1625938144755-652e08e359b7?auto=format&fit=crop&w=600&q=80" },
    { id: "r011", sucursalId: "reforma", name: "Agua de limón con chía", price: 30, category: "Bebidas", description: "Agua fresca de limón con semillas de chía.", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=600&q=80" },
    { id: "r012", sucursalId: "reforma", name: "Agua de tamarindo", price: 30, category: "Bebidas", description: "Agua fresca de tamarindo preparada en casa.", image: "https://images.unsplash.com/photo-1571066811602-716837d681de?auto=format&fit=crop&w=600&q=80" },
    { id: "r013", sucursalId: "reforma", name: "Café de olla", price: 35, category: "Bebidas", description: "Café de olla endulzado con piloncillo y canela.", image: "https://images.unsplash.com/photo-1517578239113-b03992dcdd25?auto=format&fit=crop&w=600&q=80" },
    { id: "r014", sucursalId: "reforma", name: "Flan casero", price: 45, category: "Postres", description: "Flan napolitano preparado en casa.", image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=600&q=80" }
  ]
};
