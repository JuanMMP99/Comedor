const CONFIG = {
  // URL de Google Apps Script de tu implementación pública (Paso 5 de las instrucciones)
  API_URL: 'https://script.google.com/macros/s/AKfycbxYPCwzvucspKZOdy7sS6Z6giWp1LScaNDeQLW0tnMQLpw036Djk6RdeUSz-fh-RyDw/exec',

  restaurantName: "Comedor Origen",

  // Nombre del programa de puntos que se muestra en la UI (sustituye "Puntos florería")
  loyaltyLabel: "Puntos Origen",

  // --- SUCURSALES -----------------------------------------------------------
  // Cada sucursal tiene su propio menú (ver MENU_BY_SUCURSAL en catalog.js).
  // El "id" debe coincidir exactamente entre constants.js y catalog.js.
  sucursales: [
    {
      id: "centro",
      nombre: "Centro Histórico",
      direccion: "García Vigil 210, Centro Histórico, 68000 Oaxaca de Juárez, Oax.",
      telefono: "529511002233",
      horario: "Todos los días: 9:00 AM – 9:00 PM"
    },
    {
      id: "reforma",
      nombre: "Reforma",
      direccion: "Calz. Niños Héroes 450, Col. Reforma, 68050 Oaxaca de Juárez, Oax.",
      telefono: "529511004455",
      horario: "Todos los días: 9:00 AM – 9:00 PM"
    }
  ],

  business: {
    name: "Comedor Origen",
    socials: {
      facebook: "https://facebook.com",
      instagram: "https://instagram.com",
      twitter: "https://x.com"
    }
  },

  topAlert: {
    text: "🌽 ¡Bienvenido! Acumula puntos por cada $100 MXN de compra y úsalos como dinero real."
  },

  navbar: {
    links: [
      { name: "Menú", url: "#menu" },
      { name: "Sucursales", url: "#sucursales" },
      { name: "Cómo Ordenar", url: "#como-funciona" },
      { name: "Preguntas", url: "#faq" }
    ],
    ctaText: "Ordenar Ahora"
  },

  hero: {
    title: "Sabor de Oaxaca, preparado como en casa",
    subtitle: "Cocina tradicional oaxaqueña con ingredientes frescos, todos los días, en tu sucursal más cercana",
    ctaText: "Ver Menú Completo",
    image: "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=80"
  },

  howItWorks: {
    title: "Cómo realizar tu pedido",
    subtitle: "Tres sencillos pasos para disfrutar tu comida favorita",
    ctaText: "Iniciar Pedido",
    steps: [
      {
        number: "1",
        icon: "bi-shop",
        title: "Elige tu sucursal",
        description: "Selecciona la sucursal donde quieres ordenar; cada una tiene su propio menú y precios."
      },
      {
        number: "2",
        icon: "bi-card-checklist",
        title: "Arma tu pedido",
        description: "Explora el menú, agrega tus platillos favoritos y elige recoger en sucursal o envío a domicilio."
      },
      {
        number: "3",
        icon: "bi-bag-check",
        title: "Confírmalo",
        description: "Programa fecha y hora de entrega o recolección y listo, nosotros preparamos todo fresco."
      }
    ]
  },

  customBouquet: {
    title: "¿Organizas un evento o quieres un pedido grande?",
    subtitle: "Armamos menús especiales para grupos, oficinas y celebraciones. Cuéntanos qué necesitas y lo cotizamos.",
    options: [
      "Elige entre nuestros platillos fuertes, antojitos y postres",
      "Arma un menú por persona o por plato para compartir",
      "Indícanos fecha, hora y número de comensales",
      "Nos adaptamos al presupuesto que necesites"
    ],
    ctaText: "Cotizar Pedido para Grupo"
  },

  faqs: [
    {
      question: "¿Cuáles son las zonas de envío gratis?",
      answer: "El envío es gratuito en compras seleccionadas dentro de la zona cercana a cada sucursal."
    },
    {
      question: "¿Puedo pedir entregas para el mismo día?",
      answer: "Sí, contamos con entregas el mismo día. Te sugerimos realizar tu orden con anticipación para asegurar disponibilidad de horario."
    },
    {
      question: "¿Cuáles son las formas de pago?",
      answer: "Aceptamos pago en efectivo (al recoger o contra entrega según zona) y transferencia bancaria directa."
    },
    {
      question: "¿Cómo funciona el Programa de Puntos?",
      answer: "Por cada $100 MXN de compra acumulas 1 Punto. Cada punto equivale a $1 MXN de descuento directo en tus siguientes pedidos."
    }
  ]
};
