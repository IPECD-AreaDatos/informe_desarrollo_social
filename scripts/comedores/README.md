# ETL Comedores (Opción B)

Script que crea el esquema de tablas de comedores (Opción B) e importa datos desde los Excel de Capital e Interior.

## Requisitos

- Node.js 18+
- Dependencias del proyecto (`npm install`); el script usa `mysql2` y `xlsx` (incluidos en el `package.json`).
- Base MySQL/MariaDB accesible.

## Variables de entorno

Usar las mismas que el resto del proyecto, o definir en `.env`:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DB_HOST` | Host de MySQL | `localhost` o `db` (Docker) |
| `DB_PORT` | Puerto | `3306` |
| `DB_USER` | Usuario | `app` |
| `DB_PASSWORD` | Contraseña | — |
| `DB_NAME` | Base de datos por defecto | `informe` |
| `DB_NAME_COMEDORES` | *(Opcional)* Base solo para comedores | `comedores` |

Si está definida `DB_NAME_COMEDORES`, el script se conecta a esa base; si no, usa `DB_NAME`.

## Uso

### Con Docker (recomendado si usás docker-compose)

Con la base de datos levantada (`docker compose up -d`), ejecutá el ETL en un contenedor que usa la misma red y variables de entorno:

```bash
# Solo crear tablas (sin cargar datos)
docker compose --profile etl run --rm etl --solo-crear

# Crear tablas y cargar datos (Excel en la raíz del proyecto)
docker compose --profile etl run --rm -v $(pwd):/data etl \
  --excel1 "/data/Informe 1. ANEXO II bis. Crudo detalle beneficios Comedores Capital.xlsx" \
  --excel2 "/data/Informe Anexo II Comedores.xlsx" \
  --periodo "Plan Verano 2026"
```

**Por qué `/data/` en las rutas:** Dentro del contenedor el proceso trabaja en `/app` y no ve tu disco directamente. Con `-v $(pwd):/data` la raíz del proyecto (donde están los Excel) se monta **dentro del contenedor** en la carpeta `/data`. Por eso las rutas que recibe el script tienen que ser las del contenedor: `/data/nombre_archivo.xlsx`. En la raíz del proyecto es el mismo archivo; la ruta cambia según quién lee (tu máquina = raíz, contenedor = `/data`).

El servicio `etl` está en el perfil `etl`.

### Sin Docker (Node local)

#### Solo crear tablas (sin cargar datos)

```bash
node scripts/comedores/02_etl_comedores.js --solo-crear
```

Ejecuta `01_schema_comedores.sql` sobre la base configurada.

#### Crear tablas y cargar datos

```bash
node scripts/comedores/02_etl_comedores.js \
  --excel1 "ruta/al/Informe 1. ANEXO II bis. Crudo detalle beneficios Comedores Capital.xlsx" \
  --excel2 "ruta/al/Informe Anexo II Comedores.xlsx" \
  --periodo "Plan Verano 2026"
```

- **`--excel1`**: Excel Capital (FRUTAS Y VERDURAS, CARNE, GAS, ART. DE LIMPIEZA, FUMIGACION).
- **`--excel2`**: Excel Anexo II (hoja PADRON INTERIOR).
- **`--periodo`**: Etiqueta de periodo (ej. `"2026-01"` o `"Plan Verano 2026"`); se guarda en `plan_ref` (Interior) y en `periodo` (Capital).

Si se omite `--excel1` o `--excel2`, se salta la carga de Capital o Interior respectivamente.

## Archivos

- **Borrar tablas para re-ejecutar todo:** desde la raíz del proyecto, con variables de entorno cargadas (ej. `source .env` o export manual):
  ```bash
  mysql -h "${DB_HOST:-localhost}" -P "${DB_PORT:-3306}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME_COMEDORES:-$DB_NAME:-informe}" -e "
  SET FOREIGN_KEY_CHECKS = 0;
  DROP TABLE IF EXISTS BENEFICIO_FRESCOS, BENEFICIO_GAS, BENEFICIO_LIMPIEZA, BENEFICIO_FUMIGACION, RACION, COMEDOR, ZONA, SUBTIPO_COMEDOR, TIPO_COMEDOR, ORGANISMO;
  SET FOREIGN_KEY_CHECKS = 1;
  "
  ```
  Luego volver a ejecutar el ETL con los mismos `--excel1`, `--excel2` y `--periodo`.

- **`01_schema_comedores.sql`**: CREATE TABLE en orden (TIPO_COMEDOR, SUBTIPO_COMEDOR, ORGANISMO, ZONA, COMEDOR, RACION, BENEFICIO_GAS, BENEFICIO_LIMPIEZA, BENEFICIO_FUMIGACION, BENEFICIO_FRESCOS). Se puede ejecutar a mano en MySQL.
- **`02_etl_comedores.js`**: Crea esquema, carga catálogos (TIPO, SUBTIPO), ETL Interior (ZONA + COMEDOR + RACION), ETL Capital (ZONA + COMEDOR + BENEFICIO_*), ETL Padrón Capital (desde excel2: hoja PADRON CAPITAL, actualiza enlace Google Maps y coordenadas en COMEDOR Capital).

## Origen del indicador "Beneficiarios (Interior)"

El número que muestra el tablero en **Beneficiarios (Interior)** sale de:

1. **Excel:** `Informe Anexo II Comedores.xlsx`, hoja **PADRON INTERIOR**.
2. **Columna:** **BENEF** (cantidad de beneficiarios por centro de entrega).
3. **ETL:** Por cada fila del padrón Interior, el script inserta un registro en **RACION** con `cantidad_beneficiarios = valor de BENEF` y `plan_ref = --periodo` del comando.
4. **Consulta:** El tablero hace `SUM(RACION.cantidad_beneficiarios)` solo para comedores cuya **ZONA** tiene `ambito = 'INTERIOR'` y `plan_ref` igual al período elegido.

Es decir: **14.902** (o el valor que veas) es la suma de todos los números de la columna BENEF del padrón Interior correspondientes al período seleccionado. **Beneficiarios (Capital)** usa la misma lógica pero para zonas Capital; hoy las raciones solo se cargan desde el padrón Interior, por eso Capital suele aparecer en 0 hasta que exista una carga de beneficiarios para Capital.

## Referencia

- Plan detallado: [docs/PLAN_OPCION_B_COMEDORES_BD.md](../docs/PLAN_OPCION_B_COMEDORES_BD.md).
- Diagrama: [diagrama_bd_comedores.html](../../diagrama_bd_comedores.html).
