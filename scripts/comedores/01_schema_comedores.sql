-- Esquema Opción B: Comedores (Seg. Alimentaria)
-- Orden: catálogos → COMEDOR → RACION → BENEFICIO_*
-- Ejecutar sobre la base deseada (ej. USE comedores; o USE informe;)

-- 1. TIPO_COMEDOR
CREATE TABLE IF NOT EXISTS TIPO_COMEDOR (
  tipo_id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE
);

-- 2. SUBTIPO_COMEDOR
CREATE TABLE IF NOT EXISTS SUBTIPO_COMEDOR (
  subtipo_id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  tipo_id INT NULL,
  FOREIGN KEY (tipo_id) REFERENCES TIPO_COMEDOR(tipo_id)
);

-- 3. ORGANISMO
CREATE TABLE IF NOT EXISTS ORGANISMO (
  organismo_id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  tipo VARCHAR(60) NULL
);

-- 4. ZONA
CREATE TABLE IF NOT EXISTS ZONA (
  zona_id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(10) NULL,
  nombre VARCHAR(60) NULL,
  ambito ENUM('CAPITAL','INTERIOR') NOT NULL,
  departamento VARCHAR(80) NULL,
  localidad VARCHAR(80) NULL,
  centro_distribucion VARCHAR(150) NULL,
  UNIQUE KEY unique_zona (ambito, codigo, departamento(50), localidad(50), centro_distribucion(80))
);

-- 5. COMEDOR
CREATE TABLE IF NOT EXISTS COMEDOR (
  comedor_id INT AUTO_INCREMENT PRIMARY KEY,
  numero_oficial VARCHAR(10) NULL,
  nombre VARCHAR(200) NOT NULL,
  domicilio VARCHAR(200) NULL,
  coordenadas_lat DECIMAL(9,6) NULL,
  coordenadas_lng DECIMAL(9,6) NULL,
  link_google_maps TEXT NULL,
  zona_id INT NOT NULL,
  tipo_id INT NULL,
  subtipo_id INT NULL,
  organismo_id INT NULL,
  responsable_nombre VARCHAR(200) NULL,
  responsable_dni VARCHAR(15) NULL,
  telefono VARCHAR(200) NULL,
  activo TINYINT(1) DEFAULT 1,
  fecha_alta DATE NULL,
  observaciones TEXT NULL,
  FOREIGN KEY (zona_id) REFERENCES ZONA(zona_id),
  FOREIGN KEY (tipo_id) REFERENCES TIPO_COMEDOR(tipo_id),
  FOREIGN KEY (subtipo_id) REFERENCES SUBTIPO_COMEDOR(subtipo_id),
  FOREIGN KEY (organismo_id) REFERENCES ORGANISMO(organismo_id),
  UNIQUE KEY unique_numero_oficial (numero_oficial),
  INDEX idx_comedor_zona (zona_id),
  INDEX idx_comedor_tipo (tipo_id)
);

-- 6. RACION
CREATE TABLE IF NOT EXISTS RACION (
  racion_id INT AUTO_INCREMENT PRIMARY KEY,
  comedor_id INT NOT NULL,
  tipo_servicio ENUM('COMIDA','REFRIGERIO','AMBOS') NOT NULL,
  cantidad_beneficiarios INT NULL,
  periodo_inicio DATE NULL,
  periodo_fin DATE NULL,
  plan_ref VARCHAR(30) NULL,
  st DECIMAL(10,2) NULL,
  observaciones TEXT NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE,
  INDEX idx_racion_comedor (comedor_id),
  INDEX idx_racion_plan (plan_ref),
  INDEX idx_racion_periodo (periodo_inicio)
);

-- 7. BENEFICIO_GAS
CREATE TABLE IF NOT EXISTS BENEFICIO_GAS (
  gas_id INT AUTO_INCREMENT PRIMARY KEY,
  comedor_id INT NOT NULL,
  garrafas_10kg INT DEFAULT 0,
  garrafas_15kg INT DEFAULT 0,
  garrafas_45kg INT DEFAULT 0,
  periodo VARCHAR(20) NULL,
  fecha_entrega DATE NULL,
  proveedor VARCHAR(80) NULL,
  nro_vale VARCHAR(30) NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE,
  UNIQUE KEY unique_comedor_periodo (comedor_id, periodo),
  INDEX idx_gas_comedor (comedor_id),
  INDEX idx_gas_periodo (periodo)
);

-- 8. BENEFICIO_LIMPIEZA
CREATE TABLE IF NOT EXISTS BENEFICIO_LIMPIEZA (
  limp_id INT AUTO_INCREMENT PRIMARY KEY,
  comedor_id INT NOT NULL,
  lavandina_4lt INT DEFAULT 0,
  detergente_45lt INT DEFAULT 0,
  desengrasante_5lt INT DEFAULT 0,
  trapo_piso INT DEFAULT 0,
  trapo_rejilla INT DEFAULT 0,
  virulana INT DEFAULT 0,
  esponja INT DEFAULT 0,
  escobillon INT DEFAULT 0,
  escurridor INT DEFAULT 0,
  periodo VARCHAR(20) NULL,
  fecha_entrega DATE NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE,
  UNIQUE KEY unique_comedor_periodo (comedor_id, periodo),
  INDEX idx_limp_comedor (comedor_id),
  INDEX idx_limp_periodo (periodo)
);

-- 9. BENEFICIO_FUMIGACION
CREATE TABLE IF NOT EXISTS BENEFICIO_FUMIGACION (
  fumig_id INT AUTO_INCREMENT PRIMARY KEY,
  comedor_id INT NOT NULL,
  periodo VARCHAR(20) NULL,
  fecha_realizacion DATE NULL,
  proveedor VARCHAR(80) NULL,
  resultado TEXT NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE,
  UNIQUE KEY unique_comedor_periodo (comedor_id, periodo),
  INDEX idx_fumig_comedor (comedor_id),
  INDEX idx_fumig_periodo (periodo)
);

-- 10. BENEFICIO_FRESCOS
CREATE TABLE IF NOT EXISTS BENEFICIO_FRESCOS (
  frescos_id INT AUTO_INCREMENT PRIMARY KEY,
  comedor_id INT NOT NULL,
  cebolla_kg DECIMAL(6,2) DEFAULT 0,
  zanahoria_kg DECIMAL(6,2) DEFAULT 0,
  zapallo_kg DECIMAL(6,2) DEFAULT 0,
  papa_kg DECIMAL(6,2) DEFAULT 0,
  acelga_kg DECIMAL(6,2) DEFAULT 0,
  frutas_unidades INT DEFAULT 0,
  carne_vacuna_kg DECIMAL(6,2) DEFAULT 0,
  pollo_kg DECIMAL(6,2) DEFAULT 0,
  cerdo_kg DECIMAL(6,2) DEFAULT 0,
  periodo VARCHAR(20) NULL,
  semana_inicio DATE NULL,
  proveedor VARCHAR(80) NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE CASCADE,
  UNIQUE KEY unique_comedor_periodo (comedor_id, periodo),
  INDEX idx_frescos_comedor (comedor_id),
  INDEX idx_frescos_periodo (periodo)
);

-- Ajustar columnas a 200 caracteres si la tabla ya existía con tamaños menores
ALTER TABLE COMEDOR MODIFY COLUMN nombre VARCHAR(200) NOT NULL;
ALTER TABLE COMEDOR MODIFY COLUMN telefono VARCHAR(200) NULL;
ALTER TABLE COMEDOR MODIFY COLUMN responsable_nombre VARCHAR(200) NULL;

-- Añadir UNIQUE(comedor_id, periodo) en beneficios si no existe (para re-ejecución idempotente)
ALTER TABLE BENEFICIO_GAS ADD UNIQUE KEY unique_comedor_periodo (comedor_id, periodo);
ALTER TABLE BENEFICIO_LIMPIEZA ADD UNIQUE KEY unique_comedor_periodo (comedor_id, periodo);
ALTER TABLE BENEFICIO_FUMIGACION ADD UNIQUE KEY unique_comedor_periodo (comedor_id, periodo);

-- 11. PRESUPUESTO_CORTE (granularidad temporal para módulo de montos)
CREATE TABLE IF NOT EXISTS PRESUPUESTO_CORTE (
  corte_id INT AUTO_INCREMENT PRIMARY KEY,
  plan_ref VARCHAR(80) NULL,
  anio INT NULL,
  mes TINYINT NULL,
  escala ENUM('DIARIO', 'SEMANAL', 'MENSUAL', 'ANUAL') NOT NULL,
  fecha_ref DATE NULL,
  observaciones VARCHAR(255) NULL,
  UNIQUE KEY unique_corte (plan_ref, anio, mes, escala, fecha_ref),
  INDEX idx_corte_anio_mes (anio, mes),
  INDEX idx_corte_escala (escala)
);

-- 12. PRESUPUESTO_RESUMEN (totales por rubro/subrubro)
CREATE TABLE IF NOT EXISTS PRESUPUESTO_RESUMEN (
  resumen_id INT AUTO_INCREMENT PRIMARY KEY,
  corte_id INT NULL,
  rubro VARCHAR(60) NOT NULL,
  subrubro VARCHAR(80) NULL,
  monto_total DECIMAL(16,3) DEFAULT 0,
  cantidad_total DECIMAL(16,3) DEFAULT 0,
  unidad VARCHAR(20) NULL,
  source_file VARCHAR(160) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corte_id) REFERENCES PRESUPUESTO_CORTE(corte_id) ON DELETE SET NULL,
  UNIQUE KEY unique_resumen_source (source_hash),
  INDEX idx_resumen_rubro (rubro, subrubro),
  INDEX idx_resumen_corte (corte_id)
);

-- 13. PRESUPUESTO_DEPENDENCIA (monto/cantidad por dependencia)
CREATE TABLE IF NOT EXISTS PRESUPUESTO_DEPENDENCIA (
  presupuesto_dep_id INT AUTO_INCREMENT PRIMARY KEY,
  corte_id INT NULL,
  comedor_id INT NULL,
  dependencia_nombre VARCHAR(200) NOT NULL,
  dependencia_tipo VARCHAR(80) NULL,
  ambito ENUM('CAPITAL', 'INTERIOR') NULL,
  rubro VARCHAR(60) NOT NULL,
  subrubro VARCHAR(80) NULL,
  servicio VARCHAR(40) NULL,
  beneficiarios INT NULL,
  cantidad DECIMAL(16,3) DEFAULT 0,
  unidad VARCHAR(20) NULL,
  precio_unitario DECIMAL(16,3) NULL,
  monto DECIMAL(16,3) DEFAULT 0,
  source_file VARCHAR(160) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corte_id) REFERENCES PRESUPUESTO_CORTE(corte_id) ON DELETE SET NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE SET NULL,
  UNIQUE KEY unique_presupuesto_dep_source (source_hash),
  INDEX idx_presupuesto_dep_rubro (rubro, subrubro),
  INDEX idx_presupuesto_dep_comedor (comedor_id),
  INDEX idx_presupuesto_dep_ambito (ambito)
);

-- 14. PRESUPUESTO_ITEM (detalle de item por dependencia o global)
CREATE TABLE IF NOT EXISTS PRESUPUESTO_ITEM (
  presupuesto_item_id INT AUTO_INCREMENT PRIMARY KEY,
  corte_id INT NULL,
  presupuesto_dep_id INT NULL,
  comedor_id INT NULL,
  rubro VARCHAR(60) NOT NULL,
  subrubro VARCHAR(80) NULL,
  item_nombre VARCHAR(120) NOT NULL,
  cantidad DECIMAL(16,3) DEFAULT 0,
  unidad VARCHAR(20) NULL,
  precio_unitario DECIMAL(16,3) NULL,
  monto DECIMAL(16,3) DEFAULT 0,
  metrica_tipo VARCHAR(40) NULL,
  source_file VARCHAR(160) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corte_id) REFERENCES PRESUPUESTO_CORTE(corte_id) ON DELETE SET NULL,
  FOREIGN KEY (presupuesto_dep_id) REFERENCES PRESUPUESTO_DEPENDENCIA(presupuesto_dep_id) ON DELETE SET NULL,
  FOREIGN KEY (comedor_id) REFERENCES COMEDOR(comedor_id) ON DELETE SET NULL,
  UNIQUE KEY unique_presupuesto_item_source (source_hash),
  INDEX idx_presupuesto_item_rubro (rubro, subrubro),
  INDEX idx_presupuesto_item_item (item_nombre),
  INDEX idx_presupuesto_item_dep (presupuesto_dep_id)
);

-- 15. PRESUPUESTO_TEKNOFOOD (totales de cobertura temporal y raciones)
CREATE TABLE IF NOT EXISTS PRESUPUESTO_TEKNOFOOD (
  tekno_id INT AUTO_INCREMENT PRIMARY KEY,
  corte_id INT NULL,
  concepto VARCHAR(80) NOT NULL,
  servicio ENUM('COMIDA', 'REFRIGERIO', 'AMBOS', 'N/A') DEFAULT 'N/A',
  escala ENUM('DIARIO', 'SEMANAL', 'MENSUAL', 'ANUAL') NOT NULL,
  cantidad DECIMAL(20,0) DEFAULT 0,
  cantidad_comida DECIMAL(18,0) NULL,
  cantidad_refrigerio DECIMAL(18,0) NULL,
  precio_unitario DECIMAL(18,2) NULL,
  monto DECIMAL(20,2) DEFAULT 0,
  source_file VARCHAR(160) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corte_id) REFERENCES PRESUPUESTO_CORTE(corte_id) ON DELETE SET NULL,
  UNIQUE KEY unique_tekno_source (source_hash),
  INDEX idx_tekno_concepto (concepto, servicio),
  INDEX idx_tekno_escala (escala)
);

-- 16. BECARIO_LINEA — desglose desde Anexo II (hoja BECARIOS CAPITAL E INTERIOR): montos por área/función y detalle por persona
CREATE TABLE IF NOT EXISTS BECARIO_LINEA (
  linea_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  corte_id INT NULL,
  tipo_linea ENUM('AREA_FUNCION', 'PERSONA') NOT NULL,
  area VARCHAR(200) NULL,
  funcion VARCHAR(120) NULL,
  categoria VARCHAR(40) NULL,
  monto_linea DECIMAL(16,2) NULL,
  orden VARCHAR(50) NULL,
  numero_oficial VARCHAR(20) NULL,
  comedor_nombre VARCHAR(200) NULL,
  domicilio VARCHAR(200) NULL,
  apellido VARCHAR(120) NULL,
  nombre VARCHAR(200) NULL,
  localidad VARCHAR(120) NULL,
  dni VARCHAR(24) NULL,
  ambito ENUM('CAPITAL', 'INTERIOR') NULL,
  area_personal VARCHAR(200) NULL,
  funcion_personal VARCHAR(120) NULL,
  categoria_personal VARCHAR(20) NULL,
  source_file VARCHAR(160) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (corte_id) REFERENCES PRESUPUESTO_CORTE(corte_id) ON DELETE SET NULL,
  UNIQUE KEY unique_becario_linea (source_hash),
  INDEX idx_bl_tipo (tipo_linea),
  INDEX idx_bl_ambito (ambito)
);
