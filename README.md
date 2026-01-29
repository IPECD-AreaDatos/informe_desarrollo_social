# Monitor de Impacto Social - IPECD

Este proyecto es un Dashboard Interactivo diseñado para visualizar la gestión social del IPECD.

## Estructura del Proyecto

```
informe_desarrollo_social/
├── dashboard/
│   └── index.html      # El Dashboard completo (Single File Application)
├── files/              # Fuente de datos original (Excel)
└── README.md
```

## Instrucciones

1.  Abrir `dashboard/index.html` en cualquier navegador moderno (Chrome, Edge, Firefox).
2.  No requiere instalación ni servidor web (funciona localmente).

## Características Implementadas

*   **Diseño Responsivo (Mobile-First)**: Adaptado para celulares y escritorios.
*   **Estética IPECD**: Uso de paleta de colores institucional (Verde #2E7D32, Gris #455A64).
*   **Gráficos Interactivos**: Chart.js integrado para visualización de localidades, género y edades.
*   **Datos Enero 2026**: Pre-cargados según el reporte ejecutivo.
*   **Auditoría y Búsqueda**: Módulos simulados para demostración de valor (Nota Técnica incluida).

## Próximos Pasos (Hoja de Ruta)

Para llevar este prototipo a producción:
1.  **Backend**: Crear una API (Python/Node.js) que lea los archivos de `files/` dinámicamente.
2.  **Base de Datos**: Migrar los Excel a una base de datos SQL para búsquedas en tiempo real.
3.  **Autenticación**: Agregar login para agentes del IPECD.