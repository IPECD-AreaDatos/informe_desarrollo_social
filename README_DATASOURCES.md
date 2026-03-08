# Fuentes de Datos - Tablero Ministerio de Desarrollo Social

Este documento detalla el origen de los datos para cada uno de los paneles (carteles) visualizados en el tablero principal.

## Metodología General
Todos los indicadores están filtrados dinámicamente por el rango de fechas seleccionado (`from` y `to`). La mayoría de los indicadores se basan en la fecha de inicio del expediente (`e.fecha_inicio`) o en la fecha de entrega del recurso.

---

## 1. KPIs Principales (Cabecera)

### Personas Asistidas
*   **Fuente:** Tablas `expediente_expediente`, `expediente_iniciador` y `expediente_beneficiario`.
*   **Criterio:** Cuenta de DNIs únicos (`DISTINCT b.dni`) que poseen expedientes iniciados en el periodo seleccionado y que están marcados como activos.
*   **Nota:** Se considera el beneficiario final de la asistencia social.

### Inversión Ejecutada
*   **Fuente:** 
    *   `ADM_beneficiariosubsidio`: Subsidios directos otorgados.
    *   `NBI_titular`: Montos asignados a titulares de programas NBI.
*   **Criterio:** Sumatoria de montos (`SUM(monto)`) de subsidios con expedientes iniciados en el periodo + sumatoria de montos de titulares vinculados a personas con expedientes en el periodo.

### Módulos Entregados
*   **Fuente:** Tabla `CDC_modulo`.
*   **Criterio:** Sumatoria de la columna `cantidad` donde `activo = 1` y la fecha de entrega o ingreso está dentro del periodo.

### Pasajes Emitidos
*   **Fuente:** Tabla `CDC_pasaje`.
*   **Criterio:** Sumatoria de las columnas `adultos + menores` para registros activos dentro del periodo.

---

## 2. Gráficos y Desgloses

### Evolución de Inversión Anual
*   **Fuente:** Combinación de `ADM_beneficiariosubsidio` y `NBI_titular`.
*   **Agrupación:** Los montos se agrupan por mes basándose en `DATE_FORMAT(e.fecha_inicio, '%Y-%m')`.

### Logística de Pasajes (Destinos/Salidas)
*   **Fuente:** Tablas `expediente_pasaje`, `expediente_municipio` y `CDC_pasaje`.
*   **Criterio:** Se vincula el pasaje del expediente con el registro de entrega en CDC y se cruza con los nombres de municipios (`descripción`).

### Top Entregas (Ranking de Recursos)
*   **Fuente:** Unión de cuatro flujos:
    1.  `CDC_modulo`: Módulos alimentarios.
    2.  `CDC_pasaje`: Cantidad total de pasajes.
    3.  `CDC_relevamiento_recurso`: Recursos estándar (relevamientos).
    4.  `CDC_relevamiento_recursoextraordinario`: Recursos de emergencia/extraordinarios.

### Demografía (Sexo y Edad)
*   **Fuente:** 
    *   **Edad:** Calculada dinámicamente usando `TIMESTAMPDIFF(YEAR, b.fecha_nacimiento, CURDATE())` de la tabla `expediente_beneficiario`.
    *   **Sexo:** Obtenido de `NBI_persona` (1 = Mujer, 2 = Varón).
*   **Criterio:** Basado en beneficiarios únicos con expedientes en el periodo.

---

## Consultas Técnicas
Las consultas SQL exactas pueden encontrarse en el archivo: `src/lib/services/ministerio.ts`.
