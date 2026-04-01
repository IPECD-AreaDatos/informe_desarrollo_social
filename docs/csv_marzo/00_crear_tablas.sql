-- ============================================================
-- Script MySQL - Seguridad Alimentaria 2026
-- Generado automáticamente desde Excel consolidado
-- ============================================================
CREATE DATABASE IF NOT EXISTS seguridad_alimentaria;
USE seguridad_alimentaria;

DROP TABLE IF EXISTS `dependencias`;
CREATE TABLE `dependencias` (
  id INT,
  nombre VARCHAR(200),
  numero VARCHAR(20),
  tipo VARCHAR(50),
  categoria VARCHAR(100),
  domicilio VARCHAR(255),
  localidad VARCHAR(100),
  departamento VARCHAR(100),
  zona VARCHAR(20),
  region VARCHAR(20),
  responsable VARCHAR(150),
  dni VARCHAR(20),
  telefono VARCHAR(60),
  coordenadas VARCHAR(100),
  enlace_maps VARCHAR(255),
  codigo_ceres VARCHAR(30),
  tipo_receptor VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'dependencias.csv' INTO TABLE `dependencias`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `beneficiarios_por_servicio`;
CREATE TABLE `beneficiarios_por_servicio` (
  cod_ceres VARCHAR(30),
  nombre_dependencia VARCHAR(200),
  zona VARCHAR(20),
  region VARCHAR(60),
  organismo VARCHAR(60),
  tipo_servicio VARCHAR(20),
  cantidad_beneficiarios INT,
  ano YEAR
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'beneficiarios_por_servicio.csv' INTO TABLE `beneficiarios_por_servicio`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `becarios`;
CREATE TABLE `becarios` (
  comedor VARCHAR(150),
  apellido VARCHAR(80),
  nombre VARCHAR(80),
  localidad VARCHAR(60),
  cuil VARCHAR(20),
  area VARCHAR(80),
  funcion VARCHAR(60),
  categoria CHAR(1),
  monto_beca DECIMAL(12,2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'becarios.csv' INTO TABLE `becarios`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `kit_limpieza`;
CREATE TABLE `kit_limpieza` (
  nombre_dependencia VARCHAR(200),
  tipo VARCHAR(40),
  region VARCHAR(20),
  responsable VARCHAR(150),
  dni VARCHAR(20),
  lavandina INT,
  detergente INT,
  desengrasante INT,
  trapo_de_piso INT,
  trapo_rejilla INT,
  lana_de_acero INT,
  esponja_comun INT,
  escobillon INT,
  escurridor INT,
  total_unidades INT,
  frecuencia VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'kit_limpieza.csv' INTO TABLE `kit_limpieza`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `gas_envasado`;
CREATE TABLE `gas_envasado` (
  nombre_dependencia VARCHAR(200),
  numero VARCHAR(20),
  domicilio VARCHAR(255),
  responsable VARCHAR(150),
  dni VARCHAR(20),
  garrafas_10kg INT,
  garrafas_15kg INT,
  garrafas_45kg INT,
  total_kg_equiv INT,
  costo_mensual DECIMAL(12,2),
  costo_anual DECIMAL(14,2),
  frecuencia VARCHAR(20),
  tipo_dependencia VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'gas_envasado.csv' INTO TABLE `gas_envasado`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `carne_semanal`;
CREATE TABLE `carne_semanal` (
  nombre_dependencia VARCHAR(200),
  numero_comedor VARCHAR(20),
  zona VARCHAR(30),
  domicilio VARCHAR(255),
  carne_vacuna_kg_sem DECIMAL(10,2),
  pollo_kg_sem DECIMAL(10,2),
  cerdo_kg_sem DECIMAL(10,2),
  total_kg_sem DECIMAL(10,2),
  total_kg_mes DECIMAL(10,2),
  total_kg_ano DECIMAL(12,2),
  tipo_dependencia VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'carne_semanal.csv' INTO TABLE `carne_semanal`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `frutas_verduras_semanal`;
CREATE TABLE `frutas_verduras_semanal` (
  nombre_dependencia VARCHAR(200),
  numero_comedor VARCHAR(20),
  zona VARCHAR(30),
  domicilio VARCHAR(255),
  cebolla_kg DECIMAL(10,2),
  zanahoria_kg DECIMAL(10,2),
  zapallo_kg DECIMAL(10,2),
  papa_kg DECIMAL(10,2),
  acelga_kg DECIMAL(10,2),
  frutas_unid INT,
  total_verduras_kg_sem DECIMAL(10,2),
  total_verduras_kg_mes DECIMAL(10,2),
  tipo_dependencia VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'frutas_verduras_semanal.csv' INTO TABLE `frutas_verduras_semanal`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `presupuesto_programas`;
CREATE TABLE `presupuesto_programas` (
  programa VARCHAR(100),
  descripcion VARCHAR(255),
  ano YEAR,
  periodicidad VARCHAR(20),
  cantidad_unidades INT,
  precio_unitario DECIMAL(14,2),
  monto_por_periodo DECIMAL(16,2),
  monto_mensual DECIMAL(16,2),
  monto_anual DECIMAL(16,2),
  fuente_financiamiento VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'presupuesto_programas.csv' INTO TABLE `presupuesto_programas`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `resumen_dashboard`;
CREATE TABLE `resumen_dashboard` (
  indicador VARCHAR(150),
  valor DECIMAL(18,2),
  unidad VARCHAR(30)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'resumen_dashboard.csv' INTO TABLE `resumen_dashboard`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `padron_interior`;
CREATE TABLE `padron_interior` (
  zona VARCHAR(10),
  centro_distribucion VARCHAR(200),
  centro_entrega VARCHAR(200),
  direccion VARCHAR(255),
  telefono VARCHAR(80),
  departamento VARCHAR(80),
  localidad VARCHAR(80),
  beneficiarios INT,
  organismo VARCHAR(60),
  servicio VARCHAR(20),
  observaciones VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'padron_interior.csv' INTO TABLE `padron_interior`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `manos_pora`;
CREATE TABLE `manos_pora` (
  localidad VARCHAR(60),
  bases INT,
  beneficiarios INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'manos_pora.csv' INTO TABLE `manos_pora`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;

DROP TABLE IF EXISTS `celiacos`;
CREATE TABLE `celiacos` (
  localidad VARCHAR(80),
  beneficiarios INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- LOAD DATA: LOAD DATA LOCAL INFILE 'celiacos.csv' INTO TABLE `celiacos`
--   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
--   LINES TERMINATED BY '\n' IGNORE 1 ROWS;
