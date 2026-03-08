export const DICCIONARIO = {
    INSTRUCCION: {
        "1": "Analfabeto/a",
        "2": "Primario Incompleto",
        "3": "Primario en Curso",
        "4": "Primario Completo",
        "5": "Secundario Incompleto",
        "6": "Secundario en Curso",
        "7": "Secundario Completo",
        "8": "Terciario Incompleto",
        "9": "Terciario en Curso",
        "10": "Terciario Completo",
        "11": "Universitario Incompleto",
        "12": "Universitario en Curso",
        "13": "Universitario Completo",
        "14": "Nivel Inicial"
    },
    SITUACION: {
        "1": "Ocupado Dependiente",
        "2": "Ocupado Independiente",
        "3": "Desocupado",
        "4": "Jubilado",
        "5": "Otro"
    },
    SEXO: {
        "1": "Masculino",
        "2": "Femenino",
        "3": "No Binario"
    },
    CONDICION: {
        "1": "Registrado",
        "2": "No Registrado"
    },
    VINCULOS: {
        "1": "Titular",
        "2": "Conyuge",
        "3": "Hijo/a",
        "4": "Hijo/a a fin",
        "5": "Yerno",
        "6": "Nuera",
        "7": "Nieto/a",
        "8": "Madre",
        "9": "Madre a fin",
        "10": "Padre",
        "11": "Padre a fin",
        "12": "Suegro/a",
        "13": "Hermano/a",
        "14": "Hermano/a a fin",
        "15": "Otro familiar",
        "16": "Otro no familiar"
    },
    TIPO_VIVIENDA: {
        "1": "Casa",
        "2": "Departamento",
        "3": "Rancho",
        "4": "Inquilinato o pieza en inquilinato, hotel familiar o pensión",
        "5": "Casilla prefabricada",
        "6": "Local no construido para habitación",
        "7": "Otros"
    },
    TIPO_SANITARIO: {
        "1": "Baño instalado",
        "2": "Letrina",
        "3": "Otro"
    },
    TIPO_TERRENO: {
        "1": "Propia",
        "2": "Alquilado",
        "3": "Prestado",
        "4": "Cedido por trabajo",
        "5": "Otra situación"
    }
};

// Orden lógico de instrucción para visualizaciones
export const ORDEN_INSTRUCCION = [
    "14", // Nivel Inicial
    "1",  // Analfabeto/a
    "2",  // Primario Incompleto
    "3",  // Primario en Curso
    "4",  // Primario Completo
    "5",  // Secundario Incompleto
    "6",  // Secundario en Curso
    "7",  // Secundario Completo
    "8",  // Terciario Incompleto
    "9",  // Terciario en Curso
    "10", // Terciario Completo
    "11", // Universitario Incompleto
    "12", // Universitario en Curso
    "13"  // Universitario Completo
];
