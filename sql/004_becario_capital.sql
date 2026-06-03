-- Becarios de Capital: maestro + liquidación mensual inmutable por periodo
-- Ejecutar antes de scripts/load_becados_capital_csv.ts

CREATE TABLE IF NOT EXISTS BECARIO_CAPITAL (
  becario_id INT NOT NULL AUTO_INCREMENT,
  codigo_csv INT NOT NULL,
  apellido VARCHAR(120) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  localidad VARCHAR(80) NULL,
  funcion VARCHAR(80) NULL,
  PRIMARY KEY (becario_id),
  UNIQUE KEY uk_becario_capital_codigo_csv (codigo_csv),
  KEY idx_becario_capital_apellido (apellido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BECARIO_CAPITAL_LIQUIDACION (
  liquidacion_id INT NOT NULL AUTO_INCREMENT,
  becario_id INT NOT NULL,
  periodo VARCHAR(20) NOT NULL,
  monto_neto DECIMAL(14, 2) NOT NULL,
  cargado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (liquidacion_id),
  UNIQUE KEY uk_becario_liquidacion_periodo (becario_id, periodo),
  KEY idx_liquidacion_periodo (periodo),
  CONSTRAINT fk_liquidacion_becario
    FOREIGN KEY (becario_id) REFERENCES BECARIO_CAPITAL (becario_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
