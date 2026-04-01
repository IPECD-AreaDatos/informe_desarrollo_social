# Guía de indicadores del tablero de Seguridad Alimentaria

Este documento explica **qué muestra cada número o gráfico** del tablero, **de dónde sale el dato** (qué archivo y hoja de Excel) y **cómo se calcula**, en un lenguaje sencillo para que cualquier persona pueda entenderlo.

> Nota de transición visual (marzo): la pantalla ya fue renombrada a **Seguridad alimentaria** y está orientada a **montos**. Los datos de marzo se cargan en un módulo nuevo de tablas `PRESUPUESTO_*` para no mezclar métricas de cantidad histórica con presupuesto.

## Carga de marzo (módulo de montos)

Los archivos de `docs/marzo` se procesan por ETL y se guardan así:

- `ART DE LIMPIEZA.xlsx` -> rubro `otros_recursos/limpieza` (monto total + conteos + combo de ítems).
- `Presupuesto 2026 Fumigación.xlsx` -> rubro `otros_recursos/fumigacion` (monto + nómina por dependencia).
- `Seguridad Alimentaria Presupuesto 2026.xlsx` -> rubro `otros_recursos/gas` (monto + desglose 10/15/45kg).
- `PRODUCTOS FRESCOS.xlsx` -> rubros `refrigerio_comida/frutas_verduras` y `carnes/carne` (cantidades por ítem + monto de control).
- `TEKNOFOOD.xlsx` -> rubro `monto_invertido/teknofood` y tabla específica `PRESUPUESTO_TEKNOFOOD` (raciones, precio unitario, diario/mensual/anual).

Montos de control cargados para reconciliación:

- Limpieza: `13.311.798,00`
- Fumigación: `2.600.000,00`
- Gas: `11.570.000,00`
- Frutas y verduras: `107.989.875,733`
- Carnes: `137.123.110,80`

---

## Archivos de Excel que alimentan el tablero

El sistema usa **dos archivos Excel**:

| Archivo | Contenido principal |
|--------|----------------------|
| **Informe 1. ANEXO II bis. Crudo detalle beneficios Comedores Capital.xlsx** | Datos de comedores de **Capital**: gas, limpieza, fumigación, frutas/verduras, carne. |
| **Informe Anexo II Comedores.xlsx** | Padrones de **Interior** y **Capital**: centros de entrega, beneficiarios, y en el padrón Capital también enlaces a Google Maps y coordenadas. |

Los datos se cargan en la base de datos mediante un proceso (ETL) que se ejecuta con un período, por ejemplo *"Plan Verano 2026"*. El **selector de período** en el tablero filtra todos los indicadores según ese período.

---

## 1. Total comedores

**Qué es:** Cantidad total de comedores registrados (Capital + Interior).

**De dónde sale:**  
- **Capital:** Se crean comedores a partir del archivo *Informe 1. ANEXO II bis...*, hojas **FRUTAS Y VERDURAS** y **CARNE**. Cada fila con número de comedor, nombre y domicilio (y zona al inicio de cada bloque) da lugar a un comedor.  
- **Interior:** Se crean comedores a partir del archivo *Informe Anexo II Comedores.xlsx*, hoja **PADRON INTERIOR**. Cada fila con centro de entrega, dirección, departamento y localidad da lugar a un comedor (asociado a una zona del Interior).

**Cálculo:** Se cuenta la cantidad de comedores distintos en la base de datos. No depende del período seleccionado para este total.

---

## 2. Raciones

**Qué es:** Cantidad de “raciones” o registros de servicio (comida, refrigerio o ambos) cargados para el período elegido.

**De dónde sale:**  
- **Excel:** *Informe Anexo II Comedores.xlsx*  
- **Hoja:** **PADRON INTERIOR**  
- **Lógica:** Cada **fila** del padrón Interior (cada centro de entrega con datos válidos) se carga como **un registro de ración** en la base de datos, asociado al comedor correspondiente y al período con el que se ejecutó la carga.

**Cálculo:** Se cuenta cuántos registros de ración existen con el período seleccionado. Una ración = un centro de entrega del Interior en ese período.

---

## 3. Beneficiarios (Interior)

**Qué es:** Total de personas beneficiarias que figuran en el padrón del **Interior** para el período seleccionado.

**De dónde sale:**  
- **Excel:** *Informe Anexo II Comedores.xlsx*  
- **Hoja:** **PADRON INTERIOR**  
- **Columna:** **BENEF** (cantidad de beneficiarios por centro de entrega).

**Cálculo:** Por cada fila del padrón Interior se guarda el número de la columna BENEF en el registro de ración. En el tablero se **suman** todos esos números de las raciones del Interior que corresponden al período elegido.  
Es decir: el indicador es la **suma de la columna BENEF** del padrón Interior para ese período.

---

## 4. Gas (kg eq.)

**Qué es:** Cantidad total de gas en garrafas, expresada en **kilogramos equivalentes** (según el tamaño de la garrafa: 10 kg, 15 kg o 45 kg).

**De dónde sale:**  
- **Excel:** *Informe 1. ANEXO II bis. Crudo detalle beneficios Comedores Capital.xlsx*  
- **Hoja:** **GAS**  
- **Columnas:** Las que indican cantidades de garrafas de **10 kg**, **15 kg** y **45 kg** (los nombres exactos pueden variar, pero el sistema detecta columnas que contienen “10”, “15”, “45” y “GAS” o “GARRAFA”).

**Cálculo:** Para cada comedor se suman:  
`(garrafas de 10 kg × 10) + (garrafas de 15 kg × 15) + (garrafas de 45 kg × 45)`.  
Luego se suman esos totales de todos los comedores para el período seleccionado. El resultado se muestra en “kg eq.” (kilogramos equivalentes).

---

## 5. Limpieza (un.)

**Qué es:** Cantidad total de **unidades** de artículos de limpieza entregados (lavandina, detergente, trapos, esponjas, etc.).

**De dónde sale:**  
- **Excel:** *Informe 1. ANEXO II bis. Crudo detalle beneficios Comedores Capital.xlsx*  
- **Hoja:** **ART. DE LIMPIEZA** (o similar con “LIMPIEZA” y “ART”)  
- **Columnas:** Las que corresponden a cada producto, por ejemplo: lavandina, detergente, desengrasante, trapo piso, trapo rejilla, virulana, esponja, escobillón, escurridor (los nombres pueden variar; el sistema busca por palabras clave).

**Cálculo:** Se suman todas las cantidades de todos los artículos de limpieza de todos los comedores para el período seleccionado. El número que ves es el **total de unidades** (un.).

---

## 6. Frescos (kg)

**Qué es:** Cantidad total de **kilogramos** de productos frescos (verduras, frutas y carnes) entregados.

**De dónde sale:**  
- **Excel:** *Informe 1. ANEXO II bis. Crudo detalle beneficios Comedores Capital.xlsx*  
- **Hojas:** **FRUTAS Y VERDURAS** (cebolla, zanahoria, zapallo, papa, acelga, frutas en unidades) y **CARNE** (carne vacuna, pollo, cerdo, en kg).  
- **Columnas:** Las celdas con los kg (o unidades en el caso de frutas) por producto.

**Cálculo:** Se suman todos los kg de verduras, frutas (convertidas o contabilizadas según diseño) y carnes de todos los comedores para el período seleccionado. El indicador se muestra en **kg**.

---

## 7. Ración por tipo de servicio

**Qué es:** Cuántas raciones hay de cada **tipo**: solo comida, solo refrigerio, o ambos (comida + refrigerio).

**De dónde sale:**  
- **Excel:** *Informe Anexo II Comedores.xlsx*  
- **Hoja:** **PADRON INTERIOR**  
- **Columna:** **DETALLE SERV.** (o “DETALLE SERV”). Ahí suele decir si el servicio es “Comida”, “Refrigerio” o “Ambos”.

**Cálculo:** Al cargar cada fila del padrón Interior, se interpreta el texto de DETALLE SERV. y se guarda como tipo de servicio (COMIDA, REFRIGERIO o AMBOS). En el tablero se **cuenta** cuántas raciones hay de cada tipo para el período elegido y se muestran en barras o porcentajes.

---

## 8. Desglose de recursos

**Qué es:** El mismo tipo de información que los indicadores de Gas, Limpieza y Frescos, pero **desglosado por ítem** (por ejemplo: garrafas de 10, 15 y 45 kg; cada artículo de limpieza; cada tipo de verdura o carne).

**De dónde sale:**  
- **Gas:** Hoja **GAS** del archivo de Capital; columnas de garrafas 10 kg, 15 kg y 45 kg.  
- **Limpieza:** Hoja **ART. DE LIMPIEZA** del archivo de Capital; columnas de cada producto.  
- **Frescos:** Hojas **FRUTAS Y VERDURAS** y **CARNE** del archivo de Capital; columnas de cada producto (cebolla, zanahoria, zapallo, papa, acelga, frutas, carne vacuna, pollo, cerdo).

**Cálculo:** Se suman las cantidades **por producto** (o por tipo de garrafa) en todo el período seleccionado. Así ves, por ejemplo, “cuántas garrafas de 10 kg en total” o “cuántos kg de cebolla en total”.

---

## 9. Comedores por zona (Capital)

**Qué es:** Cuántos comedores hay en cada **zona** de Capital (por ejemplo Zona I, Zona II, Zona III, Zona Norte).

**De dónde sale:**  
- **Excel:** *Informe 1. ANEXO II bis...*  
- **Hojas:** **FRUTAS Y VERDURAS** y **CARNE**. Al inicio de cada bloque de filas suele aparecer el nombre de la zona (ej. “ZONA I (CAPITAL)”). Cada comedor (fila) queda asociado a esa zona.

**Cálculo:** Se cuenta cuántos comedores distintos hay por cada zona de Capital. El gráfico muestra la cantidad por zona.

---

## 10. Comedores por departamento / localidad (Interior)

**Qué es:** Cuántos comedores hay en cada **departamento** y **localidad** del Interior.

**De dónde sale:**  
- **Excel:** *Informe Anexo II Comedores.xlsx*  
- **Hoja:** **PADRON INTERIOR**  
- **Columnas:** **DEPARTAMENTO** y **LOCALIDAD**.

**Cálculo:** Cada fila del padrón Interior tiene departamento y localidad. Al cargar, cada comedor queda asociado a una zona que tiene ese departamento y localidad. En el tablero se **cuenta** cuántos comedores hay por cada par (departamento, localidad) y se muestran los principales (por ejemplo los 15 con más comedores).

---

## 11. Rankings (tabla)

**Qué es:** Listado de comedores ordenados de mayor a menor según distintos criterios: quién recibe más beneficiarios, más gas, más limpieza, más frescos, o por responsable (cuántos comedores tiene cada responsable).

**De dónde sale:**  
- **Beneficiarios:** Suma de la columna **BENEF** por comedor (PADRON INTERIOR, mismo origen que “Beneficiarios (Interior)”).  
- **Gas:** Suma de kg equivalentes de gas por comedor (hoja **GAS**, archivo Capital).  
- **Limpieza:** Suma de unidades de artículos de limpieza por comedor (hoja **ART. DE LIMPIEZA**, archivo Capital).  
- **Frescos:** Suma de kg de frescos por comedor (hojas **FRUTAS Y VERDURAS** y **CARNE**, archivo Capital).  
- **Responsables:** Comedores agrupados por responsable; el nombre del responsable sale de hojas del archivo Capital que tengan columna **RESPONSABLE** (por ejemplo FUMIGACIÓN o GAS).

**Cálculo:** Para cada comedor se calcula el total del indicador elegido (beneficiarios, gas, limpieza, frescos) o se cuenta cuántos comedores tiene cada responsable. La tabla muestra los primeros N (por ejemplo 50) ordenados de mayor a menor.

---

## 12. Detalle del comedor (al hacer clic en una fila del ranking)

**Qué es:** Ficha de un comedor con nombre, dirección, zona, tipo/organismo, contacto, beneficiarios (si aplica), **ubicación** (mapa y enlace a Google Maps) y **recursos** desglosados: limpieza, frescos, gas y fumigación.

**De dónde sale:**  
- **Datos básicos (nombre, domicilio, zona, departamento, localidad, tipo, organismo, responsable, teléfono):**  
  - Interior: **PADRON INTERIOR** (columnas CENTRO DE ENTREGA, DIRECCIÓN, ZONA, DEPARTAMENTO, LOCALIDAD, ORGANISMO; responsable/teléfono si existen).  
  - Capital: hojas **FRUTAS Y VERDURAS** y **CARNE** (nombre, domicilio, zona) y hojas como **FUMIGACIÓN** o **GAS** (RESPONSABLE, DNI, DEPENDENCIA cuando existen).  
- **Ubicación (mapa y enlace):**  
  - **Excel:** *Informe Anexo II Comedores.xlsx*  
  - **Hoja:** **PADRON CAPITAL**  
  - **Columnas:** **ENLACE GOOGLE MAPS** (o “ENLANCE GOOGLE MAPS”) y **COORDENADAS** (latitud y longitud en una sola celda, por ejemplo "lat, lng").  
  Solo aplica a comedores de Capital; si hay datos, en el detalle se muestra el mapa y el link “Abrir en Google Maps”.  
- **Beneficiarios:** Suma de **BENEF** para ese comedor en el período (PADRON INTERIOR).  
- **Recursos (limpieza, frescos, gas, fumigación):** Las mismas hojas del archivo de Capital (ART. DE LIMPIEZA, FRUTAS Y VERDURAS, CARNE, GAS, FUMIGACIÓN) asociadas a ese comedor y al período.

**Cálculo:** Se consulta en la base de datos todo lo guardado para ese comedor (datos del comedor, zona, beneficios del período) y se muestra en la ficha. El mapa se arma con las coordenadas; el enlace es el que viene en ENLACE GOOGLE MAPS.

---

## Resumen rápido (archivo → hoja → indicador)

| Indicador | Archivo | Hoja(s) | Columna(s) / origen |
|-----------|---------|---------|----------------------|
| Total comedores | Ambos | PADRON INTERIOR; FRUTAS Y VERDURAS, CARNE (Capital) | Cada fila = un comedor |
| Raciones | Anexo II | PADRON INTERIOR | Cada fila = una ración |
| Beneficiarios (Interior) | Anexo II | PADRON INTERIOR | BENEF |
| Gas (kg eq.) | Capital (Anexo II bis) | GAS | Garrafas 10 / 15 / 45 kg |
| Limpieza (un.) | Capital | ART. DE LIMPIEZA | Lavandina, detergente, trapos, etc. |
| Frescos (kg) | Capital | FRUTAS Y VERDURAS, CARNE | Cebolla, zanahoria, zapallo, papa, acelga, frutas, carnes |
| Ración por tipo | Anexo II | PADRON INTERIOR | DETALLE SERV. |
| Comedores por zona (Capital) | Capital | FRUTAS Y VERDURAS, CARNE | Zona al inicio del bloque |
| Comedores por depto/localidad | Anexo II | PADRON INTERIOR | DEPARTAMENTO, LOCALIDAD |
| Ubicación (mapa/enlace) | Anexo II | PADRON CAPITAL | ENLACE GOOGLE MAPS, COORDENADAS |

Si necesitás más detalle sobre algún indicador o sobre cómo se ejecuta la carga de datos, podés consultar también el archivo `scripts/comedores/README.md` del proyecto.
