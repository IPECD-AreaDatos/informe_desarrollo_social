# Plan Opción B: Base de datos normalizada Comedores (Seg. Alimentaria)

Esquema unificado alineado al [diagrama_bd_comedores.html](../diagrama_bd_comedores.html), máxima normalización y script único de creación + carga desde Excel.

---

## 1. Principios de normalización aplicados

- **Catálogos en tablas propias:** ZONA, TIPO_COMEDOR, SUBTIPO_COMEDOR, ORGANISMO evitan repetir cadenas y permiten integridad referencial.
- **Una entidad por tabla:** COMEDOR = establecimiento físico; RACION = línea de servicio (comidas/refrigerios) por periodo; cada beneficio (gas, limpieza, etc.) en su tabla con FK a COMEDOR.
- **Claves foráneas explícitas:** Todas las relaciones con FK y orden de CREATE TABLE respetando dependencias (catálogos → COMEDOR → RACION y BENEFICIO_*).
- **Sin datos derivados redundantes:** Totales (beneficiarios, cantidades) se calculan por consulta; se almacenan solo datos de origen.
- **Periodo trazable:** En RACION y tablas BENEFICIO_* se usa `periodo` o `fecha_entrega`/`semana_inicio` para no pisar datos entre cargas.

---

## 2. Orden de dependencias (CREATE TABLE)

```text
1. TIPO_COMEDOR
2. SUBTIPO_COMEDOR  (tipo_id FK opcional → TIPO_COMEDOR)
3. ORGANISMO
4. ZONA
5. COMEDOR          (FK: zona_id, tipo_id, subtipo_id, organismo_id)
6. RACION           (FK: comedor_id)
7. BENEFICIO_GAS    (FK: comedor_id)
8. BENEFICIO_LIMPIEZA (FK: comedor_id)
9. BENEFICIO_FUMIGACION (FK: comedor_id)
10. BENEFICIO_FRESCOS (FK: comedor_id)
```

---

## 3. Definición de tablas (MySQL)

### 3.1 Catálogos

**TIPO_COMEDOR**  
Tipo principal del establecimiento (OFICIAL, SOLIDARIO, INSTITUCIONAL). Se crea antes que SUBTIPO.

- `tipo_id` INT AUTO_INCREMENT PRIMARY KEY
- `nombre` VARCHAR(60) NOT NULL UNIQUE  — 'OFICIAL', 'SOLIDARIO', 'INSTITUCIONAL'

**SUBTIPO_COMEDOR**  
Subtipo institucional (iglesia, ong, etc.) cuando aplica. Depende de TIPO_COMEDOR.

- `subtipo_id` INT AUTO_INCREMENT PRIMARY KEY
- `nombre` VARCHAR(80) NOT NULL UNIQUE  — ej. 'IGLESIA CATOLICA', 'IGLESIA EVANGELICA', 'ONG', 'PRIVADO'
- `tipo_id` INT NULL  — FK a TIPO_COMEDOR (opcional): agrupa subtipos bajo un tipo

**ORGANISMO**  
Organismo que gestiona (Interior: MIN. Y FLIA., ACCION SOCIAL, etc.).

- `organismo_id` INT AUTO_INCREMENT PRIMARY KEY
- `nombre` VARCHAR(100) NOT NULL UNIQUE
- `tipo` VARCHAR(60) NULL

**ZONA**  
Ámbito geográfico/operativo: Capital (Zona I/II/III/NORTE) o Interior (departamento, localidad, centro de distribución).

- `zona_id` INT AUTO_INCREMENT PRIMARY KEY
- `codigo` CHAR(2) NULL  — 'I','II','III','N' para Capital; 'A','C' para Interior
- `nombre` VARCHAR(60) NULL  — ej. 'ZONA I (CAPITAL)', 'Alvear'
- `ambito` ENUM('CAPITAL','INTERIOR') NOT NULL
- `departamento` VARCHAR(80) NULL
- `localidad` VARCHAR(80) NULL
- `centro_distribucion` VARCHAR(150) NULL  
Índice: `UNIQUE(ambito, codigo, departamento(50), localidad(50), centro_distribucion(80))` para evitar duplicados al insertar desde Excel.

### 3.2 Núcleo

**COMEDOR**  
Un registro por establecimiento (centro de entrega en Interior; comedor con Nº en Capital).

- `comedor_id` INT AUTO_INCREMENT PRIMARY KEY
- `numero_oficial` VARCHAR(10) NULL  — Capital: Nº COMEDOR; Interior: NULL
- `nombre` VARCHAR(120) NOT NULL
- `domicilio` VARCHAR(200) NULL
- `coordenadas_lat` DECIMAL(9,6) NULL
- `coordenadas_lng` DECIMAL(9,6) NULL
- `link_google_maps` TEXT NULL
- `zona_id` INT NOT NULL, FOREIGN KEY (zona_id) REFERENCES ZONA(zona_id)
- `tipo_id` INT NULL, FOREIGN KEY (tipo_id) REFERENCES TIPO_COMEDOR(tipo_id)
- `subtipo_id` INT NULL, FOREIGN KEY (subtipo_id) REFERENCES SUBTIPO_COMEDOR(subtipo_id)
- `organismo_id` INT NULL, FOREIGN KEY (organismo_id) REFERENCES ORGANISMO(organismo_id)
- `responsable_nombre` VARCHAR(120) NULL
- `responsable_dni` VARCHAR(15) NULL
- `telefono` VARCHAR(30) NULL
- `activo` TINYINT(1) DEFAULT 1
- `fecha_alta` DATE NULL
- `observaciones` TEXT NULL  
Índice: UNIQUE(numero_oficial) donde numero_oficial IS NOT NULL; INDEX(zona_id), INDEX(tipo_id).

### 3.3 Raciones (Interior: una fila por línea Excel)

**RACION**

- `racion_id` INT AUTO_INCREMENT PRIMARY KEY
- `comedor_id` INT NOT NULL, FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE
- `tipo_servicio` ENUM('COMIDA','REFRIGERIO','AMBOS') NOT NULL  — mapeo de DETALLE SERV.
- `cantidad_beneficiarios` INT NULL  — BENEF o st según fila
- `periodo_inicio` DATE NULL
- `periodo_fin` DATE NULL
- `plan_ref` VARCHAR(30) NULL  — ej. 'Plan Verano 2026'
- `st` DECIMAL(10,2) NULL  — valor numérico st del Excel
- `observaciones` TEXT NULL  
Índice: INDEX(comedor_id), INDEX(plan_ref), INDEX(periodo_inicio).

### 3.4 Beneficios (Capital: una fila por comedor por periodo/corte)

**BENEFICIO_GAS**

- `gas_id` INT AUTO_INCREMENT PRIMARY KEY
- `comedor_id` INT NOT NULL, FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE
- `garrafas_10kg` INT DEFAULT 0
- `garrafas_15kg` INT DEFAULT 0
- `garrafas_45kg` INT DEFAULT 0
- `periodo` VARCHAR(20) NULL  — ej. '2026-01', 'Plan Verano 2026'
- `fecha_entrega` DATE NULL
- `proveedor` VARCHAR(80) NULL
- `nro_vale` VARCHAR(30) NULL  
Índice: INDEX(comedor_id), INDEX(periodo).

**BENEFICIO_LIMPIEZA**

- `limp_id` INT AUTO_INCREMENT PRIMARY KEY
- `comedor_id` INT NOT NULL, FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE
- `lavandina_4lt` INT DEFAULT 0
- `detergente_45lt` INT DEFAULT 0
- `desengrasante_5lt` INT DEFAULT 0
- `trapo_piso` INT DEFAULT 0
- `trapo_rejilla` INT DEFAULT 0
- `virulana` INT DEFAULT 0
- `esponja` INT DEFAULT 0
- `escobillon` INT DEFAULT 0
- `escurridor` INT DEFAULT 0
- `periodo` VARCHAR(20) NULL
- `fecha_entrega` DATE NULL  
Índice: INDEX(comedor_id), INDEX(periodo).

**BENEFICIO_FUMIGACION**

- `fumig_id` INT AUTO_INCREMENT PRIMARY KEY
- `comedor_id` INT NOT NULL, FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE
- `periodo` VARCHAR(20) NULL
- `fecha_realizacion` DATE NULL
- `proveedor` VARCHAR(80) NULL
- `resultado` TEXT NULL  
Índice: INDEX(comedor_id), INDEX(periodo).

**BENEFICIO_FRESCOS**  
Incluye frutas/verduras y carne en una sola tabla (como en el diagrama).

- `frescos_id` INT AUTO_INCREMENT PRIMARY KEY
- `comedor_id` INT NOT NULL, FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE
- `cebolla_kg` DECIMAL(6,2) DEFAULT 0
- `zanahoria_kg` DECIMAL(6,2) DEFAULT 0
- `zapallo_kg` DECIMAL(6,2) DEFAULT 0
- `papa_kg` DECIMAL(6,2) DEFAULT 0
- `acelga_kg` DECIMAL(6,2) DEFAULT 0
- `frutas_unidades` INT DEFAULT 0
- `carne_vacuna_kg` DECIMAL(6,2) DEFAULT 0
- `pollo_kg` DECIMAL(6,2) DEFAULT 0
- `cerdo_kg` DECIMAL(6,2) DEFAULT 0
- `periodo` VARCHAR(20) NULL
- `semana_inicio` DATE NULL
- `proveedor` VARCHAR(80) NULL  
Índice: INDEX(comedor_id), INDEX(periodo).

---

## 4. Mapeo Excel → tablas

- **Padrón Interior (Anexo II):** Cada fila → 1 ZONA (por codigo + departamento + localidad + centro_distribucion), 1 COMEDOR (centro_entrega + direccion + telefono, organismo_id), 1 RACION (tipo_servicio COMIDA/REFRIGERIO, cantidad_beneficiarios, st, plan_ref, periodo).
- **Capital (Excel 1):** FRUTAS Y VERDURAS / CARNE → ZONA (ambito CAPITAL, codigo I/II/III/N), COMEDOR (numero_oficial, nombre, domicilio, zona_id, tipo_id/subtipo_id desde DEPENDENCIA, responsable_*). Luego por hoja: FUMIGACION → BENEFICIO_FUMIGACION; ART. DE LIMPIEZA → BENEFICIO_LIMPIEZA; FRUTAS Y VERDURAS → BENEFICIO_FRESCOS (sin carne); CARNE → BENEFICIO_FRESCOS (solo kg carne) o misma fila FRESCOS; GAS → BENEFICIO_GAS. Todas con mismo `periodo` (parámetro de carga).
- **DEPENDENCIA (Excel)** → normalizar a TIPO_COMEDOR + SUBTIPO_COMEDOR: 'COMEDOR OFICIAL' → tipo OFICIAL; 'COMEDOR SOLIDARIO' → SOLIDARIO; 'COMEDOR INSTITUCIONAL: IGLESIA EVANGELICA' → tipo INSTITUCIONAL, subtipo IGLESIA EVANGELICA; etc.

---

## 5. Script único: creación + inserción

Objetivo: un solo script que (1) cree el esquema si no existe y (2) inserte datos desde los dos Excel.

### 5.1 Estructura del script

- **Lenguaje:** Node.js (ya en el proyecto) con librería de lectura Excel (ej. `xlsx`) y cliente MySQL (`mysql2`).
- **Entrada:**  
  - Ruta Excel 1 (Capital), ruta Excel 2 (Anexo II Interior).  
  - Parámetro `periodo` (ej. `"2026-01"` o `"Plan Verano 2026"`).  
  - Opcional: `--solo-crear` para ejecutar solo los CREATE TABLE (sin ETL).

### 5.2 Fases

1. **Crear esquema**  
   - Ejecutar en orden: CREATE TABLE para SUBTIPO_COMEDOR, TIPO_COMEDOR, ORGANISMO, ZONA, COMEDOR, RACION, BENEFICIO_GAS, BENEFICIO_LIMPIEZA, BENEFICIO_FUMIGACION, BENEFICIO_FRESCOS (con IF NOT EXISTS o en una DB dedicada tipo `comedores` para no mezclar con expedientes).

2. **Cargar catálogos**  
   - INSERT de TIPO_COMEDOR (OFICIAL, SOLIDARIO, INSTITUCIONAL).  
   - INSERT de SUBTIPO_COMEDOR (IGLESIA CATOLICA, IGLESIA EVANGELICA, ONG, etc.) a partir de valores únicos extraídos del Excel o lista fija.  
   - ORGANISMO: insertar valores únicos leídos del Padrón Interior (MIN. Y FLIA., ACCION SOCIAL, etc.).

3. **ETL Interior**  
   - Leer hoja PADRON INTERIOR.  
   - Por cada fila de datos: resolver o insertar ZONA (ambito INTERIOR, codigo, departamento, localidad, centro_distribucion); resolver o insertar COMEDOR (nombre = centro_entrega, domicilio = direccion, telefono, zona_id, organismo_id); INSERT RACION (comedor_id, tipo_servicio, cantidad_beneficiarios, st, plan_ref, periodo).

4. **ETL Capital**  
   - Leer FRUTAS Y VERDURAS (o CARNE) para construir lista de comedores y zona actual (ZONA I/II/III/NORTE).  
   - Insertar ZONA para I, II, III, NORTE (ambito CAPITAL) si no existen.  
   - Por cada fila de datos: resolver o insertar COMEDOR (numero_oficial, nombre, domicilio, zona_id, tipo_id, subtipo_id desde DEPENDENCIA, responsable desde hoja).  
   - Leer FUMIGACION, ART. DE LIMPIEZA, FRUTAS Y VERDURAS, CARNE, GAS; por cada fila resolver comedor_id por numero_oficial e INSERT en la tabla BENEFICIO_* correspondiente con `periodo`.

5. **Unificación CARNE + FRUTAS_VERDURAS**  
   - En Capital, FRUTAS Y VERDURAS y CARNE pueden compartir la misma fila de BENEFICIO_FRESCOS (mismo comedor_id y periodo): una lectura que cruce por Nº COMEDOR y actualice o inserte una sola fila con kg verduras + kg carne.

### 5.3 Ubicación y uso sugerido

- `scripts/comedores/`  
  - `01_schema_comedores.sql` — solo CREATE TABLE (opcional, para ejecutar a mano en MySQL).  
  - `02_etl_comedores.js` (o `.ts`) — lee Excel, crea tablas si se indica, inserta catálogos y datos (Interior + Capital) con parámetro `periodo`.  
- Ejecución: `node scripts/comedores/02_etl_comedores.js --excel1 "Informe 1. ANEXO II bis....xlsx" --excel2 "Informe Anexo II Comedores.xlsx" --periodo "Plan Verano 2026"`  
- Conexión DB: reutilizar variables de entorno del proyecto (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME); si se usa base distinta para comedores, añadir ej. `DB_NAME_COMEDORES=comedores`.

---

## 6. Consultas objetivo (dividir interior/exterior y recursos por establecimiento)

- **Interior por localidad:** `SELECT Z.localidad, Z.departamento, COUNT(DISTINCT C.comedor_id), SUM(R.cantidad_beneficiarios) FROM COMEDOR C JOIN ZONA Z ON C.zona_id = Z.zona_id JOIN RACION R ON R.comedor_id = C.comedor_id WHERE Z.ambito = 'INTERIOR' AND R.plan_ref = ? GROUP BY Z.localidad, Z.departamento`.
- **Capital por zona:** `SELECT Z.nombre, COUNT(DISTINCT C.comedor_id) FROM COMEDOR C JOIN ZONA Z ON C.zona_id = Z.zona_id WHERE Z.ambito = 'CAPITAL' GROUP BY Z.zona_id`.
- **Recursos por comedor:** JOIN COMEDOR con cada BENEFICIO_* por comedor_id y periodo; listar columnas de cantidades (gas, limpieza, frescos, fumigación).

---

## 7. Resumen de tareas (todas para implementar)

1. Escribir `01_schema_comedores.sql` con todos los CREATE TABLE en el orden indicado.  
2. Implementar `02_etl_comedores.js`: conexión MySQL, creación de tablas (o ejecución del SQL), carga de catálogos, ETL Interior (ZONA + COMEDOR + RACION), ETL Capital (ZONA + COMEDOR + BENEFICIO_*), unificación periodo y manejo de Nº COMEDOR S/N.  
3. Documentar en README o en este plan el comando exacto y las variables de entorno para ejecutar el script.  
4. (Opcional) Añadir tests o chequeos de integridad (conteos por tabla, existencia de FKs) al final del script.

Este documento queda como plan de referencia para la Opción B; la implementación concreta (archivos `.sql` y `.js`) se genera en los siguientes pasos.
